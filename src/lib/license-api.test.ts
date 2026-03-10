import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LicenseApiError, redeemLicense, validateLicense } from './license-api';

describe('license API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts existing activations to the validate endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          license: {
            platform: 'macos',
            status: 'active',
            licenseKeyLast4: '3C49',
            activationToken: 'payload.signature',
            activationIssuedAt: '2026-03-10T12:00:00Z',
          },
        })
      )
    );

    const license = await validateLicense({
      licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
      deviceId: 'device-123',
      platform: 'macos',
    });

    expect(license).toEqual({
      platform: 'macos',
      status: 'active',
      licenseKeyLast4: '3C49',
      activationToken: 'payload.signature',
      activationIssuedAt: '2026-03-10T12:00:00Z',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://glance-payments.paulus-react.workers.dev/license/validate',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('posts first-time activations to the redeem endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          license: {
            platform: 'macos',
            status: 'active',
            licenseKeyLast4: '3C49',
            activationToken: 'payload.signature',
            activationIssuedAt: '2026-03-10T12:00:00Z',
          },
        })
      )
    );

    await redeemLicense({
      licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
      deviceId: 'device-123',
      platform: 'macos',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://glance-payments.paulus-react.workers.dev/license/redeem',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('surfaces an actionable message when the device has not been activated yet', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: 'activation_not_found',
        }),
        { status: 404 }
      )
    );

    await expect(
      validateLicense({
        licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
        deviceId: 'device-123',
        platform: 'macos',
      })
    ).rejects.toEqual(
      new LicenseApiError(
        'activation_not_found',
        'This device has not been activated with this license key yet.'
      )
    );
  });

  it('surfaces a friendly activation message when the server payload shape is unexpected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          license: {
            platform: 'macos',
            status: 'active',
            licenseKeyLast4: '3C49',
          },
        }),
        { status: 200 }
      )
    );

    await expect(
      redeemLicense({
        licenseKey: 'GLANCE-ABCD-EFGH-IJKL',
        deviceId: 'device-123',
        platform: 'macos',
      })
    ).rejects.toEqual(
      new LicenseApiError(
        'server_not_configured',
        'Glance could not complete activation right now. Please try again in a moment, update the app and try again, or contact hello@atglance.app.'
      )
    );
  });
});
