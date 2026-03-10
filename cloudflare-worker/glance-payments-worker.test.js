import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './glance-payments-worker.js';

class FakeD1Database {
  constructor() {
    this.licenses = [];
    this.activations = [];
    this.checkoutTransactions = [];
  }

  seedLicense(license) {
    this.licenses.push({
      activation_limit: 2,
      status: 'issued',
      ...license,
    });
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    for (const statement of statements) {
      await statement.run();
    }

    return [];
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    const sql = this.sql;

    if (sql.includes('FROM licenses') && sql.includes('WHERE license_key_hash = ?')) {
      const [licenseKeyHash] = this.params;
      return this.db.licenses.find((license) => license.license_key_hash === licenseKeyHash) ?? null;
    }

    if (
      sql.includes('FROM license_activations')
      && sql.includes('WHERE license_id = ? AND device_id = ? AND revoked_at IS NULL')
    ) {
      const [licenseId, deviceId] = this.params;
      return this.db.activations.find((activation) =>
        activation.license_id === licenseId
        && activation.device_id === deviceId
        && activation.revoked_at === null
      ) ?? null;
    }

    if (
      sql.includes('SELECT COUNT(*) AS count')
      && sql.includes('FROM license_activations')
      && sql.includes('WHERE license_id = ? AND revoked_at IS NULL')
    ) {
      const [licenseId] = this.params;
      const count = this.db.activations.filter((activation) =>
        activation.license_id === licenseId && activation.revoked_at === null
      ).length;
      return { count };
    }

    if (sql.includes('SELECT id FROM licenses WHERE transaction_id = ? LIMIT 1')) {
      const [transactionId] = this.params;
      const license = this.db.licenses.find((entry) => entry.transaction_id === transactionId);
      return license ? { id: license.id } : null;
    }

    if (sql.includes('FROM checkout_transactions') && sql.includes('WHERE transaction_id = ?')) {
      const [transactionId] = this.params;
      return this.db.checkoutTransactions.find((entry) => entry.transaction_id === transactionId) ?? null;
    }

    if (sql.includes('FROM licenses') && sql.includes('WHERE transaction_id = ?')) {
      const [transactionId] = this.params;
      return this.db.licenses.find((entry) => entry.transaction_id === transactionId) ?? null;
    }

    throw new Error(`Unsupported first() query: ${sql}`);
  }

