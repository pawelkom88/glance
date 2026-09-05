import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/commissioner';
import '@fontsource-variable/commissioner/slnt.css';
import '@fontsource-variable/lexend';
import '@fontsource-variable/atkinson-hyperlegible-next';
import App from './App';
import { LicenseGate } from './components/license-gate';
import { SplashScreen } from './components/SplashScreen';
import { SplashProvider, useSplashContext } from './contexts/SplashContext';
import './app.css';

function AppBootstrap() {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const { isAppReady } = useSplashContext();
  const isOverlayWindow = typeof window !== 'undefined' && window.location.hash.includes('overlay');

  const hideSplash = useCallback(() => {
    setIsSplashVisible(false);
  }, []);

  if (isOverlayWindow) {
    // The main window already gates access to the app. Re-running license
    // bootstrap inside the secondary overlay window can strand Windows users on
    // a blank loading surface if storage or network checks stall during launch.
    return <App />;
  }

  return (
    <LicenseGate>
      <div className="app-bootstrap">
        <App />
        {isSplashVisible ? <SplashScreen onReady={hideSplash} isAppReady={isAppReady} /> : null}
      </div>
    </LicenseGate>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SplashProvider>
      <AppBootstrap />
    </SplashProvider>
  </React.StrictMode>
);
