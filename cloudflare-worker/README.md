## Glance Payments Worker

Deploy [glance-payments-worker.js](/Users/pawelkomorkiewicz/PERSONAL/glance/cloudflare-worker/glance-payments-worker.js) to your Cloudflare Worker.

### Bindings

- `KV`: KV namespace for webhook dedupe and checkout transaction status
- `DB`: D1 database for licenses and activations

### Secrets

- `PADDLE_WEBHOOK_SECRET`: Paddle notification destination secret
- `PADDLE_API_KEY`: Paddle server API key with at least `Customers: Read`
- `LICENSE_ENCRYPTION_KEY`: strong random secret used to encrypt recoverable license keys
- `LICENSE_ACTIVATION_PRIVATE_KEY`: 32-byte Ed25519 private key seed in hex, used to sign offline activation tokens

### Plaintext variables

- `ALLOWED_ORIGINS`: comma-separated browser origins allowed to call the Worker
- `MAC_PRICE_ID`: trusted Paddle Mac price id
- `WINDOWS_PRICE_ID`: trusted Paddle Windows price id
- `PADDLE_WEBHOOK_TOLERANCE_SECONDS`: optional webhook timestamp tolerance, defaults to `30`

### Routes

- `POST /paddle/webhook`
  - verifies Paddle signatures
  - deduplicates webhook events
  - derives platform from trusted price ids
  - issues licenses in D1
- `GET /checkout-status?transaction_id=txn_...`
  - returns checkout verification status for the docs flow
- `GET /license/reveal?transaction_id=txn_...`
  - decrypts and returns the issued license key for a verified completed transaction
- `POST /license/redeem`
  - validates a license key, activates it for a device, and returns a signed activation token for offline launches
- `POST /license/validate`
  - validates an existing device activation in D1, refreshes `last_validated_at`, and returns a fresh signed activation token without creating a new activation
- `GET /healthz`

### License flow

- `POST /license/redeem` is the explicit activation path.
  - Use it for first-time activation on a device or a deliberate replacement activation from the app UI.
  - It may create a new `license_activations` row if the device has not been activated yet.
- `POST /license/validate` is the existing-device refresh path.
  - Use it when the desktop app already has a saved key and needs to refresh or recheck an activation.
  - It must never create a new `license_activations` row.
  - If the device has never been activated, it returns `activation_not_found`.
- The desktop app verifies signed activation tokens locally.
  - A valid local token unlocks startup immediately, including offline launches.
  - The app may call `/license/validate` in the background to refresh the token and detect revocations.

### D1 schema

The Worker expects:

- `licenses`
- `license_activations`

And currently keeps legacy migration tables from sandbox work:

- `licenses_legacy`
- `license_activations_legacy`

### Current sandbox config

Recommended `ALLOWED_ORIGINS`:

```text
https://atglance.app,https://www.atglance.app,http://127.0.0.1:5500,http://localhost:5500,http://localhost:1420,tauri://localhost,http://tauri.localhost
```

Sandbox trusted price ids:

```text
MAC_PRICE_ID=pri_01kk9wcy5j7a693sv9hjnymehx
WINDOWS_PRICE_ID=pri_01kk9xwtfq4hvgzxzz4y4ppqs7
PADDLE_WEBHOOK_TOLERANCE_SECONDS=30
```

### Go live

To switch from sandbox to live, keep the code the same and replace only:

- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_API_KEY`
- `MAC_PRICE_ID`
- `WINDOWS_PRICE_ID`
- frontend Paddle client token

### Desktop build config

Build the Tauri app with `GLANCE_LICENSE_PUBLIC_KEY` set to the matching Ed25519 public key in hex. The desktop app uses that public key to verify signed activation tokens locally after the first activation.
