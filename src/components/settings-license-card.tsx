import type { FormEvent } from 'react';
import type { AppLicenseStatus } from '../types';

interface SettingsLicenseCardProps {
  readonly status: AppLicenseStatus;
  readonly licenseKeyInput: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onInputChange: (value: string) => void;
  readonly onActivate: (licenseKey: string) => Promise<void> | void;
  readonly onCancel: () => void;
}

function LicenseStatusIcon({ licensed }: { readonly licensed: boolean }) {
  if (licensed) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 12.5L9.5 17L19 7.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V13" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V13" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function SettingsLicenseCard({
  status,
  licenseKeyInput,
  pending,
  error,
  onInputChange,
  onActivate,
  onCancel
}: SettingsLicenseCardProps) {
  const isLicensed = status.state === 'licensed';
  const licenseId = status.licenseId;
  const statusTitle = isLicensed ? 'License active' : 'License key required';
  const statusMessage = isLicensed
    ? `This device is unlocked${licenseId ? ` with a key ending in ${licenseId}.` : '.'}`
    : 'Paste the serial key you received after purchase to unlock the app.';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onActivate(licenseKeyInput);
  };

  return (
    <section className="settings-group" aria-labelledby="support-license">
      <div className="settings-card settings-license-card">
        <h3 id="support-license" className="settings-group-label settings-license-card__eyebrow">License</h3>

        <div className="settings-license-card__status">
          <div
            className={`settings-license-card__status-icon ${isLicensed ? 'is-active' : 'is-inactive'}`}
            aria-hidden="true"
          >
            <LicenseStatusIcon licensed={isLicensed} />
          </div>
          <div className="settings-license-card__status-copy">
            <p className="settings-license-card__status-title">{statusTitle}</p>
            <p className="settings-license-card__status-message">{statusMessage}</p>
          </div>
        </div>

        <div className="settings-license-card__divider" aria-hidden="true" />

        <form className="settings-license-card__form" onSubmit={handleSubmit}>
          <label className="settings-license-card__field-label" htmlFor="settings-license-key">
            License Key
          </label>
          <input
            id="settings-license-key"
            className="modal-input settings-license-card__input"
            type="text"
            value={licenseKeyInput}
            onChange={(event) => {
              onInputChange(event.target.value);
            }}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />

          {isLicensed && licenseId ? (
            <div className="settings-license-card__warning" role="note">
              <div className="settings-license-card__warning-icon" aria-hidden="true">
                <WarningIcon />
              </div>
              <p className="settings-license-card__warning-text">
                This will replace your current license key ending in {licenseId}.
              </p>
            </div>
          ) : null}

          <div className="settings-license-card__actions">
            <button
              type="button"
              className="settings-license-card__cancel-button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="settings-activate-license-button"
              className="primary-button settings-license-card__activate-button"
              disabled={pending}
            >
              {pending ? 'Activating…' : 'Activate License'}
            </button>
          </div>
        </form>

        {error ? (
          <p className="settings-license-error" role="alert">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
