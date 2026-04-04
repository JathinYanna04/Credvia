'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        default:
          'bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white shadow-[0_16px_32px_rgba(99,102,241,0.24)] hover:-translate-y-0.5',
        secondary:
          'border border-border-subtle bg-bg-surface text-text-primary shadow-sm hover:-translate-y-0.5 hover:border-border-default hover:bg-bg-overlay/80',
        outline:
          'border border-border-subtle bg-transparent text-text-primary hover:bg-bg-overlay hover:text-text-primary',
        ghost: 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary',
        destructive:
          'bg-danger text-white shadow-[0_14px_26px_rgba(239,68,68,0.22)] hover:-translate-y-0.5',
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-9 rounded-xl px-3',
        lg: 'h-12 px-5 text-sm',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    if (asChild) {
      // Radix Slot must receive exactly one React element child.
      const onlyChild = React.Children.only(children);

      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          aria-disabled={disabled || loading}
          {...props}
        >
          {onlyChild}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
