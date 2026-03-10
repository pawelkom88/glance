import { useCallback, useEffect, useState } from 'react';
import type { AppLicenseStatus } from '../types';
import {
  clearStoredLicense,
  getOrCreateLicenseDeviceId,
  isTauriEnvironment,
  loadSavedLicenseKey,
  storeLicenseKey,
} from '../lib/tauri';
import {
  detectLicensePlatform,
  isPermanentLicenseError,
  LicenseApiError,
  redeemLicense,
} from '../lib/license-api';

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
    setLoading(true);
    setError(null);

    if (!isTauriEnvironment()) {
      setStatus({
        state: 'licensed',
        licenseId: 'developer-mode',
      });
      setLoading(false);
      return;
    }

    try {
      const savedKey = await loadSavedLicenseKey();
      if (!savedKey) {
        setStatus({
          state: 'unlicensed',
          licenseId: null,
        });
        return;
      }

      const deviceId = await getOrCreateLicenseDeviceId();
      const redeemedLicense = await redeemLicense({
        licenseKey: savedKey,
        deviceId,
        platform: detectLicensePlatform(),
      });
      const nextStatus: AppLicenseStatus = {
        state: 'licensed',
        licenseId: redeemedLicense.licenseKeyLast4,
      };
      setStatus(nextStatus);
    } catch (refreshError) {
      if (refreshError instanceof LicenseApiError && isPermanentLicenseError(refreshError.code)) {
        try {
          await clearStoredLicense();
        } catch {
          // Ignore local cleanup failures and still surface the verification failure.
        }
      }

      setStatus({
        state: 'unlicensed',
        licenseId: null,
      });
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
      if (!isTauriEnvironment()) {
        setStatus({
          state: 'licensed',
          licenseId: 'developer-mode',
        });
        return true;
      }

      const deviceId = await getOrCreateLicenseDeviceId();
      const redeemedLicense = await redeemLicense({
        licenseKey: trimmedKey,
        deviceId,
        platform: detectLicensePlatform(),
      });
      await storeLicenseKey(trimmedKey);
      const nextStatus: AppLicenseStatus = {
        state: 'licensed',
        licenseId: redeemedLicense.licenseKeyLast4,
      };
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