  async run() {
    const sql = this.sql;

    if (sql.includes('INSERT INTO license_activations')) {
      const [id, licenseId, deviceId, platform, activatedAt, lastValidatedAt] = this.params;
      this.db.activations.push({
        id,
        license_id: licenseId,
        device_id: deviceId,
        platform,
        activated_at: activatedAt,
        last_validated_at: lastValidatedAt,
        revoked_at: null,
      });
      return { success: true };
    }

    if (sql.includes('INSERT INTO checkout_transactions')) {
      const [
        transactionId,
        customerId,
        email,
        platform,
        priceIdsJson,
        state,
        lastEventId,
        lastEventType,
        createdAt,
        updatedAt,
      ] = this.params;
      const existing = this.db.checkoutTransactions.find((entry) => entry.transaction_id === transactionId);
      const nextEntry = {
        transaction_id: transactionId,
        customer_id: customerId,
        email: email ?? existing?.email ?? null,
        platform,
        price_ids_json: priceIdsJson,
        state,
        last_event_id: lastEventId,
        last_event_type: lastEventType,
        created_at: existing?.created_at ?? createdAt,
        updated_at: updatedAt,
      };

      if (existing) {
        Object.assign(existing, nextEntry);
      } else {
        this.db.checkoutTransactions.push(nextEntry);
      }

      return { success: true };
    }

    if (sql.includes('INSERT INTO licenses')) {
      const [
        id,
        licenseKeyHash,
        licenseKeyLast4,
        encryptedLicenseKey,
        encryptionKeyVersion,
        transactionId,
        customerId,
        email,
        platform,
        createdAt,
        updatedAt,
      ] = this.params;

      this.db.licenses.push({
        id,
        license_key_hash: licenseKeyHash,
        license_key_last4: licenseKeyLast4,
        encrypted_license_key: encryptedLicenseKey,
        encryption_key_version: encryptionKeyVersion,
        transaction_id: transactionId,
        customer_id: customerId,
        email,
        platform,
        status: 'issued',
        activation_limit: 2,
        created_at: createdAt,
        updated_at: updatedAt,
      });

      return { success: true };
    }

    if (sql.includes("UPDATE licenses") && sql.includes("SET status = 'active', updated_at = ?")) {
      const [updatedAt, licenseId] = this.params;
      const license = this.db.licenses.find((entry) => entry.id === licenseId);
      if (license) {
        license.status = 'active';
        license.updated_at = updatedAt;
      }
      return { success: true };
    }

    if (sql.includes('UPDATE checkout_transactions') && sql.includes('SET email = ?, updated_at = ?')) {
      const [email, updatedAt, transactionId] = this.params;
      const transaction = this.db.checkoutTransactions.find((entry) => entry.transaction_id === transactionId);
      if (transaction) {
        transaction.email = email;
        transaction.updated_at = updatedAt;
      }
      return { success: true };
    }

    if (sql.includes('UPDATE licenses') && sql.includes('SET email = ?, updated_at = ?')) {
      const [email, updatedAt, transactionId] = this.params;
      const license = this.db.licenses.find((entry) => entry.transaction_id === transactionId);
      if (license) {
        license.email = email;
        license.updated_at = updatedAt;
      }
      return { success: true };
    }

    if (sql.includes('UPDATE license_activations') && sql.includes('SET last_validated_at = ?')) {
      const [lastValidatedAt, activationId] = this.params;
      const activation = this.db.activations.find((entry) => entry.id === activationId);
      if (activation) {
        activation.last_validated_at = lastValidatedAt;
      }
      return { success: true };
    }

    throw new Error(`Unsupported run() query: ${sql}`);
  }
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function computeHmacHex(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function encryptLicenseKeyForTest(licenseKey, secret) {
  const encoder = new TextEncoder();
  const secretDigest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const key = await crypto.subtle.importKey(
    'raw',
    secretDigest,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const iv = new Uint8Array(12);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoder.encode(licenseKey)
  );

  return `v1:${Buffer.from(iv).toString('base64')}:${Buffer.from(new Uint8Array(ciphertext)).toString('base64')}`;
}

async function createRequest(path, body) {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function responseJson(response) {
  return response.json();
}

class FakeKVNamespace {
  constructor() {
    this.values = new Map();
  }

  async get(key, type) {
    if (!this.values.has(key)) {
      return null;
    }

    const value = this.values.get(key);
    if (type === 'json') {
      return JSON.parse(value);
    }

    return value;
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }
}

function createEnv(db) {
  return {
    DB: db,
    KV: new FakeKVNamespace(),
    LICENSE_ACTIVATION_PRIVATE_KEY: '11'.repeat(32),
    LICENSE_ENCRYPTION_KEY: 'test-encryption-secret',
    PADDLE_WEBHOOK_SECRET: 'test-webhook-secret',
    PADDLE_API_KEY: '',
    MAC_PRICE_ID: 'pri_mac',
    WINDOWS_PRICE_ID: 'pri_win',
  };
}

async function withMockFetch(mockFetch, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function createWebhookRequest(payload, secret) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await computeHmacHex(secret, `${timestamp}:${rawBody}`);

  return new Request('https://example.com/paddle/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Paddle-Signature': `ts=${timestamp};h1=${signature}`,
    },
    body: rawBody,
  });
}

test('redeem creates a first activation for a new device', async () => {
  const db = new FakeD1Database();
  db.seedLicense({
    id: 'license-1',
    license_key_hash: await sha256Hex('GLANCE-ABCD-EFGH-IJKL'),
    license_key_last4: 'IJKL',
    platform: 'macos',
  });

  const response = await worker.fetch(
    await createRequest('/license/redeem', {
      licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
      deviceId: 'device-123',
      platform: 'macos',
    }),
    createEnv(db)
  );
  const payload = await responseJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.license.licenseKeyLast4, 'IJKL');
  assert.equal(db.activations.length, 1);
  assert.equal(db.activations[0].device_id, 'device-123');
});

test('validate returns activation_not_found when the device was never activated', async () => {
  const db = new FakeD1Database();
  db.seedLicense({
    id: 'license-1',
    license_key_hash: await sha256Hex('GLANCE-ABCD-EFGH-IJKL'),
    license_key_last4: 'IJKL',
    platform: 'macos',
  });

  const response = await worker.fetch(
    await createRequest('/license/validate', {
      licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
      deviceId: 'device-123',
      platform: 'macos',
    }),
    createEnv(db)
  );
  const payload = await responseJson(response);

  assert.equal(response.status, 404);
  assert.deepEqual(payload, {
    ok: false,
    error: 'activation_not_found',
  });
  assert.equal(db.activations.length, 0);
});

test('validate refreshes an existing activation without creating a new one', async () => {
  const db = new FakeD1Database();
  db.seedLicense({
    id: 'license-1',
    license_key_hash: await sha256Hex('GLANCE-ABCD-EFGH-IJKL'),
    license_key_last4: 'IJKL',
    platform: 'macos',
    status: 'active',
  });
  db.activations.push({
    id: 'activation-1',
    license_id: 'license-1',
    device_id: 'device-123',
    platform: 'macos',
    activated_at: '2026-03-10T12:00:00Z',
    last_validated_at: '2026-03-10T12:00:00Z',
    revoked_at: null,
  });

  const response = await worker.fetch(
    await createRequest('/license/validate', {
      licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
      deviceId: 'device-123',
      platform: 'macos',
    }),
    createEnv(db)
  );
  const payload = await responseJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(db.activations.length, 1);
  assert.notEqual(db.activations[0].last_validated_at, '2026-03-10T12:00:00Z');
});

