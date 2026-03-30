import { ProfileSetup } from '@/components/onboarding/ProfileSetup';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';

export default function OnboardingProfilePage() {
  return (
    <OnboardingShell
      step={3}
      title="Add the profile basics people will actually notice"
      description="You do not need a polished profile. Just give people enough signal to trust your questions, answers, and work."
    >
      <ProfileSetup />
    </OnboardingShell>
  );
}
