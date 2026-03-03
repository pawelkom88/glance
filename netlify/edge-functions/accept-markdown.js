const MARKDOWN_MEDIA_TYPE = "text/markdown";

function parseAcceptHeader(acceptHeader) {
  if (!acceptHeader) {
    return [];
  }

  return acceptHeader
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawType, ...params] = entry.split(";").map((part) => part.trim().toLowerCase());
      const quality = params.find((param) => param.startsWith("q="));
      const qValue = quality ? Number.parseFloat(quality.slice(2)) : 1;

      return {
        type: rawType,
        quality: Number.isFinite(qValue) ? qValue : 1,
      };
    })
    .sort((left, right) => right.quality - left.quality);
}

function prefersMarkdownOverHtml(acceptHeader) {
  const acceptedTypes = parseAcceptHeader(acceptHeader);
  const markdown = acceptedTypes.find((item) => item.type === MARKDOWN_MEDIA_TYPE);
  const html = acceptedTypes.find((item) => item.type === "text/html");

  if (!markdown) {
    return false;
  }

  return !html || markdown.quality >= html.quality;
}

function appendVaryHeader(headers, value) {
  const varyValue = headers.get("Vary");

  if (!varyValue) {
    headers.set("Vary", value);
    return;
  }

  const varyParts = varyValue.split(",").map((part) => part.trim().toLowerCase());
  if (!varyParts.includes(value.toLowerCase())) {
    headers.set("Vary", `${varyValue}, ${value}`);
  }
}

function withHeaders(response, mutateHeaders) {
  const headers = new Headers(response.headers);
  mutateHeaders(headers);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// buildCandidates function removed as it is no longer used

function isSuccess(status) {
  // Allow 2xx status codes and 304 Not Modified.
  // We specifically avoid 301/302 redirects, which can cause infinite loops
  // if Netlify's "Pretty URLs" feature tries to redirect .html back to the clean URL.
  return (status >= 200 && status < 300) || status === 304;
}

/**
 * Attempt a rewrite to the flat file first (e.g. /docs.html).
 * Only fall through to the index form if that fails.
 * Returns null when neither candidate resolves successfully.
 */
async function rewriteFlat(context, pathname, extension) {
  // Already has extension – just try it directly
  if (pathname.endsWith(extension)) {
    const r = await context.rewrite(pathname);
    return isSuccess(r.status) ? r : null;
  }

  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  // 1. Try flat file: /docs.html
  const flatCandidate = normalizedPath === "/" ? `/index${extension}` : `${normalizedPath}${extension}`;
  const flatResponse = await context.rewrite(flatCandidate);
  if (isSuccess(flatResponse.status)) {
    return flatResponse;
  }

  // 2. Fall back to directory index: /docs/index.html
  if (normalizedPath !== "/") {
    const indexCandidate = `${normalizedPath}/index${extension}`;
    const indexResponse = await context.rewrite(indexCandidate);
    if (isSuccess(indexResponse.status)) {
      return indexResponse;
    }
  }

  return null;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const isAssetPath = /\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith(".html");
  if (isAssetPath || pathname.startsWith("/.netlify")) {
    return context.next();
  }

  const acceptsMarkdown = prefersMarkdownOverHtml(request.headers.get("accept"));

  if (acceptsMarkdown) {
    // Try flat .md first (e.g. /docs.md), then /docs/index.md
    const markdownResponse = await rewriteFlat(context, pathname, ".md");
    if (markdownResponse) {
      return withHeaders(markdownResponse, (headers) => {
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        headers.set("X-Content-Type-Options", "nosniff");
        appendVaryHeader(headers, "Accept");
      });
    }
  }

  // Always try flat .html first (e.g. /docs.html), then /docs/index.html.
  // This is the critical fix: legacy stand-alone pages (/docs, /privacy,
  // /refund, /terms) live as flat HTML files and must not be shadowed by the
  // /path/index.html resolution that Netlify's directory serving would prefer.
  const htmlResponse = await rewriteFlat(context, pathname, ".html");
  if (htmlResponse) {
    return withHeaders(htmlResponse, (headers) => {
      appendVaryHeader(headers, "Accept");
    });
  }

  const fallbackResponse = await context.next();
  return withHeaders(fallbackResponse, (headers) => {
    appendVaryHeader(headers, "Accept");
  });
};
