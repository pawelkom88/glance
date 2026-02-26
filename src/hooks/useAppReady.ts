import { useSplashContext } from '../contexts/SplashContext';

export function useAppReady(): () => void {
  const { signalReady } = useSplashContext();
  return signalReady;
}
