import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface SplashContextValue {
  readonly isAppReady: boolean;
  readonly signalReady: () => void;
}

const noop = () => undefined;

const SplashContext = createContext<SplashContextValue>({
  isAppReady: false,
  signalReady: noop
});

interface SplashProviderProps {
  readonly children: ReactNode;
}

export function SplashProvider({ children }: SplashProviderProps) {
  const [isAppReady, setIsAppReady] = useState(false);
  const hasSignaledReadyRef = useRef(false);

  const signalReady = useCallback(() => {
    if (hasSignaledReadyRef.current) {
      return;
    }

    hasSignaledReadyRef.current = true;
    setIsAppReady(true);
  }, []);

  const value = useMemo(
    () => ({ isAppReady, signalReady }),
    [isAppReady, signalReady]
  );

  return <SplashContext.Provider value={value}>{children}</SplashContext.Provider>;
}

export function useSplashContext(): SplashContextValue {
  return useContext(SplashContext);
}
