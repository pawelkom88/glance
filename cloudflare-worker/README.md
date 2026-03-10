## Glance Payments Worker

Deploy [glance-payments-worker.js](/Users/pawelkomorkiewicz/PERSONAL/glance/cloudflare-worker/glance-payments-worker.js) to your Cloudflare Worker.

### Bindings

- `KV`: KV namespace for webhook dedupe and checkout transaction status
- `DB`: D1 database for licenses and activations

### Secrets

- `PADDLE_WEBHOOK_SECRET`: Paddle notification destination secret
- `PADDLE_API_KEY`: Paddle server API key with at least `Customers: Read`
- `LICENSE_ENCRYPTION_KEY`: strong random secret used to encrypt recoverable license keys

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
  - validates a license key and activates it for a device
- `GET /healthz`

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
