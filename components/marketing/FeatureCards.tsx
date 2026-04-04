'use client';

import { ArrowRight, FileText, Lightbulb, ShieldCheck, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

const features = [
  {
    icon: FileText,
    title: 'AI Resume Intelligence',
    description:
      'Turn messy resumes into structured insight, ATS clarity, and actionable next steps.',
  },
  {
    icon: Target,
    title: 'Career Match',
    description:
      'See where your current profile fits, where it misses, and what to improve next.',
  },
  {
    icon: Lightbulb,
    title: 'Startup Validation',
    description:
      'Test ideas in public with community signal, traction cues, and sharper feedback loops.',
  },
  {
    icon: ShieldCheck,
    title: 'Credibility Layer',
    description:
      'Build a professional identity backed by contribution, not just polish and claims.',
  },
];

export function FeatureCards() {
  const { stagger, child } = useMarketingMotion();

  return (
    <MarketingSection className="py-14 sm:py-20">
      <div className="mb-10 max-w-3xl">
        <div className="marketing-kicker text-xs uppercase tracking-[0.22em]">What Credvia does</div>
        <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
          One platform for career momentum, idea traction, and visible credibility.
        </h2>
        <p className="marketing-muted mt-4 text-lg">
          Credvia blends AI product intelligence with social proof systems so every part of your
          growth compounds.
        </p>
      </div>

      <motion.div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        variants={stagger}
        initial="hidden"
        whileInView="show"
      >
        {features.map((feature) => (
          <motion.div key={feature.title} variants={child}>
            <Card className="marketing-panel group h-full">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600/15 text-primary-400 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-primary-600/24">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-6 text-lg font-semibold text-[var(--marketing-text-primary)]">{feature.title}</h3>
              <p className="marketing-muted mt-3 text-sm leading-7">{feature.description}</p>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary-400">
                Learn more
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </MarketingSection>
  );
}
