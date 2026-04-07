import { z } from 'zod';

export const LoginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
  })
  .strict();

export const SignupSchema = z
  .object({
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .regex(/[A-Z]/, 'Password must include an uppercase letter.')
      .regex(/[a-z]/, 'Password must include a lowercase letter.')
      .regex(/[0-9]/, 'Password must include a number.'),
  })
  .strict();

export const ForgotPasswordSchema = z.object({ email: z.string().email() }).strict();

export const ResetPasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match.',
  });

export const OnboardingProfileSchema = z
  .object({
    username: z.string().regex(/^[a-z0-9_-]{3,30}$/),
    full_name: z.string().min(2).max(80),
    headline: z.string().min(10).max(160),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
  })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;
export type SignupInput = z.infer<typeof SignupSchema>;
