'use client';

import { CareerMatchShowcase } from '@/components/marketing/CareerMatchShowcase';
import { ComparisonSection } from '@/components/marketing/ComparisonSection';
import { CommunityValidationShowcase } from '@/components/marketing/CommunityValidationShowcase';
import { FeatureCards } from '@/components/marketing/FeatureCards';
import { FinalCta } from '@/components/marketing/FinalCta';
import { HeroSection } from '@/components/marketing/HeroSection';
import { HowItWorksTimeline } from '@/components/marketing/HowItWorksTimeline';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNavbar } from '@/components/marketing/MarketingNavbar';
import { MidPageCta } from '@/components/marketing/MidPageCta';
import { ReputationShowcase } from '@/components/marketing/ReputationShowcase';
import { ResumeShowcase } from '@/components/marketing/ResumeShowcase';
import { TestimonialsOrProof } from '@/components/marketing/TestimonialsOrProof';
import { TrustChips } from '@/components/marketing/TrustChips';
import type {
  LandingCommunitySummary,
  PublicPostSummary,
} from '@/components/marketing/types';

export interface MarketingLandingClientProps {
  communities: LandingCommunitySummary[];
  featuredPosts: PublicPostSummary[];
}

export function MarketingLandingClient({
  communities,
  featuredPosts,
}: MarketingLandingClientProps) {
  return (
    <div className="marketing-page min-h-screen overflow-hidden">
      <MarketingNavbar />
      <main className="relative">
        <HeroSection />
        <TrustChips />
        <FeatureCards />
        <ResumeShowcase />
        <CareerMatchShowcase />
        <CommunityValidationShowcase
          communities={communities}
          featuredPosts={featuredPosts}
        />
        <ReputationShowcase />
        <HowItWorksTimeline />
        <ComparisonSection />
        <TestimonialsOrProof />
        <MidPageCta />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
