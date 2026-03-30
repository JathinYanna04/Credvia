import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { DM_Sans } from 'next/font/google';
import '@/app/globals.css';
import { PostHogInit } from '@/components/analytics/PostHogInit';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Credvia',
    template: '%s | Credvia',
  },
  description:
    'Build reputation through contribution. Credvia is a professional community platform for students, builders, and early-career professionals.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg-base font-body text-text-primary antialiased">
        <PostHogInit />
        {children}
      </body>
    </html>
  );
}
