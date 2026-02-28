import { useI18n } from '../i18n/use-i18n';
import { useAppStore } from '../store/use-app-store';

const glanceLogo = new URL('../../src-tauri/icons/Square142x142Logo.png', import.meta.url).href;

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
    const { t } = useI18n();
    const completeOnboarding = useAppStore((state) => state.completeOnboarding);

    return (
        <div className="privacy-gate-overlay">
            <div className="privacy-gate-container">
                <div className="privacy-gate-icon-container">
                    <img width={75} height={75} src={glanceLogo} alt={t('privacy.logoAlt')} />
                    <span className="privacy-gate-icon-title">{t('privacy.wordmark')}</span>
                </div>
                <h1 className="privacy-gate-title">{t('privacy.heroLead')} <br /> <span className="privacy-gate-title-sub">{t('privacy.heroSub')}</span></h1>
                <p className="privacy-gate-body">
                    {t('privacy.body')}
                </p>

                <div className="privacy-gate-notice">
                    <span className="privacy-gate-notice-icon">
                        <PadlockIcon />
                    </span>
                    <div className="privacy-gate-notice-copy">
                        <strong>{t('privacy.noticeTitle')}</strong>
                        <p>
                            {t('privacy.noticeBody')}
                        </p>
                    </div>
                </div>

                <button
                    className="primary-button privacy-gate-button"
                    onClick={() => {
                        void completeOnboarding();
                    }}
                >
                    <span>{t('privacy.getStarted')}</span>
                    <ArrowRightIcon />
                </button>
                <p className="privacy-gate-footer">{t('privacy.footer')}</p>
            </div>
        </div>
    );
}
