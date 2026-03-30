import Link from 'next/link';
import { InterestPicker } from '@/components/onboarding/InterestPicker';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';

export default function InterestsPage() {
  return (
    <OnboardingShell
      step={1}
      title="Pick a few domains you care about"
      description="Optional, quick, and useful. A few interests help Credvia put better questions and communities in front of you."
    >
      <InterestPicker />
      <Link href="/onboarding/communities" className="mt-4 inline-block text-sm font-medium text-accent">
        Continue to communities
      </Link>
    </OnboardingShell>
  );
}
