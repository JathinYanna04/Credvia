"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FeedEmpty } from "@/components/feed/FeedEmpty";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { InfiniteScroll } from "@/components/feed/InfiniteScroll";
import { PostCardSkeleton } from "@/components/feed/PostCardSkeleton";
import { PostCard } from "@/components/feed/PostCard";
import { ProfileCompletionChecklist } from "@/components/profile/ProfileCompletionChecklist";
import { useFeed } from "@/lib/hooks/useFeed";
import { getPersonaDefinition, normalizePersonaSlug, type PersonaSlug } from '@/lib/personas';
import type { ProfileCompletionState } from "@/lib/profile-completion";
import type { FeedTab } from "@/lib/types";

export default function FeedPage() {
  const [tab, setTab] = useState<FeedTab>("for-you");
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState(false);
  const [persona, setPersona] = useState<PersonaSlug | null>(null);
  const [profileCompletion, setProfileCompletion] = useState<ProfileCompletionState | null>(null);
  const { posts, isLoading, isEmpty, error, authExpired, retry, updateVote } =
    useFeed(tab);

  useEffect(() => {
    fetch("/api/v1/users/me")
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          data?: {
            profile?: { onboarding_complete?: boolean; primary_persona?: string | null };
            profileCompletion?: ProfileCompletionState;
          };
        };

        const nextPersona = normalizePersonaSlug(payload.data?.profile?.primary_persona);
        setPersona(nextPersona);
        setProfileCompletion(payload.data?.profileCompletion ?? null);
        setShowOnboardingPrompt(
          !(payload.data?.profile?.onboarding_complete ?? true),
        );
      })
      .catch(() => undefined);
  }, []);

  const personaDefinition = persona ? getPersonaDefinition(persona) : null;
  const helperCards = personaDefinition
    ? [
        [personaDefinition.label, personaDefinition.feedHint],
        ['Suggested next move', personaDefinition.suggestedActions[0] ?? 'Join a relevant community'],
        ['Profile tone', personaDefinition.emptyStateTone],
      ]
    : [
        [
          "Your network",
          "Follow conversations where you can add real value",
        ],
        [
          "Trending topics",
          "See what technical communities are discussing today",
        ],
        [
          "Career signal",
          "Share work that strengthens both feed presence and profile identity",
        ],
      ];

  return (
    <div className="w-full space-y-6 pb-24 sm:space-y-7 sm:pb-8">
      <header className="premium-soft-gradient rounded-[28px] border border-border-subtle px-5 py-6 shadow-sm sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Home</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              {personaDefinition
                ? `Read the conversations that matter for a ${personaDefinition.label.toLowerCase()}, contribute where you have signal, and let your profile compound from there.`
                : 'Read strong questions, help someone move forward, and build reputation where your work is strongest.'}
            </p>
          </div>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/post/new">Ask or share</Link>
          </Button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {helperCards.map(([title, copy]) => (
            <div
              key={title}
              className="rounded-[20px] bg-bg-surface/80 p-4 shadow-sm"
            >
              <div className="text-sm font-semibold text-text-primary">
                {title}
              </div>
              <div className="mt-2 text-sm leading-6 text-text-secondary">
                {copy}
              </div>
            </div>
          ))}
        </div>
      </header>

      {showOnboardingPrompt ? (
        <div className="surface-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Make your feed sharper
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {personaDefinition
                ? `Finish your ${personaDefinition.label.toLowerCase()} setup so Credvia can shape your profile and recommendations around the right intent.`
                : 'You can keep browsing now, then add skills and communities when you are ready.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/communities">Join communities</Link>
            </Button>
            <Button asChild>
              <Link href="/onboarding">Finish onboarding</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {profileCompletion ? (
        <ProfileCompletionChecklist
          completion={profileCompletion}
          compact
          title="Build more signal when you are ready"
          description="These next steps improve trust and discovery, but they do not need to block your first session."
        />
      ) : null}

      <FeedTabs value={tab} onValueChange={setTab} />

      <div className="space-y-4">
        {authExpired ? (
          <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <span>
              Your session expired. Sign in again to keep reading your feed.
            </span>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        ) : null}
        {error ? (
          <div className="surface-panel flex flex-col gap-3 p-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {isLoading ? (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        ) : null}
        {isEmpty ? <FeedEmpty persona={persona} /> : null}
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} onVoteChange={updateVote} />
        ))}
      </div>

      <InfiniteScroll />
    </div>
  );
}
