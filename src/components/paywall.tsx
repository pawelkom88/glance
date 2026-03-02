interface PaywallProps {
  readonly priceDisplay: string | null;
  /** True while the store price fetch is still in-flight. */
  readonly priceLoading: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onPurchase: () => void;
  readonly onRestore: () => void;
}

export function Paywall({
  priceDisplay,
  priceLoading,
  pending,
  error,
  onPurchase,
  onRestore
}: PaywallProps) {
  // 3.1 — Determine price display label with skeleton / unavailable states
  const priceLabel = (() => {
    if (priceLoading) {
      // Skeleton shown while network fetch is in progress
      return null;
    }
    if (priceDisplay) {
      return `${priceDisplay} one-time`;
    }
    // fetch completed but returned nothing — still allow purchase (OS sheet shows real price)
    return 'Price unavailable — tap to continue';
  })();

  // Unlock button is disabled while price is still loading or an action is pending
  const unlockDisabled = pending || priceLoading;

  return (
    <section className="license-paywall" aria-labelledby="license-paywall-title">
      <div className="license-paywall-card">
        <p className="license-paywall-eyebrow">Access Required</p>
        <h1 id="license-paywall-title">Your trial has ended</h1>
        <p className="license-paywall-copy">
          Unlock the full app forever with a one-time purchase.
        </p>

        {/* 3.1 — Price skeleton loader */}
        <p className="license-paywall-price" aria-live="polite" aria-busy={priceLoading}>
          {priceLoading
            ? <span className="license-paywall-price-skeleton" aria-label="Loading price…" />
            : priceLabel}
        </p>

        <div className="license-paywall-actions">
          <button
            type="button"
            id="paywall-unlock-button"
            className="license-paywall-primary"
            onClick={onPurchase}
            disabled={unlockDisabled}
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
