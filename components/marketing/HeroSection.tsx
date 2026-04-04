'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useMarketingMotion } from '@/components/marketing/motion';

export function HeroSection() {
  const { prefersReducedMotion, stagger, child } = useMarketingMotion();

  return (
    <section id="top" className="relative overflow-hidden px-4 pb-16 pt-8 sm:px-6 sm:pb-20">
      <div className="absolute inset-0" style={{ backgroundImage: 'var(--marketing-hero-overlay)' }} />
      <div className="absolute inset-0" style={{ backgroundImage: 'var(--marketing-bg-gradient)' }} />
      <div className="absolute inset-0 grid-noise opacity-[0.08]" />

      <div className="relative mx-auto grid max-w-[1300px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <motion.div
          className="space-y-8"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <motion.div
            variants={child}
            className="marketing-chip marketing-kicker inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.24em]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Build reputation through contribution
          </motion.div>

          <div className="space-y-5">
            {[
              'Turn resumes into momentum.',
              'Turn contribution into credibility.',
            ].map((line) => (
              <motion.h1
                key={line}
                variants={child}
                className="max-w-4xl text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.04em] text-[var(--marketing-text-primary)] sm:text-6xl lg:text-7xl"
              >
                {line}
              </motion.h1>
            ))}
            <motion.p variants={child} className="marketing-muted max-w-2xl text-lg leading-8">
              Credvia combines AI resume intelligence, evidence-based career matching, community validation, and contribution-driven reputation into one premium workspace.
            </motion.p>
          </div>

          <motion.div variants={child} className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="shadow-[0_20px_40px_rgba(99,102,241,0.32)]">
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
              <Link href="#resume-intelligence" className="inline-flex items-center gap-2">
                <span>Explore the platform</span>
              </Link>
            </Button>
          </motion.div>

          <motion.div variants={child} className="flex flex-wrap gap-2">
            {[
              'AI Resume Review',
              'Career Match Insights',
              'Community Validation',
              'Contribution Score',
            ].map((chip) => (
              <span
                key={chip}
                className="marketing-chip rounded-full px-4 py-2 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-400/40 hover:text-[var(--marketing-text-primary)]"
              >
                {chip}
              </span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="relative min-h-[520px]"
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97, y: 32 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="absolute inset-x-10 top-8 h-48 rounded-full bg-primary-600/20 blur-3xl"
            animate={
              prefersReducedMotion
                ? undefined
                : { y: [-10, 10, -10], opacity: [0.55, 0.85, 0.55] }
            }
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          <Card className="marketing-panel-strong relative z-10 p-0 backdrop-blur-xl">
            <div className="rounded-t-[16px] border-b border-[var(--marketing-border)] px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="marketing-kicker text-xs uppercase tracking-[0.2em]">
                    Live career workspace
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--marketing-text-primary)]">
                    Your profile is fully analyzed
                  </div>
                </div>
                <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                  Ready
                </span>
              </div>
            </div>

            <div className="grid gap-5 p-6">
              <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
                <div className="marketing-glass rounded-3xl p-5">
                  <div className="marketing-muted-soft text-xs uppercase tracking-[0.16em]">ATS score</div>
                  <div className="mt-3 flex items-end gap-3">
                    <div className="text-6xl font-semibold tracking-tight text-[var(--marketing-text-primary)]">88</div>
                    <div className="marketing-muted-soft pb-2 text-sm">/100</div>
                  </div>
                  <div className="mt-4">
                    <ProgressBar value={88} className="[&_span]:text-[var(--marketing-text-secondary)]" />
                  </div>
                </div>
                <div className="marketing-glass rounded-3xl p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--marketing-text-primary)]">
                    <BriefcaseBusiness className="h-4 w-4 text-primary-400" />
                    Career match readiness
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      ['React', 'Matched'],
                      ['TypeScript', 'Matched'],
                      ['System Design', 'Gap'],
                      ['Node.js', 'Matched'],
                    ].map(([skill, status]) => (
                      <div
                        key={skill}
                        className="rounded-2xl border border-[var(--marketing-border)] bg-bg-base/40 px-4 py-3"
                      >
                        <div className="text-sm text-[var(--marketing-text-primary)]">{skill}</div>
                        <div
                          className={`mt-1 text-xs ${status === 'Matched' ? 'text-success' : 'text-warning'}`}
                        >
                          {status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    icon: MessageSquareText,
                    title: 'Community signal',
                    text: 'Your thoughtful answers are building visible trust.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Truthful diagnostics',
                    text: 'Resume, ATS, and match all read from one canonical profile.',
                  },
                  {
                    icon: Radar,
                    title: 'Role-fit tracking',
                    text: 'See how each improvement changes your opportunity surface.',
                  },
                ].map((item, index) => (
                  <motion.div
                    key={item.title}
                    className="marketing-glass rounded-3xl p-5"
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : { y: index % 2 === 0 ? [0, -8, 0] : [0, -12, 0] }
                    }
                    transition={{ duration: 6 + index, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <item.icon className="h-5 w-5 text-primary-400" />
                    <div className="mt-4 text-sm font-semibold text-[var(--marketing-text-primary)]">{item.title}</div>
                    <p className="marketing-muted mt-2 text-sm leading-6">{item.text}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
