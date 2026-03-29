import Link from 'next/link';
import { CommunityPicker } from '@/components/onboarding/CommunityPicker';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';

export default function OnboardingCommunitiesPage() {
  return (
    <OnboardingShell
      step={2}
      title="Join a few communities"
      description="Pick the environments where you want to ask sharper questions, publish work, and earn domain-specific reputation."
    >
      <CommunityPicker />
      <Link href="/onboarding/profile" className="mt-4 inline-block text-sm text-accent">
        Continue to profile
      </Link>
    </OnboardingShell>
  );
}
