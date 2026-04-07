import { describe, expect, it } from 'vitest';
import { hasBasicOnboardingIdentity, requiresPersonaOnboarding } from '@/lib/profile-state';

describe('profile onboarding state', () => {
  it('treats persona + username + full name as enough to enter the app', () => {
    const profile = {
      onboarding_complete: true,
      primary_persona: 'professional',
      username: 'credvia_builder',
      full_name: 'Credvia Builder',
      onboarding_version: 2,
      persona_completion_score: 10,
    } as const;

    expect(hasBasicOnboardingIdentity(profile)).toBe(true);
    expect(requiresPersonaOnboarding(profile)).toBe(false);
  });

  it('still requires onboarding when basic identity is incomplete', () => {
    const profile = {
      onboarding_complete: true,
      primary_persona: 'student',
      username: '',
      full_name: 'C',
    } as const;

    expect(hasBasicOnboardingIdentity(profile)).toBe(false);
    expect(requiresPersonaOnboarding(profile)).toBe(true);
  });
});
