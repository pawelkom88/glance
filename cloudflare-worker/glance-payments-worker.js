const DEFAULT_ALLOWED_ORIGINS = [
  "https://atglance.app",
  "https://www.atglance.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4175",
  "http://127.0.0.1:4175",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 30;
const LICENSE_KEY_VERSION = "v1";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (request.method === "POST" && url.pathname === "/paddle/webhook") {
      return handlePaddleWebhook(request, env);
    }

    if (request.method === "GET" && url.pathname === "/checkout-status") {
      return handleCheckoutStatus(request, env);
    }

    if (request.method === "GET" && url.pathname === "/license/reveal") {
      return handleLicenseReveal(request, env);
    }

    if (request.method === "POST" && url.pathname === "/license/redeem") {
      return handleLicenseRedeem(request, env);
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "glance-payments" }, 200, request, env);
    }

    return json({ error: "Not found" }, 404, request, env);
  },
};

async function handlePaddleWebhook(request, env) {
  if (!env.PADDLE_WEBHOOK_SECRET) {
    return json({ error: "Webhook secret is not configured" }, 500, request, env);
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Paddle-Signature");

  if (!signatureHeader) {
    return json({ error: "Missing Paddle-Signature header" }, 400, request, env);
  }

  const isValidSignature = await verifyPaddleSignature(
    rawBody,
    signatureHeader,
    env.PADDLE_WEBHOOK_SECRET,
    Number(env.PADDLE_WEBHOOK_TOLERANCE_SECONDS || DEFAULT_WEBHOOK_TOLERANCE_SECONDS)
  );

  if (!isValidSignature) {
    return json({ error: "Invalid webhook signature" }, 401, request, env);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body" }, 400, request, env);
  }

  const eventId = payload?.event_id;
  const eventType = payload?.event_type;
  const data = payload?.data;

  if (!eventId || !eventType || !data?.id) {
    return json({ error: "Invalid Paddle event payload" }, 400, request, env);
  }

  const dedupeKey = `event:${eventId}`;
  const alreadyProcessed = await env.KV.get(dedupeKey);

  if (alreadyProcessed) {
    return json({ received: true, duplicate: true }, 200, request, env);
  }

  const transactionId = data.id;
  const customerId = data.customer_id || null;
  const priceIds = extractPriceIds(data?.items);

  let record;

  if (eventType === "transaction.completed") {
    const productInfo = resolveLicensedProduct(priceIds, env);

    if (!productInfo) {
      await env.KV.put(dedupeKey, "ignored_unknown_price", {
        expirationTtl: 60 * 60 * 24 * 30,
      });
      return json({ received: true, ignored: true }, 200, request, env);
    }

    const email =
      customerId && env.PADDLE_API_KEY
        ? await fetchCustomerEmail(customerId, env.PADDLE_API_KEY)
        : null;

    record = {
      transactionId,
      customerId,
      email,
      platform: productInfo.platform,
      priceIds,
      state: "completed",
      updatedAt: new Date().toISOString(),
    };

    await issueLicenseForTransaction(env, {
      transactionId,
      customerId,
      email,
      platform: productInfo.platform,
    });
  } else if (
    eventType === "transaction.payment_failed" ||
    eventType === "transaction.canceled"
  ) {
    const productInfo = resolveLicensedProduct(priceIds, env);

    record = {
      transactionId,
      customerId,
      email: null,
      platform: productInfo?.platform || null,
      priceIds,
      state: "failed",
      updatedAt: new Date().toISOString(),
    };
  } else {
    await env.KV.put(dedupeKey, eventType, {
      expirationTtl: 60 * 60 * 24 * 30,
    });
    return json({ received: true, ignored: true }, 200, request, env);
  }

  await env.KV.put(`txn:${transactionId}`, JSON.stringify(record));
  await env.KV.put(dedupeKey, eventType, {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  if (customerId) {
    await env.KV.put(`customer:${customerId}`, JSON.stringify(record));
  }

  if (record.email) {
    await env.KV.put(`email:${record.email.toLowerCase()}`, JSON.stringify(record));
  }

  return json({ received: true }, 200, request, env);
}

async function handleCheckoutStatus(request, env) {
  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transaction_id");

  if (!transactionId || !/^txn_[A-Za-z0-9]+$/.test(transactionId)) {
    return json({ error: "Invalid transaction_id" }, 400, request, env);
  }

  const record = await env.KV.get(`txn:${transactionId}`, "json");

  if (!record) {
    return json(
      {
        transactionId,
        state: "not_found",
      },
      200,
      request,
      env
    );
  }

  return json(
    {
      transactionId,
      state: record.state,
      platform: record.platform || null,
      updatedAt: record.updatedAt,
    },
    200,
    request,
    env
  );
}

async function handleLicenseReveal(request, env) {
  if (!env.DB) {
    return json({ error: "D1 binding DB is not configured" }, 500, request, env);
  }

  if (!env.LICENSE_ENCRYPTION_KEY) {
    return json({ error: "LICENSE_ENCRYPTION_KEY is not configured" }, 500, request, env);
  }

  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transaction_id");

  if (!transactionId || !/^txn_[A-Za-z0-9]+$/.test(transactionId)) {
    return json({ error: "Invalid transaction_id" }, 400, request, env);
  }

  const transactionRecord = await env.KV.get(`txn:${transactionId}`, "json");

  if (!transactionRecord || transactionRecord.state !== "completed") {
    return json({ error: "License not available" }, 404, request, env);
  }

  const license = await env.DB
    .prepare(`
      SELECT
        transaction_id,
        email,
        platform,
        encrypted_license_key,
        encryption_key_version,
        license_key_last4,
        status
      FROM licenses
      WHERE transaction_id = ?
      LIMIT 1
    `)
    .bind(transactionId)
    .first();

  if (!license || license.status === "revoked" || !license.encrypted_license_key) {
    return json({ error: "License not available" }, 404, request, env);
  }

  const licenseKey = await decryptLicenseKey(
    license.encrypted_license_key,
    env.LICENSE_ENCRYPTION_KEY
  );

  return json(
    {
      transactionId: license.transaction_id,
      email: license.email || null,
      platform: license.platform,
      licenseKey,
      licenseKeyLast4: license.license_key_last4,
    },
    200,
    request,
    env
  );
}

async function handleLicenseRedeem(request, env) {
  if (!env.DB) {
    return json({ ok: false, error: "server_not_configured" }, 500, request, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, request, env);
  }

  const licenseKey = normalizeLicenseKey(body?.licenseKey);
  const deviceId = normalizeDeviceId(body?.deviceId);
  const platform = normalizePlatform(body?.platform);

  if (!licenseKey) {
    return json({ ok: false, error: "missing_license_key" }, 400, request, env);
  }

  if (!deviceId) {
    return json({ ok: false, error: "missing_device_id" }, 400, request, env);
  }

  if (!platform) {
    return json({ ok: false, error: "invalid_platform" }, 400, request, env);
  }

  const licenseKeyHash = await sha256Hex(licenseKey);

  const license = await env.DB
    .prepare(`
      SELECT
        id,
        platform,
        status,
        activation_limit,
        license_key_last4
      FROM licenses
      WHERE license_key_hash = ?
      LIMIT 1
    `)
    .bind(licenseKeyHash)
    .first();

  if (!license) {
    return json({ ok: false, error: "invalid_license" }, 404, request, env);
  }

  if (license.status === "revoked") {
    return json({ ok: false, error: "revoked_license" }, 403, request, env);
  }

  if (license.platform !== platform) {
    return json({ ok: false, error: "wrong_platform" }, 403, request, env);
  }

  const existingActivation = await env.DB
    .prepare(`
      SELECT id
      FROM license_activations
      WHERE license_id = ? AND device_id = ? AND revoked_at IS NULL
      LIMIT 1
    `)
    .bind(license.id, deviceId)
    .first();

  const now = new Date().toISOString();

  if (existingActivation) {
    await env.DB
      .prepare(`
        UPDATE license_activations
        SET last_validated_at = ?
        WHERE id = ?
      `)
      .bind(now, existingActivation.id)
      .run();

    if (license.status === "issued") {
      await env.DB
        .prepare(`
          UPDATE licenses
          SET status = 'active', updated_at = ?
          WHERE id = ?
        `)
        .bind(now, license.id)
        .run();
    }

    return json(
      {
        ok: true,
        license: {
          platform: license.platform,
          status: "active",
          licenseKeyLast4: license.license_key_last4,
        },
      },
      200,
      request,
      env
    );
  }

  const activationCountRow = await env.DB
    .prepare(`
      SELECT COUNT(*) AS count
      FROM license_activations
      WHERE license_id = ? AND revoked_at IS NULL
    `)
    .bind(license.id)
    .first();

  const activationCount = Number(activationCountRow?.count || 0);

  if (activationCount >= Number(license.activation_limit || 0)) {
    return json({ ok: false, error: "activation_limit_reached" }, 403, request, env);
  }

  await env.DB.batch([
    env.DB
      .prepare(`
        INSERT INTO license_activations (
          id,
          license_id,
          device_id,
          platform,
          activated_at,
          last_validated_at,
          revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)
      `)
      .bind(
        crypto.randomUUID(),
        license.id,
        deviceId,
        platform,
        now,
        now
      ),
    env.DB
      .prepare(`
        UPDATE licenses
        SET status = 'active', updated_at = ?
        WHERE id = ?
      `)
      .bind(now, license.id),
  ]);

  return json(
    {
      ok: true,
      license: {
        platform: license.platform,
        status: "active",
        licenseKeyLast4: license.license_key_last4,
      },
    },
    200,
    request,
    env
  );
}

function extractPriceIds(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => item?.price?.id)
    .filter(Boolean);
}

function resolveLicensedProduct(priceIds, env) {
  const allowed = new Map([
    [env.MAC_PRICE_ID, "macos"],
    [env.WINDOWS_PRICE_ID, "windows"],
  ]);

  const matchedPriceIds = priceIds.filter((priceId) => allowed.has(priceId));

  if (matchedPriceIds.length !== 1) {
    return null;
  }

  const matchedPriceId = matchedPriceIds[0];

  return {
    priceId: matchedPriceId,
    platform: allowed.get(matchedPriceId),
  };
}

async function fetchCustomerEmail(customerId, apiKey) {
  const baseUrl = apiKey.includes("_sdbx_")
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";

  const response = await fetch(`${baseUrl}/customers/${customerId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.log(`customer_lookup_failed status=${response.status} customerId=${customerId}`);
    return null;
  }

  const payload = await response.json();
  return payload?.data?.email || null;
}

async function issueLicenseForTransaction(env, input) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }

  if (!env.LICENSE_ENCRYPTION_KEY) {
    throw new Error("LICENSE_ENCRYPTION_KEY is not configured");
  }

  const existing = await env.DB
    .prepare("SELECT id FROM licenses WHERE transaction_id = ? LIMIT 1")
    .bind(input.transactionId)
    .first();

  if (existing) {
    return existing.id;
  }

  const rawLicenseKey = generateLicenseKey();
  const normalizedLicenseKey = normalizeLicenseKey(rawLicenseKey);
  const licenseKeyHash = await sha256Hex(normalizedLicenseKey);
  const licenseKeyLast4 = normalizedLicenseKey.slice(-4);
  const encryptedLicenseKey = await encryptLicenseKey(
    rawLicenseKey,
    env.LICENSE_ENCRYPTION_KEY
  );

  const now = new Date().toISOString();
  const licenseId = crypto.randomUUID();

  await env.DB
    .prepare(`
      INSERT INTO licenses (
        id,
        license_key_hash,
        license_key_last4,
        encrypted_license_key,
        encryption_key_version,
        transaction_id,
        customer_id,
        email,
        platform,
        status,
        activation_limit,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', 2, ?, ?)
    `)
    .bind(
      licenseId,
      licenseKeyHash,
      licenseKeyLast4,
      encryptedLicenseKey,
      LICENSE_KEY_VERSION,
      input.transactionId,
      input.customerId,
      input.email,
      input.platform,
      now,
      now
    )
    .run();

  return {
    id: licenseId,
    plaintextLicenseKey: rawLicenseKey,
  };
}

function generateLicenseKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const parts = [];

  for (let partIndex = 0; partIndex < 4; partIndex += 1) {
    let part = "";

    for (let charIndex = 0; charIndex < 4; charIndex += 1) {
      const randomIndex =
        crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length;
      part += alphabet[randomIndex];
    }

    parts.push(part);
  }

  return `GLANCE-${parts.join("-")}`;
}

function normalizeLicenseKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeDeviceId(value) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 && normalized.length <= 255 ? normalized : null;
}

function normalizePlatform(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "macos" || normalized === "windows" ? normalized : null;
}

async function sha256Hex(value) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bufferToHex(digest);
}

async function encryptLicenseKey(licenseKey, secret) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoder.encode(licenseKey)
  );

  return `${LICENSE_KEY_VERSION}:${base64Encode(iv)}:${base64Encode(new Uint8Array(ciphertext))}`;
}

async function decryptLicenseKey(payload, secret) {
  const parts = String(payload || "").split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted license payload");
  }

  const [version, ivBase64, ciphertextBase64] = parts;

  if (version !== LICENSE_KEY_VERSION) {
    throw new Error("Unsupported encryption key version");
  }

  const iv = base64Decode(ivBase64);
  const ciphertext = base64Decode(ciphertextBase64);
  const key = await deriveAesKey(secret);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

async function deriveAesKey(secret) {
  const encoder = new TextEncoder();
  const secretHash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));

  return crypto.subtle.importKey(
    "raw",
    secretHash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function verifyPaddleSignature(rawBody, signatureHeader, secret, toleranceSeconds) {
  const parts = signatureHeader.split(";").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("ts="))?.slice(3);
  const signatures = parts
    .filter((part) => part.startsWith("h1="))
    .map((part) => part.slice(3))
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const sentAtSeconds = Number(timestamp);

  if (!Number.isFinite(sentAtSeconds)) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - sentAtSeconds);

  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}:${rawBody}`;
  const expectedSignature = await computeHmacHex(secret, signedPayload);

  return signatures.some((signature) => timingSafeEqual(signature, expectedSignature));
}

async function computeHmacHex(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bufferToHex(signature);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64Encode(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64Decode(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request, env),
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!origin) {
    return headers;
  }

  if (!isAllowedOrigin(origin, env)) {
    return headers;
  }

  return {
    ...headers,
    "Access-Control-Allow-Origin": origin,
  };
}

function isAllowedOrigin(origin, env) {
  const configuredOrigins =
    typeof env.ALLOWED_ORIGINS === "string" && env.ALLOWED_ORIGINS.length > 0
      ? env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_ORIGINS;

  return configuredOrigins.includes(origin);
}

do u need anything else ? 





























​






​
 



































​




​
 


​










​


​


​



​












ժմ to=functions.exec_command  天天中彩票提款json
{"cmd":"git status --short cloudflare-worker && sed -n '1,260p' cloudflare-worker/README.md","workdir":"/Users/pawelkomorkiewicz/PERSONAL/glance","max_output_tokens":4000}  sextreff to=functions.exec_command.commentary code
Chunk ID: 9fb740
Wall time: 0.0523 seconds
Process exited with code 0
Original token count: 210
Output:
?? cloudflare-worker/
## Glance Payments Worker

Deploy [glance-payments-worker.js](/Users/pawelkomorkiewicz/PERSONAL/glance/cloudflare-worker/glance-payments-worker.js) to your Cloudflare Worker and configure these bindings:

- `KV`: KV namespace for transaction records
- `PADDLE_WEBHOOK_SECRET`: Paddle notification destination secret
- `PADDLE_API_KEY`: Paddle server API key with `Customers: Read`
- `ALLOWED_ORIGINS`: comma-separated allowed browser origins for `GET /checkout-status`
- `PADDLE_WEBHOOK_TOLERANCE_SECONDS`: optional webhook timestamp tolerance, defaults to `30`

Worker routes:

- `POST /paddle/webhook`
- `GET /checkout-status?transaction_id=txn_...`
- `GET /healthz`

Recommended `ALLOWED_ORIGINS` value:

```text
https://atglance.app,https://www.atglance.app,http://localhost:4173,http://127.0.0.1:4173,http://localhost:4175,http://127.0.0.1:4175,http://localhost:5500,http://127.0.0.1:5500
```
