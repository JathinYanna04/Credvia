'use client';

import { motion } from 'framer-motion';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

const chips = [
  'Resume Intelligence',
  'ATS Scoring',
  'Career Match',
  'Community Validation',
  'Contribution Reputation',
];

export function TrustChips() {
  const { stagger, child } = useMarketingMotion();

  return (
    <MarketingSection className="py-6">
      <motion.div
        className="marketing-glass flex flex-wrap justify-center gap-3 rounded-[28px] px-5 py-5 shadow-[0_22px_50px_rgba(3,7,18,0.12)]"
        variants={stagger}
        initial="hidden"
        whileInView="show"
      >
        {chips.map((chip) => (
          <motion.span
            key={chip}
            variants={child}
            className="marketing-chip rounded-full px-4 py-2 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-400/40 hover:text-[var(--marketing-text-primary)]"
          >
            {chip}
          </motion.span>
        ))}
      </motion.div>
    </MarketingSection>
  );
}
