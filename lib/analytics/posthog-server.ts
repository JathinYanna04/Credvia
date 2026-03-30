import { PostHog } from 'posthog-node';

export function createPostHogServerClient() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

  if (!token) {
    return null;
  }

  return new PostHog(token, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
}
