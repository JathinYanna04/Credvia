import Link from 'next/link';
import { CommunityPicker } from '@/components/onboarding/CommunityPicker';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';

export default function OnboardingCommunitiesPage() {
  return (
    <OnboardingShell
      step={2}
      title="Join communities that match your goals"
      description="These spaces shape your home feed and give your reputation a clearer context, but you can always change them later."
    >
      <CommunityPicker />
      <Link href="/onboarding/profile" className="mt-4 inline-block text-sm font-medium text-accent">
        Continue to profile
      </Link>
    </OnboardingShell>
  );
}