test('completed webhook dual-writes checkout status to D1 and KV', async () => {
  const db = new FakeD1Database();
  const env = createEnv(db);
  const response = await worker.fetch(
    await createWebhookRequest({
      event_id: 'evt_123',
      event_type: 'transaction.completed',
      data: {
        id: 'txn_123',
        customer_id: 'ctm_123',
        items: [{ price: { id: 'pri_mac' } }],
      },
    }, env.PADDLE_WEBHOOK_SECRET),
    env
  );
  const payload = await responseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { received: true });
  assert.equal(db.checkoutTransactions.length, 1);
  assert.equal(db.checkoutTransactions[0].transaction_id, 'txn_123');
  assert.equal(db.checkoutTransactions[0].state, 'completed');
  assert.equal(db.licenses.length, 1);
  assert.equal(JSON.parse(env.KV.values.get('txn:txn_123')).state, 'completed');
  assert.equal(env.KV.values.get('event:evt_123'), 'transaction.completed');
});

test('checkout-status prefers D1 over stale KV data', async () => {
  const db = new FakeD1Database();
  db.checkoutTransactions.push({
    transaction_id: 'txn_123',
    customer_id: 'ctm_123',
    email: null,
    platform: 'macos',
    price_ids_json: '["pri_mac"]',
    state: 'completed',
    last_event_id: 'evt_123',
    last_event_type: 'transaction.completed',
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:01:00Z',
  });
  const env = createEnv(db);
  await env.KV.put('txn:txn_123', JSON.stringify({
    transactionId: 'txn_123',
    state: 'pending',
    platform: 'macos',
    updatedAt: '2026-03-10T11:59:00Z',
  }));

  const response = await worker.fetch(
    new Request('https://example.com/checkout-status?transaction_id=txn_123'),
    env
  );
  const payload = await responseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    transactionId: 'txn_123',
    state: 'completed',
    platform: 'macos',
    updatedAt: '2026-03-10T12:01:00Z',
  });
});

test('license-reveal succeeds from D1 completed status even if KV is missing', async () => {
  const encryptedLicenseKey = await encryptLicenseKeyForTest('GLANCE-ABCD-EFGH-IJKL', 'test-encryption-secret');
  const db = new FakeD1Database();
  db.checkoutTransactions.push({
    transaction_id: 'txn_123',
    customer_id: 'ctm_123',
    email: null,
    platform: 'macos',
    price_ids_json: '["pri_mac"]',
    state: 'completed',
    last_event_id: 'evt_123',
    last_event_type: 'transaction.completed',
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:01:00Z',
  });
  db.licenses.push({
    id: 'license-1',
    license_key_hash: 'hash',
    license_key_last4: 'IJKL',
    encrypted_license_key: encryptedLicenseKey,
    encryption_key_version: 'v1',
    transaction_id: 'txn_123',
    customer_id: 'ctm_123',
    email: null,
    platform: 'macos',
    status: 'issued',
    activation_limit: 2,
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:01:00Z',
  });
  const env = createEnv(db);
  const response = await worker.fetch(
    new Request('https://example.com/license/reveal?transaction_id=txn_123'),
    env
  );
  const payload = await responseJson(response);

  assert.equal(response.status, 200);
  assert.equal(payload.transactionId, 'txn_123');
  assert.equal(payload.platform, 'macos');
  assert.equal(payload.licenseKey, 'GLANCE-ABCD-EFGH-IJKL');
  assert.equal(payload.licenseKeyLast4, 'IJKL');
});

test('checkout-status reconciles a paid Paddle transaction before the webhook arrives', async () => {
  const db = new FakeD1Database();
  const env = {
    ...createEnv(db),
    PADDLE_API_KEY: 'pdl_sdbx_test_123',
  };

  const response = await withMockFetch(async (input) => {
    assert.equal(String(input), 'https://sandbox-api.paddle.com/transactions/txn_123');

    return new Response(JSON.stringify({
      data: {
        id: 'txn_123',
        status: 'paid',
        customer_id: 'ctm_123',
        items: [{ price: { id: 'pri_mac' } }],
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  }, async () => worker.fetch(
    new Request('https://example.com/checkout-status?transaction_id=txn_123'),
    env
  ));
  const payload = await responseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    transactionId: 'txn_123',
    state: 'completed',
    platform: 'macos',
    updatedAt: payload.updatedAt,
  });
  assert.equal(db.checkoutTransactions.length, 1);
  assert.equal(db.checkoutTransactions[0].state, 'completed');
  assert.equal(db.licenses.length, 1);
  assert.equal(JSON.parse(env.KV.values.get('txn:txn_123')).state, 'completed');
});
