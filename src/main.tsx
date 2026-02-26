import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/commissioner';
import '@fontsource-variable/commissioner/slnt.css';
import App from './App';
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
    return <App />;
  }

  return (
    <div className="app-bootstrap">
      <App />
      {isSplashVisible ? <SplashScreen onReady={hideSplash} isAppReady={isAppReady} /> : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SplashProvider>
      <AppBootstrap />
    </SplashProvider>
  </React.StrictMode>
);
