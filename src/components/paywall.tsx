import { useState, type FormEvent } from 'react';
import type { AppLicenseState } from '../types';
import { getAppDisplayName } from '../lib/build-channel';

interface PaywallProps {
  readonly status: AppLicenseState;
  readonly trialEnabled: boolean;
  readonly onStartTrial?: () => Promise<boolean>;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onActivate: (key: string) => Promise<boolean>;
}

function getPaywallCopy(
  status: AppLicenseState,
  trialEnabled: boolean
): { eyebrow: string; title: string; copy: string } {
  if (status === 'trial_expired') {
    return {
      eyebrow: 'Trial Ended',
      title: 'Continue with a paid license',
      copy: 'Your 7-day Product Hunt trial has ended. Enter your paid Glance key to keep this install unlocked.'
    };
  }

  if (trialEnabled) {
    return {
      eyebrow: 'Product Hunt Trial',
      title: `Try ${getAppDisplayName()} free for 7 days`,
      copy: 'Start your free trial instantly, or paste the paid license key you received after purchase. This install will stay unlocked if you activate before the trial ends.'
    };
  }

  return {
    eyebrow: 'License Required',
    title: 'Enter your license key',
    copy: 'Paste the serial key you received after purchase. Glance runs locally after activation, but this device needs an internet connection once to verify the key.'
  };
}

export function Paywall({
  status,
  trialEnabled,
  onStartTrial,
  pending,
  error,
  onActivate
}: PaywallProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const content = getPaywallCopy(status, trialEnabled);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const activated = await onActivate(licenseKey);
    if (activated) {
      setLicenseKey('');
    }
  };

  const showStartTrial = trialEnabled && status === 'unlicensed' && onStartTrial;

  return (
    <section className="license-paywall" aria-labelledby="license-paywall-title">
      <div className="license-paywall-card">
        <p className="license-paywall-eyebrow">{content.eyebrow}</p>
        <h1 id="license-paywall-title">{content.title}</h1>
        <p className="license-paywall-copy">{content.copy}</p>

        <form className="license-paywall-form" onSubmit={handleSubmit}>
          <label className="license-paywall-label" htmlFor="paywall-license-key">
            License key
          </label>
          <textarea
            id="paywall-license-key"
            className="modal-input license-paywall-input"
            value={licenseKey}
            onChange={(event) => {
              setLicenseKey(event.target.value);
            }}
            placeholder="Paste your Glance license key"
            rows={4}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />

          <div className="license-paywall-actions">
            {showStartTrial ? (
              <button
                type="button"
                className="license-paywall-primary"
                disabled={pending}
                onClick={() => {
                  void onStartTrial();
                }}
              >
                {pending ? 'Please wait…' : 'Start 7-day free trial'}
              </button>
            ) : null}
            <button
              type="submit"
              id="paywall-activate-button"
              className={showStartTrial ? 'license-paywall-secondary' : 'license-paywall-primary'}
              disabled={pending}
            >
              {pending ? 'Please wait…' : 'Activate license'}
            </button>
          </div>
        </form>

        {error ? (
          <p className="license-paywall-error" role="alert">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
