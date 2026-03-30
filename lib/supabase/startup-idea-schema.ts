const ADVANCED_SCHEMA_ERROR_PATTERNS = [
  "startup_ideas.current_revision_id",
  "startup_ideas.revision_count",
  "startup_ideas.follower_count",
  "startup_ideas.last_revision_at",
  "public.startup_idea_revisions",
  "public.idea_followers",
];

export function isMissingStartupIdeaAdvancedSchemaError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error ?? '');

  return ADVANCED_SCHEMA_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}
