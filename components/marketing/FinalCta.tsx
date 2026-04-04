'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

export function FinalCta() {
  const { child, prefersReducedMotion } = useMarketingMotion();

  return (
    <MarketingSection className="py-16 sm:py-24">
      <motion.div
        variants={child}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="marketing-panel-strong relative overflow-hidden rounded-[36px] px-6 py-12 text-center sm:px-8"
      >
        <motion.div
          className="absolute inset-x-16 top-8 h-36 rounded-full bg-primary-600/20 blur-3xl"
          animate={
            prefersReducedMotion
              ? undefined
              : { scale: [0.96, 1.08, 0.96], opacity: [0.45, 0.75, 0.45] }
          }
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative mx-auto max-w-3xl">
          <div className="marketing-kicker text-xs uppercase tracking-[0.18em]">
            Build your next opportunity on Credvia
          </div>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-[var(--marketing-text-primary)] sm:text-5xl">
            Start with your resume. Stay for your reputation.
          </h2>
          <p className="marketing-muted mt-4 text-lg leading-8">
            One profile. Better signal. Stronger momentum across career growth, idea validation,
            and visible contribution.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup" className="inline-flex items-center gap-2">
                <span>Get Started Free</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="shadow-none"
            >
              <Link href="/login">
                <span>Sign in</span>
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </MarketingSection>
  );
}
