export type LicensePlatform = 'macos' | 'windows';

interface RedeemLicenseRequest {
  readonly licenseKey: string;
  readonly deviceId: string;
  readonly platform: LicensePlatform;
}

interface RedeemLicensePayload {
  readonly ok: true;
  readonly license: {
    readonly platform: LicensePlatform;
    readonly status: 'active';
    readonly licenseKeyLast4: string;
  };
}

interface RedeemLicenseErrorPayload {
  readonly ok: false;
  readonly error: string;
}

const DEFAULT_LICENSE_API_BASE_URL = 'https://glance-payments.paulus-react.workers.dev';

export class LicenseApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LicenseApiError';
    this.code = code;
  }
}

export function detectLicensePlatform(): LicensePlatform {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win')) {
    return 'windows';
  }

  return 'macos';
}

export function isPermanentLicenseError(code: string): boolean {
  return code === 'invalid_license'
    || code === 'revoked_license'
    || code === 'wrong_platform';
}

export async function redeemLicense(options: RedeemLicenseRequest): Promise<RedeemLicensePayload['license']> {
  let response: Response;

  try {
    response = await fetch(`${licenseApiBaseUrl()}/license/redeem`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });
  } catch {
    throw new LicenseApiError('network_error', 'Could not reach the license server.');
  }

  const payload = await parseRedeemResponse(response);
  if (payload.ok) {
    return payload.license;
  }

  throw new LicenseApiError(payload.error, licenseErrorMessage(payload.error));
}

async function parseRedeemResponse(
  response: Response
): Promise<RedeemLicensePayload | RedeemLicenseErrorPayload> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new LicenseApiError('network_error', 'Could not reach the license server.');
  }

  if (isRedeemLicensePayload(payload)) {
    return payload;
  }

  if (isRedeemLicenseErrorPayload(payload)) {
    return payload;
  }

  throw new LicenseApiError('server_not_configured', 'The license server returned an unexpected response.');
}

function licenseApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_LICENSE_API_URL?.trim();
  return (configuredUrl || DEFAULT_LICENSE_API_BASE_URL).replace(/\/+$/, '');
}

function isRedeemLicensePayload(value: unknown): value is RedeemLicensePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<RedeemLicensePayload>;
  return payload.ok === true
    && !!payload.license
    && typeof payload.license.licenseKeyLast4 === 'string'
    && (payload.license.platform === 'macos' || payload.license.platform === 'windows')
    && payload.license.status === 'active';
}

function isRedeemLicenseErrorPayload(value: unknown): value is RedeemLicenseErrorPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<RedeemLicenseErrorPayload>;
  return payload.ok === false && typeof payload.error === 'string';
}

function licenseErrorMessage(code: string): string {
  switch (code) {
    case 'missing_license_key':
      return 'Please paste your license key.';
    case 'missing_device_id':
      return 'This device could not be identified. Restart the app and try again.';
    case 'invalid_platform':
      return 'This device platform is not supported by the license server.';
    case 'invalid_license':
      return 'This license key was not recognised.';
    case 'revoked_license':
      return 'This license key has been revoked. Contact support if this looks wrong.';
    case 'wrong_platform':
      return 'This license key is for a different platform.';
    case 'activation_limit_reached':
      return 'This license key has reached its activation limit.';
    case 'server_not_configured':
      return 'The license server is not configured correctly.';
    default:
      return 'Could not verify your license key right now.';
  }
}
