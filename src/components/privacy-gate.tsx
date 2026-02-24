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

            <GlanceIcon />
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
                    <ArrowRightIcon/>
                </button>
                <p className="privacy-gate-footer">No account. No subscription. No internet required.</p>
            </div>
        </div>
    );
}


function GlanceIcon(){
    return (
        <svg className="privacy-gate-logo" width="60" height="60" viewBox="144 144 736 736" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id="bgGrad" x1="170" y1="120" x2="854" y2="920" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#F4F6FB"/>
                    <stop offset="1" stop-color="#E9EDF6"/>
                </linearGradient>
                <linearGradient id="glyphGrad" x1="350" y1="340" x2="700" y2="675" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#49A9FF"/>
                    <stop offset="1" stop-color="#157CFF"/>
                </linearGradient>
                <radialGradient id="innerGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(512 760) rotate(90) scale(250 420)">
                    <stop stop-color="#C8D7F5" stop-opacity="0.6"/>
                    <stop offset="1" stop-color="#C8D7F5" stop-opacity="0"/>
                </radialGradient>
                <filter id="surfaceShadow" x="120" y="120" width="784" height="784" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#A9B7D4" flood-opacity="0.35"/>
                </filter>
                <filter id="glyphShadow" x="220" y="290" width="584" height="430" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#157CFF" flood-opacity="0.20"/>
                </filter>
            </defs>

            <g filter="url(#surfaceShadow)">
                <rect x="144" y="144" width="736" height="736" rx="168" fill="url(#bgGrad)"/>
                <rect x="147" y="147" width="730" height="730" rx="165" stroke="#CED6E7" stroke-width="6"/>
                <rect x="164" y="164" width="696" height="696" rx="146" stroke="white" stroke-opacity="0.75" stroke-width="2"/>
            </g>
            <g filter="url(#glyphShadow)">
                <path d="M254 526C334 425 426 373 512 373C598 373 690 425 770 526C690 627 598 679 512 679C426 679 334 627 254 526Z" stroke="url(#glyphGrad)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>

                <path d="M512 422C570 422 618 468 618 526C618 584 570 630 512 630C496 630 481 626 468 619L430 623L442 587C428 570 420 549 420 526C420 468 468 422 512 422Z" fill="url(#glyphGrad)"/>
            </g>
        </svg>
    )
}
