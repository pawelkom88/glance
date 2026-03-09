import { useCallback, useEffect, useState } from 'react';
import type { AppLicenseStatus } from '../types';
import { activateLicenseKey, checkLicenseStatus, clearStoredLicense } from '../lib/tauri';

interface UseAppLicenseResult {
  readonly loading: boolean;
  readonly status: AppLicenseStatus | null;
  readonly actionPending: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly onActivate: (key: string) => Promise<boolean>;
  readonly onClear: () => Promise<boolean>;
}

export function useAppLicense(): UseAppLicenseResult {
  const [status, setStatus] = useState<AppLicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const nextStatus = await checkLicenseStatus();
      setStatus(nextStatus);
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
    void refresh();
  }, [refresh]);

  const onActivate = useCallback(async (key: string) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setError('Please paste your license key.');
      return false;
    }

    setActionPending(true);
    setError(null);

    try {
      const nextStatus = await activateLicenseKey(trimmedKey);
      setStatus(nextStatus);
      return true;
    } catch (activationError) {
      const message = activationError instanceof Error
        ? activationError.message
        : 'Failed to activate license.';
      setError(message);
      return false;
    } finally {
      setActionPending(false);
    }
  }, []);

  const onClear = useCallback(async () => {
    setActionPending(true);
    setError(null);

    try {
      const nextStatus = await clearStoredLicense();
      setStatus(nextStatus);
      return true;
    } catch (clearError) {
      const message = clearError instanceof Error
        ? clearError.message
        : 'Failed to clear saved license.';
      setError(message);
      return false;
    } finally {
      setActionPending(false);
    }
  }, []);

  return {
    loading,
    status,
    actionPending,
    error,
    refresh,
    onActivate,
    onClear,
  };
}
