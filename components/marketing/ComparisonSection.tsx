'use client';

import { Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

const traditional = [
  'Isolated resume tools with no downstream context',
  'Static job boards with little profile truth',
  'Shallow social engagement without real career signal',
  'No contribution-based credibility system',
];

const credvia = [
  'AI plus structured resume intelligence in one workspace',
  'Evidence-based career fit and skill-gap visibility',
  'Founder and community validation around ideas and work',
  'Reputation shaped by visible contribution over time',
];

export function ComparisonSection() {
  const { child } = useMarketingMotion();

  return (
    <MarketingSection className="py-14 sm:py-20">
      <motion.div
        variants={child}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="marketing-panel grid gap-5 rounded-[32px] p-6 lg:grid-cols-2 lg:p-8"
      >
        <div className="marketing-glass rounded-[24px] p-6">
          <div className="marketing-muted-soft text-xs uppercase tracking-[0.18em]">
            Traditional platforms
          </div>
          <div className="mt-5 space-y-4">
            {traditional.map((item) => (
              <div key={item} className="marketing-muted flex gap-3 text-sm leading-7">
                <X className="mt-1 h-4 w-4 shrink-0 text-warning" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-primary-500/20 bg-[linear-gradient(180deg,rgba(99,102,241,0.14),rgba(255,255,255,0.06))] p-6 dark:bg-[linear-gradient(180deg,rgba(99,102,241,0.12),rgba(255,255,255,0.03))]">
          <div className="marketing-kicker text-xs uppercase tracking-[0.18em]">Credvia</div>
          <div className="mt-5 space-y-4">
            {credvia.map((item) => (
              <div key={item} className="flex gap-3 text-sm leading-7 text-[var(--marketing-text-primary)]">
                <Check className="mt-1 h-4 w-4 shrink-0 text-success" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </MarketingSection>
  );
}
