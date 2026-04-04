'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

export function MidPageCta() {
  const { child } = useMarketingMotion();

  return (
    <MarketingSection className="py-10 sm:py-14">
      <motion.div
        variants={child}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="marketing-panel-strong rounded-[32px] border-primary-500/20 bg-[linear-gradient(135deg,rgba(99,102,241,0.18),rgba(139,92,246,0.12),rgba(255,255,255,0.72))] px-6 py-8 sm:px-8 dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.22),rgba(139,92,246,0.16),rgba(8,17,33,0.92))]"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="marketing-kicker text-xs uppercase tracking-[0.18em]">
              Start now
            </div>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-4xl">
              Upload your resume and see what recruiters miss.
            </h3>
            <p className="marketing-muted mt-3 max-w-2xl text-sm leading-7">
              Credvia turns one upload into extraction, ATS clarity, career match, and a stronger
              professional signal.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/signup" className="inline-flex items-center gap-2">
              <span>Create your account</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </motion.div>
    </MarketingSection>
  );
}
