'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

export function ReputationShowcase() {
  const { child, prefersReducedMotion } = useMarketingMotion();

  return (
    <MarketingSection className="py-14 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <Card className="marketing-panel">
            <div className="marketing-kicker text-xs uppercase tracking-[0.16em]">
              Contribution reputation
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ['148', 'Contribution score'],
                ['29', 'Helpful feedbacks'],
                ['12', 'Validated insights'],
                ['9', 'Consistency streak'],
              ].map(([value, label], index) => (
                <motion.div
                  key={label}
                  className="marketing-glass rounded-3xl p-5"
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    delay: prefersReducedMotion ? 0 : index * 0.06,
                    duration: 0.45,
                  }}
                >
                  <div className="text-4xl font-semibold text-[var(--marketing-text-primary)]">{value}</div>
                  <div className="marketing-muted mt-2 text-sm">{label}</div>
                </motion.div>
              ))}
            </div>

            <div className="marketing-glass mt-6 rounded-3xl p-5">
              <div className="text-sm font-semibold text-[var(--marketing-text-primary)]">Trust growth</div>
              <div className="mt-5 flex h-32 items-end gap-3">
                {[35, 50, 46, 70, 78, 88, 100].map((height, index) => (
                  <motion.div
                    key={index}
                    className="flex-1 rounded-t-2xl bg-[linear-gradient(180deg,#6366F1,#8B5CF6)]"
                    initial={{ height: 0 }}
                    whileInView={{ height: `${height}%` }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{
                      delay: prefersReducedMotion ? 0 : 0.08 * index,
                      duration: 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <div className="marketing-kicker text-xs uppercase tracking-[0.22em]">
            Credibility layer
          </div>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
            Build a professional identity that gets stronger every time you help.
          </h2>
          <p className="marketing-muted mt-4 text-lg leading-8">
            Credvia makes trust visible through consistent contribution, sharper answers, better
            projects, and repeated community value.
          </p>
          <div className="mt-8 space-y-3">
            {[
              'Reputation grows through visible work, not empty profile claims.',
              'Your community participation compounds into a stronger professional story.',
              'Career opportunity improves as your public signal becomes easier to trust.',
            ].map((item) => (
              <div
                key={item}
                className="marketing-chip rounded-2xl px-4 py-3 text-sm"
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
