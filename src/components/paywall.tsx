import { useState, type FormEvent } from 'react';

interface PaywallProps {
  readonly pending: boolean;
  readonly error: string | null;
  readonly onActivate: (key: string) => Promise<boolean>;
}

export function Paywall({ pending, error, onActivate }: PaywallProps) {
  const [licenseKey, setLicenseKey] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const activated = await onActivate(licenseKey);
    if (activated) {
      setLicenseKey('');
    }
  };

  return (
    <section className="license-paywall" aria-labelledby="license-paywall-title">
      <div className="license-paywall-card">
        <p className="license-paywall-eyebrow">License Required</p>
        <h1 id="license-paywall-title">Enter your license key</h1>
        <p className="license-paywall-copy">
          Paste the serial key you received after purchase. Glance runs locally after activation,
          but this device needs an internet connection once to verify the key.
        </p>

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
            <button
              type="submit"
              id="paywall-activate-button"
              className="license-paywall-primary"
              disabled={pending}
            >
              {pending ? 'Activating…' : 'Activate license'}
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
