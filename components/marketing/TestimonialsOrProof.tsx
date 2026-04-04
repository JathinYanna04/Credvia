'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

const personas = [
  {
    title: 'For students',
    quote:
      'I finally understood what my resume was missing and how to make my project work look stronger.',
    result: 'Clearer ATS signal',
  },
  {
    title: 'For founders',
    quote:
      'The community feedback was sharper than a generic launch post because it actually surfaced what mattered.',
    result: 'Faster idea validation',
  },
  {
    title: 'For early professionals',
    quote:
      'I liked that my profile, resume review, and job match all agreed instead of giving me mixed signals.',
    result: 'More trustworthy career feedback',
  },
];

export function TestimonialsOrProof() {
  const { stagger, child } = useMarketingMotion();

  return (
    <MarketingSection className="py-14 sm:py-20">
      <div className="mb-10 max-w-3xl">
        <div className="marketing-kicker text-xs uppercase tracking-[0.22em]">
          Who this helps
        </div>
        <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
          Built for people who want stronger signal, not more noise.
        </h2>
      </div>

      <motion.div
        className="grid gap-4 lg:grid-cols-3"
        variants={stagger}
        initial="hidden"
        whileInView="show"
      >
        {personas.map((item) => (
          <motion.div key={item.title} variants={child}>
            <Card className="marketing-panel h-full">
              <div className="marketing-kicker text-xs uppercase tracking-[0.18em]">
                {item.title}
              </div>
              <p className="mt-5 text-lg leading-8 text-[var(--marketing-text-primary)]">
                "{item.quote}"
              </p>
              <div className="marketing-muted mt-6 text-sm font-medium">{item.result}</div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </MarketingSection>
  );
}
