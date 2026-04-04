'use client';

import { motion } from 'framer-motion';
import type {
  LandingCommunitySummary,
  PublicPostSummary,
} from '@/components/marketing/types';
import { Card } from '@/components/ui/Card';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

export interface CommunityValidationShowcaseProps {
  communities: LandingCommunitySummary[];
  featuredPosts: PublicPostSummary[];
}

export function CommunityValidationShowcase({
  communities,
  featuredPosts,
}: CommunityValidationShowcaseProps) {
  const { child, prefersReducedMotion } = useMarketingMotion();
  const post = featuredPosts[0] ?? null;

  return (
    <MarketingSection id="community-validation" className="py-14 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <div className="text-xs uppercase tracking-[0.22em] text-primary-400">
            Community validation
          </div>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
            Pressure-test ideas where founders, students, and builders already gather.
          </h2>
          <p className="marketing-muted mt-4 text-lg leading-8">
            Credvia turns community momentum into usable signal, so promising ideas surface
            through thoughtful discussion and repeated contribution.
          </p>
          <div className="marketing-muted mt-8 grid gap-3 text-sm">
            {[
              'Idea cards show traction, quality of feedback, and recurring themes.',
              'Communities reveal what people actually care about, not just what gets clicks.',
              'Contributors build identity while founders refine what they are building.',
            ].map((item) => (
              <div
                key={item}
                className="marketing-chip rounded-2xl px-4 py-3"
              >
                {item}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <Card className="marketing-panel">
            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="marketing-glass rounded-3xl p-5">
                <div className="marketing-muted-soft text-xs uppercase tracking-[0.16em]">
                  Live idea traction
                </div>
                <div className="mt-4 text-lg font-semibold text-[var(--marketing-text-primary)]">
                  {post?.title ?? 'Community-backed startup feedback'}
                </div>
                <p className="marketing-muted mt-3 text-sm leading-7">
                  {post?.body?.slice(0, 180) ??
                    'Find what resonates faster by seeing which ideas attract thoughtful replies, sharp objections, and repeat engagement.'}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ['23', 'Insightful replies'],
                    ['89%', 'Signal quality'],
                    ['4', 'Communities discussing'],
                  ].map(([value, label]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-[var(--marketing-border)] bg-bg-base/40 px-4 py-3"
                    >
                      <div className="text-xl font-semibold text-[var(--marketing-text-primary)]">{value}</div>
                      <div className="marketing-muted-soft mt-1 text-xs">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {communities.slice(0, 3).map((community, index) => (
                  <motion.div
                    key={community.id}
                    className="marketing-glass rounded-3xl p-5"
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : { x: [0, index % 2 === 0 ? 6 : -6, 0] }
                    }
                    transition={{ duration: 5 + index, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <div className="text-sm font-semibold text-[var(--marketing-text-primary)]">{community.name}</div>
                    <p className="marketing-muted mt-2 text-sm leading-6">
                      {community.description}
                    </p>
                    <div className="marketing-kicker mt-4 text-xs uppercase tracking-[0.16em]">
                      {community.member_count.toLocaleString()} members
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </MarketingSection>
  );
}
