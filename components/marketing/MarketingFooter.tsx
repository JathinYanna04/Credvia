'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { MarketingSection, useMarketingMotion } from '@/components/marketing/motion';

export function MarketingFooter() {
  const { child } = useMarketingMotion();

  return (
    <MarketingSection className="pb-12 pt-4 sm:pb-16">
      <motion.footer
        variants={child}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="marketing-panel-strong rounded-[32px] px-6 py-8 backdrop-blur-xl sm:px-8"
      >
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="inline-flex items-center gap-3 text-[var(--marketing-text-primary)]">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] shadow-[0_12px_28px_rgba(99,102,241,0.32)]">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-lg font-semibold">Credvia</span>
            </div>
            <p className="marketing-muted mt-4 max-w-md text-sm leading-7">
              Build a professional identity shaped by contribution, sharpen your resume with AI
              intelligence, and validate what you are building in public.
            </p>
          </div>

          <div>
            <div className="text-sm font-semibold text-[var(--marketing-text-primary)]">Product</div>
            <div className="marketing-muted mt-4 space-y-3 text-sm">
              <Link href="/signup" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Get Started
              </Link>
              <Link href="/login" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Sign in
              </Link>
              <Link href="/communities" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Communities
              </Link>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-[var(--marketing-text-primary)]">Explore</div>
            <div className="marketing-muted mt-4 space-y-3 text-sm">
              <Link href="#resume-intelligence" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Resume intelligence
              </Link>
              <Link href="#community-validation" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Startup validation
              </Link>
              <Link href="#how-it-works" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                How it works
              </Link>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-[var(--marketing-text-primary)]">Company</div>
            <div className="marketing-muted mt-4 space-y-3 text-sm">
              <Link href="/" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Brand
              </Link>
              <Link href="/login" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Support
              </Link>
              <Link href="/signup" className="block transition-colors hover:text-[var(--marketing-text-primary)]">
                Create account
              </Link>
            </div>
          </div>
        </div>
      </motion.footer>
    </MarketingSection>
  );
}
