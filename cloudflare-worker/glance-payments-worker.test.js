import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './glance-payments-worker.js';

class FakeD1Database {
  constructor() {
    this.licenses = [];
    this.activations = [];
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

    if (sql.includes("UPDATE licenses") && sql.includes("SET status = 'active', updated_at = ?")) {
      const [updatedAt, licenseId] = this.params;
      const license = this.db.licenses.find((entry) => entry.id === licenseId);
      if (license) {
        license.status = 'active';
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

function createEnv(db) {
  return {
    DB: db,
    LICENSE_ACTIVATION_PRIVATE_KEY: '11'.repeat(32),
  };
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
