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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (request.method === "POST" && url.pathname === "/paddle/webhook") {
      return handlePaddleWebhook(request, env, ctx);
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

    if (request.method === "POST" && url.pathname === "/license/validate") {
      return handleLicenseValidate(request, env);
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "glance-payments" }, 200, request, env);
    }

    return json({ error: "Not found" }, 404, request, env);
  },
};

async function handlePaddleWebhook(request, env, ctx) {
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
  const waitUntil = typeof ctx?.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : null;

  let record;

  if (eventType === "transaction.completed") {
    const productInfo = resolveLicensedProduct(priceIds, env);

    if (!productInfo) {
      await env.KV.put(dedupeKey, "ignored_unknown_price", {
        expirationTtl: 60 * 60 * 24 * 30,
      });
      return json({ received: true, ignored: true }, 200, request, env);
    }

    const pendingTimestamp = new Date().toISOString();
    await upsertCheckoutTransaction(env, {
      transactionId,
      customerId,
      email: null,
      platform: productInfo.platform,
      priceIds,
      state: "pending",
      lastEventId: eventId,
      lastEventType: eventType,
      createdAt: pendingTimestamp,
      updatedAt: pendingTimestamp,
    });

    record = {
      transactionId,
      customerId,
      email: null,
      platform: productInfo.platform,
      priceIds,
      state: "completed",
      updatedAt: pendingTimestamp,
    };

    await issueLicenseForTransaction(env, {
      transactionId,
      customerId,
      email: null,
      platform: productInfo.platform,
    });

    const completedTimestamp = new Date().toISOString();
    record.updatedAt = completedTimestamp;
    await upsertCheckoutTransaction(env, {
      transactionId,
      customerId,
      email: null,
      platform: productInfo.platform,
      priceIds,
      state: "completed",
      lastEventId: eventId,
      lastEventType: eventType,
      createdAt: completedTimestamp,
      updatedAt: completedTimestamp,
    });

    if (customerId && env.PADDLE_API_KEY && waitUntil) {
      waitUntil(enrichCheckoutTransactionEmail(env, {
        transactionId,
        customerId,
      }));
    }
  } else if (
    eventType === "transaction.payment_failed" ||
    eventType === "transaction.canceled"
  ) {
    const productInfo = resolveLicensedProduct(priceIds, env);
    const failedTimestamp = new Date().toISOString();

    record = {
      transactionId,
      customerId,
      email: null,
      platform: productInfo?.platform || null,
      priceIds,
      state: "failed",
      updatedAt: failedTimestamp,
    };

    await upsertCheckoutTransaction(env, {
      transactionId,
      customerId,
      email: null,
      platform: productInfo?.platform || null,
      priceIds,
      state: "failed",
      lastEventId: eventId,
      lastEventType: eventType,
      createdAt: failedTimestamp,
      updatedAt: failedTimestamp,
    });
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

  let record = await loadCheckoutTransaction(env, transactionId);

  if (!record || record.state === "pending") {
    record = await reconcileCheckoutTransaction(env, transactionId, record);
  }

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

  const transactionRecord = await loadCheckoutTransaction(env, transactionId);

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

  if (!env.LICENSE_ACTIVATION_PRIVATE_KEY) {
    return json({ ok: false, error: "server_not_configured" }, 500, request, env);
  }

  const parsedRequest = await parseLicenseRequest(request, env);
  if (parsedRequest.response) {
    return parsedRequest.response;
  }

  const { licenseKey, deviceId, platform } = parsedRequest;
  const license = await loadLicenseByKey(env, licenseKey);

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

  if (existingActivation) {
    const now = new Date().toISOString();
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
      await buildLicenseActivationPayload(env, license, deviceId, now),
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

  const now = new Date().toISOString();
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
    await buildLicenseActivationPayload(env, license, deviceId, now),
    200,
    request,
    env
  );
}

async function handleLicenseValidate(request, env) {
  if (!env.DB) {
    return json({ ok: false, error: "server_not_configured" }, 500, request, env);
  }

  if (!env.LICENSE_ACTIVATION_PRIVATE_KEY) {
    return json({ ok: false, error: "server_not_configured" }, 500, request, env);
  }

  const parsedRequest = await parseLicenseRequest(request, env);
  if (parsedRequest.response) {
    return parsedRequest.response;
  }

  const { licenseKey, deviceId, platform } = parsedRequest;
  const license = await loadLicenseByKey(env, licenseKey);

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

  if (!existingActivation) {
    return json({ ok: false, error: "activation_not_found" }, 404, request, env);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare(`
        UPDATE license_activations
        SET last_validated_at = ?
        WHERE id = ?
      `)
      .bind(now, existingActivation.id),
    env.DB
      .prepare(`
        UPDATE licenses
        SET status = 'active', updated_at = ?
        WHERE id = ? AND status = 'issued'
      `)
      .bind(now, license.id),
  ]);

  return json(
    await buildLicenseActivationPayload(env, license, deviceId, now),
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

async function fetchPaddleTransaction(transactionId, apiKey) {
  const baseUrl = apiKey.includes("_sdbx_")
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";

  const response = await fetch(`${baseUrl}/transactions/${transactionId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`transaction_lookup_failed:${response.status}`);
  }

  const payload = await response.json();
  return payload?.data || null;
}

async function upsertCheckoutTransaction(env, transaction) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }

  await env.DB
    .prepare(`
      INSERT INTO checkout_transactions (
        transaction_id,
        customer_id,
        email,
        platform,
        price_ids_json,
        state,
        last_event_id,
        last_event_type,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        customer_id = excluded.customer_id,
        email = COALESCE(excluded.email, checkout_transactions.email),
        platform = excluded.platform,
        price_ids_json = excluded.price_ids_json,
        state = excluded.state,
        last_event_id = excluded.last_event_id,
        last_event_type = excluded.last_event_type,
        updated_at = excluded.updated_at
    `)
    .bind(
      transaction.transactionId,
      transaction.customerId,
      transaction.email,
      transaction.platform,
      JSON.stringify(transaction.priceIds || []),
      transaction.state,
      transaction.lastEventId,
      transaction.lastEventType,
      transaction.createdAt,
      transaction.updatedAt
    )
    .run();
}

async function reconcileCheckoutTransaction(env, transactionId, existingRecord) {
  if (!env.DB || !env.PADDLE_API_KEY) {
    return existingRecord ?? null;
  }

  try {
    const paddleTransaction = await fetchPaddleTransaction(transactionId, env.PADDLE_API_KEY);

    if (!paddleTransaction) {
      return existingRecord ?? null;
    }

    const customerId = paddleTransaction.customer_id || existingRecord?.customerId || null;
    const priceIds = extractPriceIds(paddleTransaction.items);
    const productInfo = resolveLicensedProduct(priceIds, env);
    const updatedAt = new Date().toISOString();
    const createdAt = existingRecord?.createdAt || updatedAt;

    if (!productInfo) {
      return existingRecord ?? null;
    }

    if (paddleTransaction.status === "paid" || paddleTransaction.status === "completed") {
      await issueLicenseForTransaction(env, {
        transactionId,
        customerId,
        email: existingRecord?.email || null,
        platform: productInfo.platform,
      });

      const completedRecord = {
        transactionId,
        customerId,
        email: existingRecord?.email || null,
        platform: productInfo.platform,
        priceIds,
        state: "completed",
        updatedAt,
        createdAt,
      };

      await upsertCheckoutTransaction(env, {
        ...completedRecord,
        lastEventId: existingRecord?.lastEventId || "paddle_api_reconcile",
        lastEventType: existingRecord?.lastEventType || `transaction.${paddleTransaction.status}`,
      });

      if (env.KV) {
        await env.KV.put(`txn:${transactionId}`, JSON.stringify(completedRecord));
      }

      return completedRecord;
    }

    if (paddleTransaction.status === "past_due" || paddleTransaction.status === "canceled") {
      const failedRecord = {
        transactionId,
        customerId,
        email: existingRecord?.email || null,
        platform: productInfo.platform,
        priceIds,
        state: "failed",
        updatedAt,
        createdAt,
      };

      await upsertCheckoutTransaction(env, {
        ...failedRecord,
        lastEventId: existingRecord?.lastEventId || "paddle_api_reconcile",
        lastEventType: existingRecord?.lastEventType || `transaction.${paddleTransaction.status}`,
      });

      if (env.KV) {
        await env.KV.put(`txn:${transactionId}`, JSON.stringify(failedRecord));
      }

      return failedRecord;
    }

    const pendingRecord = {
      transactionId,
      customerId,
      email: existingRecord?.email || null,
      platform: productInfo.platform,
      priceIds,
      state: "pending",
      updatedAt,
      createdAt,
    };

    await upsertCheckoutTransaction(env, {
      ...pendingRecord,
      lastEventId: existingRecord?.lastEventId || "paddle_api_reconcile",
      lastEventType: existingRecord?.lastEventType || `transaction.${paddleTransaction.status || "updated"}`,
    });

    return pendingRecord;
  } catch (error) {
    console.log(
      `transaction_reconcile_failed transactionId=${transactionId} message=${error instanceof Error ? error.message : "unknown"}`
    );
    return existingRecord ?? null;
  }
}

async function loadCheckoutTransaction(env, transactionId) {
  const d1Record = await env.DB
    .prepare(`
      SELECT
        transaction_id,
        customer_id,
        email,
        platform,
        price_ids_json,
        state,
        last_event_id,
        last_event_type,
        created_at,
        updated_at
      FROM checkout_transactions
      WHERE transaction_id = ?
      LIMIT 1
    `)
    .bind(transactionId)
    .first();

  if (d1Record) {
    return {
      transactionId: d1Record.transaction_id,
      customerId: d1Record.customer_id,
      email: d1Record.email,
      platform: d1Record.platform || null,
      priceIds: parsePriceIdsJson(d1Record.price_ids_json),
      state: d1Record.state,
      createdAt: d1Record.created_at,
      updatedAt: d1Record.updated_at,
      lastEventId: d1Record.last_event_id,
      lastEventType: d1Record.last_event_type,
    };
  }

  if (!env.KV) {
    return null;
  }

  return env.KV.get(`txn:${transactionId}`, "json");
}

function parsePriceIdsJson(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function enrichCheckoutTransactionEmail(env, input) {
  try {
    const email = await fetchCustomerEmail(input.customerId, env.PADDLE_API_KEY);

    if (!email) {
      return;
    }

    await env.DB.batch([
      env.DB
        .prepare(`
          UPDATE checkout_transactions
          SET email = ?, updated_at = ?
          WHERE transaction_id = ?
        `)
        .bind(email, new Date().toISOString(), input.transactionId),
      env.DB
        .prepare(`
          UPDATE licenses
          SET email = ?, updated_at = ?
          WHERE transaction_id = ?
        `)
        .bind(email, new Date().toISOString(), input.transactionId),
    ]);
  } catch (error) {
    console.log(
      `transaction_email_enrichment_failed transactionId=${input.transactionId} customerId=${input.customerId} message=${error instanceof Error ? error.message : "unknown"}`
    );
  }
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

async function parseLicenseRequest(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return {
      response: json({ ok: false, error: "invalid_json" }, 400, request, env),
    };
  }

  const licenseKey = normalizeLicenseKey(body?.licenseKey);
  const deviceId = normalizeDeviceId(body?.deviceId);
  const platform = normalizePlatform(body?.platform);

  if (!licenseKey) {
    return {
      response: json({ ok: false, error: "missing_license_key" }, 400, request, env),
    };
  }

  if (!deviceId) {
    return {
      response: json({ ok: false, error: "missing_device_id" }, 400, request, env),
    };
  }

  if (!platform) {
    return {
      response: json({ ok: false, error: "invalid_platform" }, 400, request, env),
    };
  }

  return {
    licenseKey,
    deviceId,
    platform,
  };
}

async function loadLicenseByKey(env, licenseKey) {
  const licenseKeyHash = await sha256Hex(licenseKey);

  return env.DB
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
}

async function buildLicenseActivationPayload(env, license, deviceId, issuedAt) {
  const activationToken = await signActivationToken(
    {
      version: 1,
      licenseId: license.license_key_last4,
      deviceId,
      platform: license.platform,
      issuedAt,
    },
    env.LICENSE_ACTIVATION_PRIVATE_KEY
  );

  return {
    ok: true,
    license: {
      platform: license.platform,
      status: "active",
      licenseKeyLast4: license.license_key_last4,
      activationToken,
      activationIssuedAt: issuedAt,
    },
  };
}

async function sha256Hex(value) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bufferToHex(digest);
}

async function signActivationToken(claims, privateKeyHex) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(claims));
  const signingKey = await importActivationSigningKey(privateKeyHex);
  const signature = await crypto.subtle.sign("Ed25519", signingKey, payloadBytes);

  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
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

async function importActivationSigningKey(privateKeyHex) {
  const privateKey = hexToBytes(privateKeyHex);
  if (privateKey.length !== 32) {
    throw new Error("LICENSE_ACTIVATION_PRIVATE_KEY must be a 32-byte Ed25519 seed.");
  }

  return crypto.subtle.importKey(
    "pkcs8",
    ed25519SeedToPkcs8(privateKey),
    { name: "Ed25519" },
    false,
    ["sign"]
  );
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

function base64UrlEncode(bytes) {
  return base64Encode(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64Decode(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function hexToBytes(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Expected an even-length hexadecimal string.");
  }

  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
}

function ed25519SeedToPkcs8(seed) {
  const prefix = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(prefix.length + seed.length);
  pkcs8.set(prefix, 0);
  pkcs8.set(seed, prefix.length);
  return pkcs8.buffer;
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
