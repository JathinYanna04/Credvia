'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useMarketingMotion } from '@/components/marketing/motion';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export interface AuthFormShellProps {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthFormShell({
  title,
  description,
  footer,
  children,
}: AuthFormShellProps) {
  const { child } = useMarketingMotion();

  return (
    <section className="relative flex items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0" style={{ backgroundImage: 'var(--marketing-hero-overlay), var(--marketing-bg-gradient)' }} />
      <div className="absolute inset-0 grid-noise opacity-[0.07]" />
      <motion.div
        variants={child}
        initial="hidden"
        animate="show"
        className="marketing-panel-strong relative w-full max-w-md rounded-[28px] p-6 backdrop-blur-xl sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="marketing-kicker text-xs uppercase tracking-[0.18em] lg:hidden">
            Credvia
          </Link>
          <ThemeToggle compact />
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-[var(--marketing-text-primary)]">{title}</h1>
        <p className="marketing-muted mt-2 text-sm leading-7">{description}</p>
        <div className="mt-8">{children}</div>
        <div className="marketing-muted mt-8 text-sm">{footer}</div>
      </motion.div>
    </section>
  );
}
