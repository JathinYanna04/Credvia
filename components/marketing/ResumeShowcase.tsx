'use client';

import { FileText, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

export function ResumeShowcase() {
  const { child } = useMarketingMotion();

  return (
    <MarketingSection id="resume-intelligence" className="py-14 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <div className="text-xs uppercase tracking-[0.22em] text-primary-400">
            Resume intelligence
          </div>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
            Upload a resume and get a profile you can actually trust.
          </h2>
          <p className="marketing-muted mt-4 text-lg leading-8">
            Credvia extracts, validates, refines, and scores your resume so parsed profile, ATS
            analysis, and job matching always agree.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              'Structured extraction',
              'ATS breakdown',
              'Manual review',
              'Truthful diagnostics',
            ].map((item) => (
              <span
                key={item}
                className="marketing-chip rounded-full px-4 py-2 text-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div variants={child} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
          <Card className="marketing-panel">
            <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="marketing-glass rounded-3xl p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--marketing-text-primary)]">
                  <FileText className="h-4 w-4 text-primary-400" />
                  Resume health
                </div>
                <div className="mt-6 text-5xl font-semibold text-[var(--marketing-text-primary)]">91</div>
                <div className="marketing-muted-soft mt-2 text-sm">ATS readiness score</div>
                <ProgressBar className="mt-6" value={91} />
              </div>

              <div className="space-y-4">
                <div className="marketing-glass rounded-3xl p-5">
                  <div className="marketing-muted-soft text-xs uppercase tracking-[0.16em]">
                    Extracted signals
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['React', 'TypeScript', 'FastAPI', 'PostgreSQL', 'System Design'].map(
                      (item) => (
                        <span
                          key={item}
                          className="rounded-full bg-primary-600/12 px-3 py-1 text-xs font-medium text-primary-300"
                        >
                          {item}
                        </span>
                      ),
                    )}
                  </div>
                </div>

                <div className="marketing-glass rounded-3xl p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--marketing-text-primary)]">
                    <Sparkles className="h-4 w-4 text-primary-400" />
                    Suggested improvements
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      'Add stronger quantified outcomes to your top two projects.',
                      'Tighten the summary so recruiters see your role signal faster.',
                      'Clarify one backend achievement to strengthen full-stack fit.',
                    ].map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-[var(--marketing-border)] bg-bg-base/40 px-4 py-3 text-sm text-[var(--marketing-text-secondary)]"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </MarketingSection>
  );
}
