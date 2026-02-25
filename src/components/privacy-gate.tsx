import { useAppStore } from '../store/use-app-store';

function ArrowRightIcon() {
    return (
        <svg className="privacy-gate-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="m13 7 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    );
}

function PadlockIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7.5 10V7.5a4.5 4.5 0 1 1 9 0V10" fill="none" stroke="#D48F00" strokeWidth="1.8" strokeLinecap="round" />
            <rect x="5" y="10" width="14" height="10" rx="2.5" fill="none" stroke="#D48F00" strokeWidth="1.8" />
            <circle cx="12" cy="15" r="1.2" fill="#D48F00" />
        </svg>
    );
}

export function PrivacyGate() {
    const completeOnboarding = useAppStore((state) => state.completeOnboarding);

    return (
        <div className="privacy-gate-overlay">
            <div className="privacy-gate-container">
                <div className="privacy-gate-icon-container">
                    <img width={75} height={75} src="/src-tauri/icons/Square142x142Logo.png" alt="Glance logo" />
                    <span className="privacy-gate-icon-title">Glance</span>
                </div>
                <h1 className="privacy-gate-title">Read your script. <br /> <span className="privacy-gate-title-sub">Keep your eyes forward.</span></h1>
                <p className="privacy-gate-body">
                    A local-first teleprompter for presenters who care about eye contact — and their privacy.
                </p>

                <div className="privacy-gate-notice">
                    <span className="privacy-gate-notice-icon">
                        <PadlockIcon />
                    </span>
                    <div className="privacy-gate-notice-copy">
                        <strong>100% local. Zero telemetry.</strong>
                        <p>
                            Your scripts never leave this machine. If you hit a bug, crash reports are entirely manual and opt-in via Settings → Export Logs.
                        </p>
                    </div>
                </div>

                <button
                    className="primary-button privacy-gate-button"
                    onClick={() => {
                        void completeOnboarding();
                    }}
                >
                    <span>Get Started</span>
                    <ArrowRightIcon />
                </button>
                <p className="privacy-gate-footer">No account. No subscription. No internet required.</p>
            </div>
        </div>
    );
}