import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppLicense } from './useAppLicense';
import * as licenseApi from '../lib/license-api';
import * as tauriBridge from '../lib/tauri';

vi.mock('../lib/tauri', () => ({
  clearActivationRecord: vi.fn(),
  clearStoredLicense: vi.fn(),
  getOrCreateLicenseDeviceId: vi.fn(),
  isTauriEnvironment: vi.fn(),
  loadActivationRecord: vi.fn(),
  loadSavedLicenseKey: vi.fn(),
  loadTrialStatus: vi.fn(),
  startTrial: vi.fn(),
  storeActivationRecord: vi.fn(),
  storeLicenseKey: vi.fn(),
  validateActivationRecord: vi.fn(),
}));

vi.mock('../lib/license-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/license-api')>();
  return {
    ...actual,
    detectLicensePlatform: vi.fn(),
    redeemLicense: vi.fn(),
    validateLicense: vi.fn(),
  };
});

const tauriMock = tauriBridge as unknown as {
  clearActivationRecord: ReturnType<typeof vi.fn>;
  clearStoredLicense: ReturnType<typeof vi.fn>;
  getOrCreateLicenseDeviceId: ReturnType<typeof vi.fn>;
  isTauriEnvironment: ReturnType<typeof vi.fn>;
  loadActivationRecord: ReturnType<typeof vi.fn>;
  loadSavedLicenseKey: ReturnType<typeof vi.fn>;
  loadTrialStatus: ReturnType<typeof vi.fn>;
  startTrial: ReturnType<typeof vi.fn>;
  storeActivationRecord: ReturnType<typeof vi.fn>;
  storeLicenseKey: ReturnType<typeof vi.fn>;
  validateActivationRecord: ReturnType<typeof vi.fn>;
};

const licenseApiMock = licenseApi as unknown as {
  detectLicensePlatform: ReturnType<typeof vi.fn>;
  redeemLicense: ReturnType<typeof vi.fn>;
  validateLicense: ReturnType<typeof vi.fn>;
};

