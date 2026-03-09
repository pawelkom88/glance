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
    onActivate,
  } = useAppLicense();

  if (loading || !status) {
    return (
      <section className="license-loading-screen" aria-live="polite">
        <p>Checking your license...</p>
      </section>
    );
  }

  if (status.state === 'unlicensed') {
    return (
      <Paywall
        pending={actionPending}
        error={error}
        onActivate={onActivate}
      />
    );
  }

  return <>{children}</>;
}
