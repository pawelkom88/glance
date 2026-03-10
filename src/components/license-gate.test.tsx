import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppLicenseStatus } from '../types';
import { LicenseGate } from './license-gate';

interface MockLicenseHookState {
  readonly loading: boolean;
  readonly status: AppLicenseStatus;
  readonly actionPending: boolean;
  readonly error: string | null;
  readonly trialEnabled: boolean;
  readonly refresh: ReturnType<typeof vi.fn>;
  readonly onActivate: ReturnType<typeof vi.fn>;
  readonly onStartTrial: ReturnType<typeof vi.fn>;
  readonly onClear: ReturnType<typeof vi.fn>;
}

let hookState: MockLicenseHookState = {
  loading: false,
  status: {
    state: 'licensed',
    licenseId: '3C49',
  },
  actionPending: false,
  error: null as string | null,
  trialEnabled: false,
  refresh: vi.fn(),
  onActivate: vi.fn(async () => true),
  onStartTrial: vi.fn(async () => true),
  onClear: vi.fn(async () => true),
};

vi.mock('../hooks/useAppLicense', () => ({
  useAppLicense: () => hookState
}));

describe('LicenseGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    import.meta.env.VITE_GLANCE_BUILD_CHANNEL = 'paid';
    window.location.hash = '';
    hookState = {
      loading: false,
      status: {
        state: 'licensed',
        licenseId: '3C49',
      },
      actionPending: false,
      error: null,
      trialEnabled: false,
      refresh: vi.fn(),
      onActivate: vi.fn(async () => true),
      onStartTrial: vi.fn(async () => true),
      onClear: vi.fn(async () => true),
    };
  });

  it('shows the Product Hunt trial CTA before trial start', () => {
    import.meta.env.VITE_GLANCE_BUILD_CHANNEL = 'product_hunt';
    hookState = {
      ...hookState,
      status: {
        state: 'unlicensed',
        licenseId: null,
      },
      trialEnabled: true,
    };

    render(
      <LicenseGate>
        <div>Unlocked app</div>
      </LicenseGate>
    );

    expect(screen.getByRole('button', { name: 'Start 7-day free trial' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate license' })).toBeTruthy();
    expect(screen.queryByText('Unlocked app')).toBeNull();
  });

  it('shows a trial banner while the Product Hunt trial is active', () => {
    hookState = {
      ...hookState,
      status: {
        state: 'trial_active',
        licenseId: null,
        trialStartedAt: '2026-03-10T12:00:00Z',
        trialExpiresAt: '2026-03-17T12:00:00Z',
        trialDaysRemaining: 4,
      },
      trialEnabled: true,
    };

    render(
      <LicenseGate>
        <div>Unlocked app</div>
      </LicenseGate>
    );

    expect(screen.getByText('Unlocked app')).toBeTruthy();
    expect(screen.getByText('4 days left in your 7-day free trial.')).toBeTruthy();
  });
});
