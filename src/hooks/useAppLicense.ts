import { useCallback, useEffect, useState } from 'react';
import type { AppActivationRecord, AppLicenseStatus } from '../types';
import { isProductHuntBuild } from '../lib/build-channel';
import {
  clearActivationRecord,
  clearStoredLicense,
  getOrCreateLicenseDeviceId,
  isTauriEnvironment,
  loadActivationRecord,
  loadSavedLicenseKey,
  loadTrialStatus,
  startTrial,
  storeActivationRecord,
  storeLicenseKey,
  validateActivationRecord,
} from '../lib/tauri';
import {
  detectLicensePlatform,
  isPermanentLicenseError,
  LicenseApiError,
  redeemLicense,
  validateLicense,
} from '../lib/license-api';

interface UseAppLicenseResult {
  readonly loading: boolean;
  readonly status: AppLicenseStatus | null;
  readonly actionPending: boolean;
  readonly error: string | null;
  readonly trialEnabled: boolean;
  readonly refresh: () => Promise<void>;
  readonly onActivate: (key: string) => Promise<boolean>;
  readonly onStartTrial: () => Promise<boolean>;
  readonly onClear: () => Promise<boolean>;
}

function createLicensedStatus(licenseId: string): AppLicenseStatus {
  return {
    state: 'licensed',
    licenseId,
  };
}

function createUnlicensedStatus(): AppLicenseStatus {
  return {
    state: 'unlicensed',
    licenseId: null,
  };
}

function createActivationRecord(
  license: {
    readonly licenseKeyLast4: string;
    readonly activationIssuedAt: string;
    readonly activationToken: string;
  },
  deviceId: string,
  platform: 'macos' | 'windows'
): AppActivationRecord {
  return {
    licenseId: license.licenseKeyLast4,
    deviceId,
    platform,
    activatedAt: license.activationIssuedAt,
    activationToken: license.activationToken,
  };
}

async function persistValidatedLicense(
  license: {
    readonly licenseKeyLast4: string;
    readonly activationIssuedAt: string;
    readonly activationToken: string;
  },
  deviceId: string,
  platform: 'macos' | 'windows'
): Promise<AppLicenseStatus> {
  await storeActivationRecord(
    createActivationRecord(license, deviceId, platform)
  );

  return createLicensedStatus(license.licenseKeyLast4);
}

export function useAppLicense(): UseAppLicenseResult {
  const trialEnabled = isProductHuntBuild();
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
      const resolveFallbackStatus = async (): Promise<AppLicenseStatus> => {
        if (!trialEnabled) {
          return createUnlicensedStatus();
        }

        const trialStatus = await loadTrialStatus();
        return trialStatus ?? createUnlicensedStatus();
      };

      const savedKey = await loadSavedLicenseKey();
      if (!savedKey) {
        setStatus(await resolveFallbackStatus());
        return;
      }

      const deviceId = await getOrCreateLicenseDeviceId();
      const localActivation = await loadActivationRecord();
      const currentPlatform = detectLicensePlatform();
      const revalidateInBackground = async () => {
        try {
          const validatedLicense = await validateLicense({
            licenseKey: savedKey,
            deviceId,
            platform: currentPlatform,
          });
          const nextStatus = await persistValidatedLicense(
            validatedLicense,
            deviceId,
            currentPlatform
          );
          setStatus(nextStatus);
        } catch (backgroundError) {
          if (!(backgroundError instanceof LicenseApiError)) {
            return;
          }

          if (!isPermanentLicenseError(backgroundError.code)) {
            return;
          }

          try {
            await clearStoredLicense();
            setStatus(await resolveFallbackStatus());
          } catch {
            setStatus(await resolveFallbackStatus());
          }

          setError(backgroundError.message);
        }
      };

      if (
        localActivation
        && localActivation.deviceId === deviceId
        && localActivation.platform === currentPlatform
        && localActivation.licenseId
      ) {
        try {
          const verifiedLocalStatus = await validateActivationRecord(localActivation);
          if (verifiedLocalStatus) {
            setStatus(verifiedLocalStatus);
            void revalidateInBackground();
            return;
          }
        } catch {
          // Fall through to server validation when local verification is unavailable.
        }
      }

      const validatedLicense = await validateLicense({
        licenseKey: savedKey,
        deviceId,
        platform: currentPlatform,
      });
      setStatus(
        await persistValidatedLicense(
          validatedLicense,
          deviceId,
          currentPlatform
        )
      );
    } catch (refreshError) {
      if (
        refreshError instanceof LicenseApiError
        && refreshError.code === 'activation_not_found'
      ) {
        try {
          await clearActivationRecord();
        } catch {
          // Ignore local cleanup failures and still surface the activation requirement.
        }
      }

      if (refreshError instanceof LicenseApiError && isPermanentLicenseError(refreshError.code)) {
        try {
          await clearStoredLicense();
        } catch {
          // Ignore local cleanup failures and still surface the verification failure.
        }
      }

      setStatus(await (async () => {
        if (!trialEnabled) {
          return createUnlicensedStatus();
        }

        const trialStatus = await loadTrialStatus();
        return trialStatus ?? createUnlicensedStatus();
      })());
      const message = refreshError instanceof Error
        ? refreshError.message
        : 'Failed to load app license status.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [trialEnabled]);

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
      const platform = detectLicensePlatform();
      const redeemedLicense = await redeemLicense({
        licenseKey: trimmedKey,
        deviceId,
        platform,
      });
      await storeLicenseKey(trimmedKey);
      await storeActivationRecord(
        createActivationRecord(redeemedLicense, deviceId, platform)
      );
      setStatus(createLicensedStatus(redeemedLicense.licenseKeyLast4));
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

  const onStartTrial = useCallback(async () => {
    if (!trialEnabled) {
      return false;
    }

    setActionPending(true);
    setError(null);

    try {
      const trialStatus = await startTrial();
      setStatus(trialStatus);
      return trialStatus.state === 'trial_active' || trialStatus.state === 'licensed';
    } catch (trialError) {
      const message = trialError instanceof Error
        ? trialError.message
        : 'Failed to start free trial.';
      setError(message);
      return false;
    } finally {
      setActionPending(false);
    }
  }, [trialEnabled]);

  const onClear = useCallback(async () => {
    setActionPending(true);
    setError(null);

    try {
      await clearStoredLicense();
      const nextStatus = trialEnabled
        ? (await loadTrialStatus()) ?? createUnlicensedStatus()
        : createUnlicensedStatus();
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
  }, [trialEnabled]);

  return {
    loading,
    status,
    actionPending,
    error,
    trialEnabled,
    refresh,
    onActivate,
    onStartTrial,
    onClear,
  };
}
