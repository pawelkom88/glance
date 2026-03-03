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

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const isAssetPath = /\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith(".html");
  if (isAssetPath || pathname.startsWith("/.netlify")) {
    return context.next();
  }

  const htmlPath =
    pathname === "/"
      ? "/index.html"
      : pathname.endsWith(".html")
        ? pathname
        : `${pathname}.html`;
  const markdownPath = htmlPath.replace(/\.html$/i, ".md");

  const acceptsMarkdown = prefersMarkdownOverHtml(request.headers.get("accept"));

  if (acceptsMarkdown) {
    const markdownResponse = await context.rewrite(markdownPath);
    if (markdownResponse.status < 400) {
      return withHeaders(markdownResponse, (headers) => {
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        headers.set("X-Content-Type-Options", "nosniff");
        appendVaryHeader(headers, "Accept");
      });
    }
  }

  const htmlResponse = await context.rewrite(htmlPath);
  return withHeaders(htmlResponse, (headers) => {
    appendVaryHeader(headers, "Accept");
  });
};
