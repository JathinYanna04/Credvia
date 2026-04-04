'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils/cn';

export const marketingViewport = {
  once: true,
  amount: 0.2,
} as const;

export function useMarketingMotion() {
  const prefersReducedMotion = useReducedMotion();

  const fadeUp = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        whileInView: { opacity: 1 },
        transition: { duration: 0.35 },
      }
    : {
        initial: { opacity: 0, y: 28, filter: 'blur(10px)' },
        whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
      };

  const stagger = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.02 } },
      }
    : {
        hidden: {},
        show: { transition: { staggerChildren: 0.1, delayChildren: 0.08 } },
      };

  const child = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.3 } },
      }
    : {
        hidden: { opacity: 0, y: 24, scale: 0.98, filter: 'blur(8px)' },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
        },
      };

  return { prefersReducedMotion, fadeUp, stagger, child };
}

export function MarketingSection({
  className,
  id,
  children,
}: PropsWithChildren<{ className?: string; id?: string }>) {
  const { fadeUp } = useMarketingMotion();

  return (
    <motion.section
      id={id}
      className={cn('marketing-shell relative w-full', className)}
      viewport={marketingViewport}
      initial={fadeUp.initial}
      whileInView={fadeUp.whileInView}
      transition={fadeUp.transition}
    >
      {children}
    </motion.section>
  );
}
