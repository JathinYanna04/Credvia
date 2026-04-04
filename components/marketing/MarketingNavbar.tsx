'use client';

import Link from 'next/link';
import { Menu, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, useScroll } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

const navLinks = [
  { label: 'Home', href: '#top' },
  { label: 'How it Works', href: '#how-it-works' },
  { label: 'For Founders', href: '#community-validation' },
  { label: 'For Students', href: '#resume-intelligence' },
];

export function MarketingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => scrollY.on('change', (value) => setScrolled(value > 36)), [scrollY]);

  return (
    <>
      <motion.header
        className={cn(
          'sticky top-0 z-50 border-b transition-all duration-300',
          scrolled
            ? 'marketing-glass shadow-[0_18px_40px_rgba(3,7,18,0.14)]'
            : 'border-transparent bg-transparent',
        )}
        initial={prefersReducedMotion ? false : { opacity: 0, y: -22 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="marketing-shell flex items-center justify-between py-4">
          <Link href="/" className="group inline-flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white shadow-[0_10px_25px_rgba(99,102,241,0.35)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_18px_36px_rgba(99,102,241,0.42)]">
              <Sparkles className="h-4 w-4 transition-transform duration-200 group-hover:rotate-6" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-[var(--marketing-text-primary)]">Credvia</span>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex">
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group relative text-sm font-medium marketing-muted transition-colors duration-200 hover:text-[var(--marketing-text-primary)]"
              >
                {item.label}
                <span className="absolute -bottom-1 left-1/2 h-px w-0 -translate-x-1/2 bg-[linear-gradient(90deg,#6366F1,#A5B4FC)] transition-all duration-200 group-hover:w-full" />
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <ThemeToggle compact />
            <Button asChild variant="ghost" className="marketing-muted hover:bg-bg-overlay/60 hover:text-[var(--marketing-text-primary)]">
              <Link href="/login">
                <span>Sign in</span>
              </Link>
            </Button>
            <Button asChild>
              <Link href="/signup">
                <span>Get Started</span>
              </Link>
            </Button>
          </div>

          <button
            type="button"
            className="marketing-glass inline-flex h-11 w-11 items-center justify-center rounded-2xl lg:hidden"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="marketing-page fixed inset-0 z-40 px-6 pb-8 pt-24 backdrop-blur-xl lg:hidden"
            initial={prefersReducedMotion ? false : { opacity: 0, y: -18 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.28 }}
          >
            <div className="flex h-full flex-col justify-between">
              <div className="space-y-4">
                {navLinks.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                    animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * index, duration: 0.3 }}
                  >
                    <Link
                      href={item.href}
                      className="marketing-glass block rounded-2xl px-4 py-4 text-lg font-medium text-[var(--marketing-text-primary)]"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
              </div>
              <div className="space-y-3">
                <ThemeToggle />
                <Button asChild variant="secondary" className="w-full">
                  <Link href="/login">
                    <span>Sign in</span>
                  </Link>
                </Button>
                <Button asChild className="w-full">
                  <Link href="/signup">
                    <span>Get Started</span>
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
