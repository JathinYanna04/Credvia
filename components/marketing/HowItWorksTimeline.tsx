'use client';

import { motion } from 'framer-motion';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

const steps = [
  {
    title: 'Upload or create',
    description:
      'Start with your resume, your profile, or an idea you want sharper feedback on.',
  },
  {
    title: 'Analyze and structure',
    description:
      'Credvia turns raw input into structured intelligence, diagnostics, and clear signals.',
  },
  {
    title: 'Discover your gaps',
    description:
      'See where your current profile is strong, where it is weak, and what to improve next.',
  },
  {
    title: 'Compound credibility',
    description:
      'Every contribution, reply, idea, and improvement makes your identity harder to ignore.',
  },
];

export function HowItWorksTimeline() {
  const { prefersReducedMotion } = useMarketingMotion();

  return (
    <MarketingSection id="how-it-works" className="py-14 sm:py-20">
      <div className="mb-10 max-w-3xl">
        <div className="marketing-kicker text-xs uppercase tracking-[0.22em]">How it works</div>
        <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
          A product flow that keeps your growth system connected.
        </h2>
      </div>

      <div className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="absolute left-6 right-6 top-8 hidden h-px bg-[linear-gradient(90deg,rgba(99,102,241,0.18),rgba(165,180,252,0.72),rgba(99,102,241,0.18))] xl:block" />
        {steps.map((step, index) => (
          <motion.div
            key={step.title}
            className="marketing-panel relative rounded-[28px] p-6"
            initial={{ opacity: 0, y: 26, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{
              delay: prefersReducedMotion ? 0 : index * 0.08,
              duration: 0.55,
            }}
            >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600/14 text-sm font-semibold text-primary-400">
              {index + 1}
            </div>
            <h3 className="mt-5 text-xl font-semibold text-[var(--marketing-text-primary)]">{step.title}</h3>
            <p className="marketing-muted mt-3 text-sm leading-7">{step.description}</p>
          </motion.div>
        ))}
      </div>
    </MarketingSection>
  );
}
