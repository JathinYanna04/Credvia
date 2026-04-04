import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import '@/app/globals.css';
import { PostHogInit } from '@/components/analytics/PostHogInit';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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
    const storedTheme = localStorage.getItem('credvia-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme =
      storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : prefersDark
          ? 'dark'
          : 'light';
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.style.colorScheme = resolvedTheme;
  } catch {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
    document.documentElement.style.colorScheme = prefersDark ? 'dark' : 'light';
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
      className={`${inter.variable} ${GeistMono.variable}`}
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
