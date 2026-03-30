import posthog from 'posthog-js';

if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: '2026-01-30',
    capture_pageview: true,
    capture_pageleave: true,
  });
}
