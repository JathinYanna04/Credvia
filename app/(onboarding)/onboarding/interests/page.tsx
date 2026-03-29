import Link from 'next/link';
import { InterestPicker } from '@/components/onboarding/InterestPicker';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';

export default function InterestsPage() {
  return (
    <OnboardingShell
      step={1}
      title="Choose the domains you want to be known for"
      description="These interests shape discovery, recommended communities, and the people Credvia surfaces first."
    >
      <InterestPicker />
      <Link href="/onboarding/communities" className="mt-4 inline-block text-sm text-accent">
        Continue to communities
      </Link>
    </OnboardingShell>
  );
}
