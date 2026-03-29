import { ProfileSetup } from '@/components/onboarding/ProfileSetup';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';

export default function OnboardingProfilePage() {
  return (
    <OnboardingShell
      step={3}
      title="Finish your profile basics"
      description="Keep it sharp. The goal is enough signal for others to understand what you build and how you think."
    >
      <ProfileSetup />
    </OnboardingShell>
  );
}
