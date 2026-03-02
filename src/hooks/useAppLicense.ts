import { useCallback, useEffect, useState } from 'react';
import type { AppLicenseStatus, UnlockProductInfo } from '../types';
import {
  checkLicenseStatus,
  getUnlockProduct,
  purchaseUnlock,
  restorePurchases
} from '../lib/tauri';

/**
 * Maps a raw backend error string to a human-readable user-facing message.
 * Backend may prefix errors with [Offline] or [StoreFault] for classification.
 */
function classifyStoreError(raw: string): string {
  if (raw.startsWith('[Offline]')) {
    return 'Could not reach the store. Please check your internet connection and try again.';
  }
  if (raw.startsWith('[StoreFault]')) {
    // Strip the prefix tag for mildly cleaner display — still store-level info.
    return raw.replace('[StoreFault] ', '').trim();
  }
  return raw;
}

interface UseAppLicenseResult {
  readonly loading: boolean;
  readonly status: AppLicenseStatus | null;
  readonly product: UnlockProductInfo | null;
  readonly actionPending: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly onPurchase: () => Promise<boolean>;
  readonly onRestore: () => Promise<boolean>;
}

export function useAppLicense(): UseAppLicenseResult {
  const [status, setStatus] = useState<AppLicenseStatus | null>(null);
  const [product, setProduct] = useState<UnlockProductInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const [nextStatus, nextProduct] = await Promise.all([
        checkLicenseStatus(),
        getUnlockProduct().catch(() => null)
      ]);
      setStatus(nextStatus);
      setProduct(nextProduct);
    } catch (refreshError) {
      const message = refreshError instanceof Error
        ? refreshError.message
        : 'Failed to load app license status.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [nextStatus, nextProduct] = await Promise.all([
          checkLicenseStatus(),
          getUnlockProduct().catch(() => null)
        ]);

        if (cancelled) {
          return;
        }

        setStatus(nextStatus);
        setProduct(nextProduct);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message = loadError instanceof Error
          ? loadError.message
          : 'Failed to load app license status.';
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onPurchase = useCallback(async () => {
    setActionPending(true);
    setError(null);

    try {
      const success = await purchaseUnlock();
      await refresh();
      return success;
    } catch (purchaseError) {
      const raw = purchaseError instanceof Error
        ? purchaseError.message
        : 'Purchase failed.';
      setError(classifyStoreError(raw));
      return false;
    } finally {
      setActionPending(false);
    }
  }, [refresh]);

  const onRestore = useCallback(async () => {
    setActionPending(true);
    setError(null);

    const isWindows = typeof navigator.userAgent === 'string' && navigator.userAgent.includes('Windows');
    let key: string | undefined;

    if (isWindows) {
      const input = window.prompt('Please paste your Glance Pro license key:');
      if (!input) {
        setActionPending(false);
        return false;
      }
      key = input.trim();
    }

    try {
      const success = await restorePurchases(key);
      await refresh();
      return success;
    } catch (restoreError) {
      const raw = restoreError instanceof Error
        ? restoreError.message
        : 'Restore failed.';
      setError(classifyStoreError(raw));
      return false;
    } finally {
      // Always re-enable the button even on failure — 2.1 fix.
      setActionPending(false);
    }
  }, [refresh]);

  return {
    loading,
    status,
    product,
    actionPending,
    error,
    refresh,
    onPurchase,
    onRestore
  };
}
