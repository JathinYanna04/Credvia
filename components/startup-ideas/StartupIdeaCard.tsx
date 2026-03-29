import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { VoteButtons } from '@/components/voting/VoteButtons';
import { ValidationScoreBadge } from '@/components/startup-ideas/ValidationScoreBadge';
import type { PostSummary } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils/format';

export interface StartupIdeaCardProps {
  idea: PostSummary;
}

export function StartupIdeaCard({ idea }: StartupIdeaCardProps) {
  if (!idea.startupIdea) {
    return null;
  }

  return (
    <article className="surface-panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <Badge variant="secondary">{idea.community.name}</Badge>
        <Badge variant="outline">{idea.startupIdea.stage.replaceAll('_', ' ')}</Badge>
        <Badge variant="info">{idea.startupIdea.marketCategory}</Badge>
        <span>{formatRelativeTime(idea.createdAt)}</span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <VoteButtons
          score={idea.voteScore}
          endpoint={`/api/v1/posts/${idea.id}/vote`}
          orientation="vertical"
          className="hidden sm:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/ideas/${idea.id}`} className="block">
              <h2 className="text-xl font-semibold text-text-primary transition hover:text-accent">
                {idea.title}
              </h2>
            </Link>
            <ValidationScoreBadge score={idea.startupIdea.validationScore} compact />
          </div>

          <p className="mt-3 text-sm text-text-secondary">
            <span className="text-text-primary">Problem:</span> {idea.startupIdea.problem}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            <span className="text-text-primary">Audience:</span> {idea.startupIdea.targetAudience}
          </p>
          <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
            <span className="text-text-primary">Solution:</span> {idea.startupIdea.solution}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-secondary sm:hidden">
            <VoteButtons score={idea.voteScore} endpoint={`/api/v1/posts/${idea.id}/vote`} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">
            <Badge variant="secondary">{idea.commentCount} comments</Badge>
            <Badge variant="secondary">
              {idea.startupIdea.uniqueCommenters} unique voices
            </Badge>
            {idea.startupIdea.monetizationModel ? (
              <Badge variant="secondary">{idea.startupIdea.monetizationModel}</Badge>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
