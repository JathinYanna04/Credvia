import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border text-sm font-medium transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-accent px-4 text-bg-base shadow-[0_0_0_1px_rgba(34,211,238,0.15)] hover:bg-accent-dim hover:text-text-primary',
        secondary:
          'border-border-subtle bg-bg-surface text-text-primary hover:border-border-default hover:bg-bg-overlay',
        outline:
          'border-border-default bg-transparent text-text-primary hover:border-accent hover:bg-bg-overlay',
        ghost: 'border-transparent bg-transparent text-text-secondary hover:bg-bg-overlay hover:text-text-primary',
        destructive:
          'border-transparent bg-danger text-white hover:opacity-90',
        link: 'border-transparent bg-transparent px-0 text-accent hover:text-text-primary',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-12 px-6 text-base',
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
