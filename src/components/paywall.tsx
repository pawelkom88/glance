interface PaywallProps {
  readonly pending: boolean;
  readonly error: string | null;
  readonly onPurchase: () => void;
  readonly onRestore: () => void;
}

export function Paywall({
  pending,
  error,
  onPurchase,
  onRestore
}: PaywallProps) {

  return (
    <section className="license-paywall" aria-labelledby="license-paywall-title">
      <div className="license-paywall-card">
        <p className="license-paywall-eyebrow">Access Required</p>
        <h1 id="license-paywall-title">Your trial has ended</h1>
        <p className="license-paywall-copy">
          Unlock the full app forever with a one-time purchase.
        </p>

        <div className="license-paywall-actions">
          <button
            type="button"
            id="paywall-unlock-button"
            className="license-paywall-primary"
            onClick={onPurchase}
            disabled={pending}
          >
            {pending ? 'Processing…' : 'Unlock Forever'}
          </button>
          <button
            type="button"
            id="paywall-restore-button"
            className="license-paywall-secondary"
            onClick={onRestore}
            disabled={pending}
          >
            Restore Purchase
          </button>
        </div>

        {error ? (
          <p className="license-paywall-error" role="alert">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