describe('useAppLicense', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    import.meta.env.VITE_GLANCE_BUILD_CHANNEL = 'paid';

    tauriMock.isTauriEnvironment.mockReturnValue(true);
    tauriMock.loadSavedLicenseKey.mockResolvedValue('GLANCE-ABCD-EFGH-IJKL');
    tauriMock.getOrCreateLicenseDeviceId.mockResolvedValue('device-123');
    tauriMock.loadActivationRecord.mockResolvedValue(null);
    tauriMock.loadTrialStatus.mockResolvedValue(null);
    tauriMock.startTrial.mockResolvedValue({
      state: 'trial_active',
      licenseId: null,
      trialStartedAt: '2026-03-10T12:00:00Z',
      trialExpiresAt: '2026-03-17T12:00:00Z',
      trialDaysRemaining: 7,
    });
    tauriMock.storeActivationRecord.mockResolvedValue(undefined);
    tauriMock.storeLicenseKey.mockResolvedValue(undefined);
    tauriMock.clearActivationRecord.mockResolvedValue(undefined);
    tauriMock.clearStoredLicense.mockResolvedValue({
      state: 'unlicensed',
      licenseId: null,
    });
    tauriMock.validateActivationRecord.mockResolvedValue(null);

    licenseApiMock.detectLicensePlatform.mockReturnValue('macos');
    licenseApiMock.redeemLicense.mockResolvedValue({
      platform: 'macos',
      status: 'active',
      licenseKeyLast4: '3C49',
      activationToken: 'payload.signature',
      activationIssuedAt: '2026-03-10T12:00:00Z',
    });
    licenseApiMock.validateLicense.mockResolvedValue({
      platform: 'macos',
      status: 'active',
      licenseKeyLast4: '3C49',
      activationToken: 'payload.signature',
      activationIssuedAt: '2026-03-10T12:00:00Z',
    });
  });

  it('unlocks immediately from a valid local token and refreshes it in the background', async () => {
    tauriMock.loadActivationRecord.mockResolvedValue({
      licenseId: '3C49',
      deviceId: 'device-123',
      platform: 'macos',
      activatedAt: '2026-03-10T12:00:00Z',
      activationToken: 'payload.signature',
    });
    tauriMock.validateActivationRecord.mockResolvedValue({
      state: 'licensed',
      licenseId: '3C49',
    });

    const { result } = renderHook(() => useAppLicense());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toEqual({
      state: 'licensed',
      licenseId: '3C49',
    });
    await waitFor(() => {
      expect(licenseApiMock.validateLicense).toHaveBeenCalledWith({
        licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
        deviceId: 'device-123',
        platform: 'macos',
      });
    });
    expect(tauriMock.storeActivationRecord).toHaveBeenCalledWith({
      licenseId: '3C49',
      deviceId: 'device-123',
      platform: 'macos',
      activatedAt: '2026-03-10T12:00:00Z',
      activationToken: 'payload.signature',
    });
    expect(licenseApiMock.redeemLicense).not.toHaveBeenCalled();
  });

  it('clears the local license when background validation finds a permanent server failure', async () => {
    tauriMock.loadActivationRecord.mockResolvedValue({
      licenseId: '3C49',
      deviceId: 'device-123',
      platform: 'macos',
      activatedAt: '2026-03-10T12:00:00Z',
      activationToken: 'payload.signature',
    });
    tauriMock.validateActivationRecord.mockResolvedValue({
      state: 'licensed',
      licenseId: '3C49',
    });
    tauriMock.clearStoredLicense.mockResolvedValue({
      state: 'unlicensed',
      licenseId: null,
    });
    licenseApiMock.validateLicense.mockRejectedValue(
      new licenseApi.LicenseApiError(
        'revoked_license',
        'This license key has been revoked. Contact support if this looks wrong.'
      )
    );

    const { result } = renderHook(() => useAppLicense());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => {
      expect(tauriMock.clearStoredLicense).toHaveBeenCalled();
    });

    expect(result.current.status).toEqual({
      state: 'unlicensed',
      licenseId: null,
    });
    expect(result.current.error).toBe('This license key has been revoked. Contact support if this looks wrong.');
  });

  it('uses validate on startup when it needs a server refresh', async () => {
    const { result } = renderHook(() => useAppLicense());

    await waitFor(() => {
      expect(result.current.status).toEqual({
        state: 'licensed',
        licenseId: '3C49',
      });
    });

    expect(licenseApiMock.validateLicense).toHaveBeenCalledWith({
      licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
      deviceId: 'device-123',
      platform: 'macos',
    });
    expect(licenseApiMock.redeemLicense).not.toHaveBeenCalled();
    expect(tauriMock.storeActivationRecord).toHaveBeenCalledWith({
      licenseId: '3C49',
      deviceId: 'device-123',
      platform: 'macos',
      activatedAt: '2026-03-10T12:00:00Z',
      activationToken: 'payload.signature',
    });
  });

  it('does not redeem on startup when the server says this device has not been activated', async () => {
    licenseApiMock.validateLicense.mockRejectedValue(
      new licenseApi.LicenseApiError(
        'activation_not_found',
        'This device has not been activated with this license key yet.'
      )
    );

    const { result } = renderHook(() => useAppLicense());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toEqual({
      state: 'unlicensed',
      licenseId: null,
    });
    expect(result.current.error).toBe('This device has not been activated with this license key yet.');
    expect(licenseApiMock.redeemLicense).not.toHaveBeenCalled();
    expect(tauriMock.clearActivationRecord).toHaveBeenCalled();
    expect(tauriMock.clearStoredLicense).not.toHaveBeenCalled();
  });

  it('still redeems when the user explicitly activates a license key', async () => {
    tauriMock.loadSavedLicenseKey.mockResolvedValue(null);

    const { result } = renderHook(() => useAppLicense());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.onActivate('  GLANCE-ABCD-EFGH-IJKL  ');
    });

    expect(licenseApiMock.redeemLicense).toHaveBeenCalledWith({
      licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
      deviceId: 'device-123',
      platform: 'macos',
    });
    expect(licenseApiMock.validateLicense).not.toHaveBeenCalled();
    expect(tauriMock.storeLicenseKey).toHaveBeenCalledWith('GLANCE-ABCD-EFGH-IJKL');
    expect(result.current.status).toEqual({
      state: 'licensed',
      licenseId: '3C49',
    });
  });

  it('uses the persisted Product Hunt trial when no saved key exists', async () => {
    import.meta.env.VITE_GLANCE_BUILD_CHANNEL = 'product_hunt';
    tauriMock.loadSavedLicenseKey.mockResolvedValue(null);
    tauriMock.loadTrialStatus.mockResolvedValue({
      state: 'trial_active',
      licenseId: null,
      trialStartedAt: '2026-03-10T12:00:00Z',
      trialExpiresAt: '2026-03-17T12:00:00Z',
      trialDaysRemaining: 5,
    });

    const { result } = renderHook(() => useAppLicense());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.trialEnabled).toBe(true);
    expect(result.current.status).toEqual({
      state: 'trial_active',
      licenseId: null,
      trialStartedAt: '2026-03-10T12:00:00Z',
      trialExpiresAt: '2026-03-17T12:00:00Z',
      trialDaysRemaining: 5,
    });
    expect(licenseApiMock.validateLicense).not.toHaveBeenCalled();
  });

  it('starts the Product Hunt trial explicitly from the paywall flow', async () => {
    import.meta.env.VITE_GLANCE_BUILD_CHANNEL = 'product_hunt';
    tauriMock.loadSavedLicenseKey.mockResolvedValue(null);

    const { result } = renderHook(() => useAppLicense());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.onStartTrial();
    });

    expect(tauriMock.startTrial).toHaveBeenCalled();
    expect(result.current.status).toEqual({
      state: 'trial_active',
      licenseId: null,
      trialStartedAt: '2026-03-10T12:00:00Z',
      trialExpiresAt: '2026-03-17T12:00:00Z',
      trialDaysRemaining: 7,
    });
  });
});
