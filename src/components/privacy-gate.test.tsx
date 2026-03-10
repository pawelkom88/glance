import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/use-app-store';
import { PrivacyGate } from './privacy-gate';

describe('PrivacyGate behavior', () => {
  beforeEach(() => {
    const completeOnboarding = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ completeOnboarding });
  });

  it('triggers onboarding completion when Get Started is clicked', async () => {
    const user = userEvent.setup();
    render(<PrivacyGate />);

    await user.click(screen.getByRole('button', { name: /Get Started/i }));

    const completeOnboarding = useAppStore.getState().completeOnboarding as unknown as ReturnType<typeof vi.fn>;
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('renders core privacy messaging', () => {
    render(<PrivacyGate />);

    expect(screen.queryByText('Local-first. Zero telemetry.')).not.toBeNull();
    expect(
      screen.queryByText(/Your scripts never leave this machine/i)
    ).not.toBeNull();
    expect(
      screen.queryByText(/No account. No subscription. Internet only to activate your license/i)
    ).not.toBeNull();
  });
});
