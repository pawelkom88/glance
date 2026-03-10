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
    actionPending,
    error,
    trialEnabled,
    onActivate,
    onStartTrial,
  } = useAppLicense();

  const isOverlayWindow = typeof window !== 'undefined' && window.location.hash.includes('overlay');

  if (loading || !status) {
    return (
      <section className="license-loading-screen" aria-live="polite">
        <p>Checking your license...</p>
      </section>
    );
  }

  if (status.state === 'unlicensed' || status.state === 'trial_expired') {
    return (
      <Paywall
        status={status.state}
        trialEnabled={trialEnabled}
        onStartTrial={onStartTrial}
        pending={actionPending}
        error={error}
        onActivate={onActivate}
      />
    );
  }

  return (
    <>
      {children}
      {!isOverlayWindow && status.state === 'trial_active' ? (
        <div className="license-trial-banner" role="status" aria-live="polite">
          <span className="license-trial-banner__text">
            {status.trialDaysRemaining === 1
              ? '1 day left in your 7-day free trial.'
              : `${status.trialDaysRemaining ?? 7} days left in your 7-day free trial.`}
          </span>
        </div>
      ) : null}
    </>
  );
}
