import { useAppStore } from '../store/use-app-store';

export function PrivacyGate() {
    const completeOnboarding = useAppStore((state) => state.completeOnboarding);

    return (
        <div className="privacy-gate-overlay">
            <div className="privacy-gate-container">
                <h1 className="privacy-gate-title">Your words. Your machine. Period.</h1>
                <p className="privacy-gate-body">
                    We couldn't spy on you even if we wanted to. Privacy is a fundamental human right.
                    That's why Glance operates 100% offline. We never send your scripts, usage patterns,
                    or analytics to the Internet.
                </p>

                <div className="privacy-gate-notice">
                    <strong>Crash Reports are Manual</strong>
                    <p>
                        If you experience a bug, you can go to Settings &rarr; "Export Support Logs" to send us a diagnostic file.
                        You have full control over what leaves your computer.
                    </p>
                </div>

                <button
                    className="primary-button privacy-gate-button"
                    onClick={() => {
                        void completeOnboarding();
                    }}
                >
                    Start Reading
                </button>
            </div>
        </div>
    );
}
