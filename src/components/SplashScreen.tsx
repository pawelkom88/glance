import { useCallback, useEffect, useRef, useState } from 'react';
import { useSplashContext } from '../contexts/SplashContext';
import { emitAppReady } from '../lib/tauri';

const glanceLogo = new URL('../../src-tauri/icons/Square142x142Logo.png', import.meta.url).href;

const enterAnimationMs = 400;
const minimumDisplayMs = 800;
const maximumDisplayMs = 2500;
const exitAnimationMs = 350;

type SplashPhase = 'entering' | 'holding' | 'exiting';

interface SplashScreenProps {
  readonly onReady: () => void;
  readonly isAppReady: boolean;
}

function currentTimestampMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

export function SplashScreen({ onReady, isAppReady }: SplashScreenProps) {
  const [phase, setPhase] = useState<SplashPhase>('entering');
  const [isWordmarkVisible, setIsWordmarkVisible] = useState(false);
  const { isAppReady: isContextReady } = useSplashContext();

  const mountedAtRef = useRef(currentTimestampMs());
  const hasStartedExitRef = useRef(false);
  const hasEmittedWindowReadyRef = useRef(false);

  const effectiveAppReady = isAppReady || isContextReady;

  const beginExit = useCallback(() => {
    if (hasStartedExitRef.current) {
      return;
    }

    hasStartedExitRef.current = true;
    setPhase('exiting');
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsWordmarkVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const entryId = window.setTimeout(() => {
      setPhase('holding');
    }, enterAnimationMs);

    return () => {
      window.clearTimeout(entryId);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'holding' || hasEmittedWindowReadyRef.current) {
      return;
    }

    hasEmittedWindowReadyRef.current = true;
    const frameId = window.requestAnimationFrame(() => {
      void emitAppReady();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [phase]);

  useEffect(() => {
    const forceExitId = window.setTimeout(() => {
      beginExit();
    }, maximumDisplayMs);

    return () => {
      window.clearTimeout(forceExitId);
    };
  }, [beginExit]);

  useEffect(() => {
    if (!effectiveAppReady || hasStartedExitRef.current) {
      return;
    }

    const elapsed = currentTimestampMs() - mountedAtRef.current;
    const delay = Math.max(0, minimumDisplayMs - elapsed);
    const exitId = window.setTimeout(() => {
      beginExit();
    }, delay);

    return () => {
      window.clearTimeout(exitId);
    };
  }, [beginExit, effectiveAppReady]);

  useEffect(() => {
    if (phase !== 'exiting') {
      return;
    }

    const finishId = window.setTimeout(() => {
      onReady();
    }, exitAnimationMs);

    return () => {
      window.clearTimeout(finishId);
    };
  }, [onReady, phase]);

  return (
    <div className={`splash-screen splash-screen--${phase}`} aria-hidden={phase === 'exiting'}>
      <div className={`splash-screen__brand ${isWordmarkVisible ? 'is-visible' : ''}`}>
        <img className="splash-screen__logo" src={glanceLogo} width={68} height={68} alt="Glance logo" />
        <span className="splash-screen__wordmark">GLANCE</span>
        <span className="splash-screen__rule" aria-hidden="true" />
      </div>
    </div>
  );
}
