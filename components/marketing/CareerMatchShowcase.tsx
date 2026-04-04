'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

const roles = {
  'Frontend Engineer': {
    score: 86,
    matched: ['React', 'TypeScript', 'Design Systems'],
    missing: ['Accessibility depth', 'Performance budgets'],
    recommendation:
      'Show one measurable frontend performance improvement to strengthen your fit.',
  },
  'Product Engineer': {
    score: 81,
    matched: ['User-facing systems', 'API integration', 'Ownership'],
    missing: ['Experiment design', 'Product analytics'],
    recommendation:
      'Add a project bullet showing product reasoning and iteration speed.',
  },
  'Backend Developer': {
    score: 74,
    matched: ['Node.js', 'APIs', 'Databases'],
    missing: ['Distributed systems', 'Observability'],
    recommendation:
      'Add deeper backend evidence for scale, reliability, and service design.',
  },
  'ML Intern': {
    score: 69,
    matched: ['Python', 'Model experimentation', 'Hackathons'],
    missing: ['Evaluation rigor', 'Production deployment'],
    recommendation:
      'Highlight one end-to-end ML project with metrics and deployment details.',
  },
} as const;

export function CareerMatchShowcase() {
  const { child } = useMarketingMotion();
  const [activeRole, setActiveRole] =
    useState<keyof typeof roles>('Frontend Engineer');
  const active = roles[activeRole];

  return (
    <MarketingSection className="py-14 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <Card className="marketing-panel">
            <div className="flex flex-wrap gap-2">
              {Object.keys(roles).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActiveRole(role as keyof typeof roles)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    activeRole === role
                      ? 'bg-primary-600 text-white shadow-[0_12px_24px_rgba(99,102,241,0.28)]'
                      : 'marketing-chip hover:text-[var(--marketing-text-primary)]'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            <motion.div
              key={activeRole}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mt-6 space-y-5"
            >
              <div className="marketing-glass rounded-3xl p-5">
                <div className="marketing-muted-soft text-xs uppercase tracking-[0.16em]">Role fit</div>
                <div className="mt-3 flex items-end gap-3">
                  <div className="text-5xl font-semibold text-[var(--marketing-text-primary)]">{active.score}</div>
                  <div className="marketing-muted-soft pb-2 text-sm">/100</div>
                </div>
                <ProgressBar className="mt-5" value={active.score} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="marketing-glass rounded-3xl p-5">
                  <div className="marketing-muted-soft text-xs uppercase tracking-[0.16em]">
                    Matched skills
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {active.matched.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-success/12 px-3 py-1 text-xs font-medium text-success"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="marketing-glass rounded-3xl p-5">
                  <div className="marketing-muted-soft text-xs uppercase tracking-[0.16em]">
                    Missing skills
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {active.missing.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-warning/12 px-3 py-1 text-xs font-medium text-warning"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="marketing-glass marketing-muted rounded-3xl p-5 text-sm leading-7">
                {active.recommendation}
              </div>
            </motion.div>
          </Card>
        </motion.div>

        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <div className="text-xs uppercase tracking-[0.22em] text-primary-400">
            Career match
          </div>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
            See where you fit today and what closes the gap tomorrow.
          </h2>
          <p className="marketing-muted mt-4 text-lg leading-8">
            Credvia maps your effective profile to real job requirements so you can improve with
            evidence, not vague advice.
          </p>
          <div className="marketing-muted mt-8 space-y-3 text-sm">
            {[
              'Role-based scoring that stays grounded in extracted data.',
              'Must-have gaps separated from adjacent, transferable strengths.',
              'A practical roadmap that updates as your profile improves.',
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
      </div>
    </MarketingSection>
  );
}
