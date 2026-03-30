import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { DM_Sans } from 'next/font/google';
import Script from 'next/script';
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

const themeScript = `
(() => {
  try {
    const theme = localStorage.getItem('credvia-theme');
    const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.style.colorScheme = resolvedTheme;
  } catch {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg-base font-body text-text-primary antialiased">
        <Script id="credvia-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <PostHogInit />
        {children}
      </body>
    </html>
  );
}
