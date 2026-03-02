import type { ReactNode } from 'react';
import { useAppLicense } from '../hooks/useAppLicense';
import { Paywall } from './paywall';

interface LicenseGateProps {
  readonly children: ReactNode;
}

export function LicenseGate({ children }: LicenseGateProps) {
  const {
    loading,
    status,
    product,
    actionPending,
    error,
    onPurchase,
    onRestore
  } = useAppLicense();

  if (loading || !status) {
    return (
      <section className="license-loading-screen" aria-live="polite">
        <p>Checking your license...</p>
      </section>
    );
  }

  if (status.state === 'expired') {
    return (
      <Paywall
        pending={actionPending}
        error={error}
        onPurchase={() => {
          void onPurchase();
        }}
        onRestore={() => {
          void onRestore();
        }}
      />
    );
  }

  if (status.state === 'trial') {
    const daysText = status.daysRemaining === 1
      ? '1 day left in your trial'
      : `${status.daysRemaining ?? 0} days left in your trial`;
    const showBanner = (status.daysRemaining ?? 0) <= 3;

    return (
      <>
        {/* 1.2 — Proactive "Buy Now" trial banner — only shown in last 3 days */}
        {showBanner && <div className="license-trial-banner" role="status" aria-live="polite">
          <span className="license-trial-banner__text">{daysText}</span>
          <button
            type="button"
            id="trial-banner-buy-now"
            className="license-trial-banner__cta"
            disabled={actionPending}
            onClick={() => { void onPurchase(); }}
          >
            {actionPending ? 'Processing…' : (product?.priceDisplay ? `Buy — ${product.priceDisplay}` : 'Buy Now')}
          </button>
        </div>}
        {children}
      </>
    );
  }

  return <>{children}</>;
}
