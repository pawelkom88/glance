CREATE TABLE IF NOT EXISTS checkout_transactions (
  transaction_id TEXT PRIMARY KEY,
  customer_id TEXT,
  email TEXT,
  platform TEXT,
  price_ids_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'failed')),
  last_event_id TEXT NOT NULL,
  last_event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
)
SELECT
  transaction_id,
  customer_id,
  email,
  platform,
  '[]',
  'completed',
  'backfill',
  'transaction.completed',
  created_at,
  updated_at
FROM licenses
WHERE transaction_id IS NOT NULL
ON CONFLICT(transaction_id) DO NOTHING;
