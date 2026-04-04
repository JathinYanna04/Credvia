'use client';

import { motion } from 'framer-motion';
import { useMarketingMotion } from '@/components/marketing/motion';

export interface AuthShowcasePanelProps {
  eyebrow: string;
  title: string;
  description: string;
  highlights: Array<{ title: string; description: string }>;
}

export function AuthShowcasePanel({
  eyebrow,
  title,
  description,
  highlights,
}: AuthShowcasePanelProps) {
  const { stagger, child } = useMarketingMotion();

  return (
    <motion.div
      className="relative hidden overflow-hidden border-r border-[var(--marketing-border)] px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-14"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <div className="absolute inset-0" style={{ backgroundImage: 'var(--marketing-hero-overlay), var(--marketing-bg-gradient)' }} />
      <div className="absolute inset-0 grid-noise opacity-[0.08]" />
      <motion.div variants={child} className="relative text-2xl font-semibold text-[var(--marketing-text-primary)]">
        Credvia
      </motion.div>
      <div className="relative max-w-xl">
        <motion.div variants={child} className="marketing-kicker text-xs uppercase tracking-[0.22em]">
          {eyebrow}
        </motion.div>
        <motion.h1 variants={child} className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--marketing-text-primary)]">
          {title}
        </motion.h1>
        <motion.p variants={child} className="marketing-muted mt-5 text-base leading-8">
          {description}
        </motion.p>
      </div>
      <motion.div variants={stagger} className="relative grid gap-4 text-sm">
        {highlights.map((item) => (
          <motion.div
            key={item.title}
            variants={child}
            className="marketing-glass rounded-[20px] p-4 shadow-sm"
          >
            <div className="font-medium text-[var(--marketing-text-primary)]">{item.title}</div>
            <div className="marketing-muted mt-1 leading-7">{item.description}</div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
