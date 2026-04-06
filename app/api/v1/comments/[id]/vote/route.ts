import { fail, handleApiError, ok, parseJson } from "@/lib/api";
import { buildServerVersion, type VoteDirection, type VoteValue } from '@/lib/voting';
import { VoteCommentSchema } from "@/lib/schemas/comment";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getRequiredUser, isRecoverableSupabaseReadError } from "@/lib/supabase/helpers";
import { logError, logInfo } from '@/lib/utils/logger';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const verboseLogging = process.env.NODE_ENV !== 'production';
  let authUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    authUserId = user.id;
    const body = await parseJson(request, VoteCommentSchema);
    const requestedDirection =
      body.direction ??
      (body.value === 1 || body.value === -1
        ? (body.value as VoteDirection)
        : undefined);

    if (verboseLogging) {
      logInfo('api-vote-comment', 'Vote request received', {
        userId: user.id,
        commentId: params.id,
        requestedDirection: requestedDirection ?? null,
        requestedValue: body.value ?? null,
      });
    }

    const limit = await enforceRateLimit(
      "vote",
      `${user.id}:comment:${params.id}`,
    );

    if (!limit.success) {
      return fail("RATE_LIMITED", "Too many votes. Try again shortly.", 429);
    }

    const commentResult = await supabase
      .from("comments")
      .select("id, author_id, post_id")
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (commentResult.error) {
      throw new Error(commentResult.error.message);
    }

    if (!commentResult.data) {
      return fail("NOT_FOUND", "Comment not found.", 404);
    }

    const previousVoteResult = await supabase
      .from('votes')
      .select('value')
      .eq('user_id', user.id)
      .eq('entity_type', 'comment')
      .eq('entity_id', params.id)
      .maybeSingle();

    if (previousVoteResult.error) {
      throw new Error(previousVoteResult.error.message);
    }

    const previousVote = (previousVoteResult.data?.value ?? 0) as VoteValue;
    const desiredVote =
      requestedDirection === undefined
        ? (body.value ?? 0)
        : previousVote === requestedDirection
          ? 0
          : requestedDirection;

    if (desiredVote === 0) {
      const deleteResult = await supabase
        .from("votes")
        .delete()
        .eq("user_id", user.id)
        .eq("entity_type", "comment")
        .eq("entity_id", params.id);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }
    } else {
      const insertResult = await supabase.from("votes").upsert(
        {
          user_id: user.id,
          entity_type: "comment",
          entity_id: params.id,
          value: desiredVote,
        },
        {
          onConflict: "user_id,entity_type,entity_id",
        },
      );

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    }

    const [refreshedComment, refreshedVote, upvoteCountResult, downvoteCountResult] = await Promise.all([
      supabase
      .from("comments")
      .select("id, vote_score, updated_at")
      .eq("id", params.id)
      .single(),
      supabase
        .from("votes")
        .select("value")
        .eq("user_id", user.id)
        .eq("entity_type", "comment")
        .eq("entity_id", params.id)
        .maybeSingle(),
      supabase
        .from('votes')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'comment')
        .eq('entity_id', params.id)
        .eq('value', 1),
      supabase
        .from('votes')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'comment')
        .eq('entity_id', params.id)
        .eq('value', -1),
    ]);

    if (refreshedComment.error) {
      throw new Error(refreshedComment.error.message);
    }

    if (refreshedVote.error) {
      throw new Error(refreshedVote.error.message);
    }

    if (upvoteCountResult.error) {
      throw new Error(upvoteCountResult.error.message);
    }

    if (downvoteCountResult.error) {
      throw new Error(downvoteCountResult.error.message);
    }

    const nextVote = (refreshedVote.data?.value ?? 0) as VoteValue;
    const contributionDelta = nextVote - previousVote;

    if (verboseLogging) {
      logInfo('api-vote-comment', 'Vote mutation applied', {
        userId: user.id,
        commentId: params.id,
        previousVote,
        nextVote,
        contributionDelta,
      });
    }

    if (contributionDelta !== 0 && commentResult.data.author_id !== user.id) {
      const sideEffectClient = createServiceRoleClient();

      if (sideEffectClient) {
        try {
          const activeVoteDelta = (nextVote === 0 ? 0 : 1) - (previousVote === 0 ? 0 : 1);
          const [authorProfileResult, authorStatsResult, voterStatsResult, postCommunityResult] = await Promise.all([
            sideEffectClient
              .from('profiles')
              .select('user_id, contribution_score, credibility_score, helpfulness_score')
              .eq('user_id', commentResult.data.author_id)
              .maybeSingle(),
            sideEffectClient
              .from('user_contribution_stats')
              .select('*')
              .eq('user_id', commentResult.data.author_id)
              .maybeSingle(),
            sideEffectClient
              .from('user_contribution_stats')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle(),
            sideEffectClient
              .from('posts')
              .select('community_id')
              .eq('id', commentResult.data.post_id)
              .maybeSingle(),
          ]);

          if (authorProfileResult.error) {
            throw new Error(authorProfileResult.error.message);
          }

          if (authorStatsResult.error) {
            throw new Error(authorStatsResult.error.message);
          }

          if (voterStatsResult.error) {
            throw new Error(voterStatsResult.error.message);
          }

          if (postCommunityResult.error) {
            throw new Error(postCommunityResult.error.message);
          }

          if (authorProfileResult.data) {
            const authorUpdate = await sideEffectClient
              .from('profiles')
              .update({
                contribution_score: Math.max(
                  0,
                  (authorProfileResult.data.contribution_score ?? 0) + contributionDelta * 2,
                ),
                credibility_score: Math.max(
                  0,
                  (authorProfileResult.data.credibility_score ?? 0) + contributionDelta,
                ),
                helpfulness_score: Math.max(
                  0,
                  (authorProfileResult.data.helpfulness_score ?? 0) + (contributionDelta > 0 ? 1 : -1),
                ),
              })
              .eq('user_id', commentResult.data.author_id);

            if (authorUpdate.error) {
              throw new Error(authorUpdate.error.message);
            }
          }

          const authorStatsUpsert = await sideEffectClient
            .from('user_contribution_stats')
            .upsert(
              {
                user_id: commentResult.data.author_id,
                votes_received: Math.max(
                  0,
                  (authorStatsResult.data?.votes_received ?? 0) + contributionDelta,
                ),
              },
              { onConflict: 'user_id' },
            );

          if (authorStatsUpsert.error) {
            throw new Error(authorStatsUpsert.error.message);
          }

          const voterStatsUpsert = await sideEffectClient
            .from('user_contribution_stats')
            .upsert(
              {
                user_id: user.id,
                votes_cast: Math.max(0, (voterStatsResult.data?.votes_cast ?? 0) + activeVoteDelta),
              },
              { onConflict: 'user_id' },
            );

          if (voterStatsUpsert.error) {
            throw new Error(voterStatsUpsert.error.message);
          }

          const interactionInsert = await sideEffectClient.from('interaction_events').insert({
            actor_user_id: user.id,
            target_user_id: commentResult.data.author_id,
            entity_type: 'comment',
            entity_id: params.id,
            interaction_type: nextVote === 1 ? 'upvote' : nextVote === -1 ? 'downvote' : 'remove_vote',
            value: contributionDelta,
            metadata: {
              post_id: commentResult.data.post_id,
            },
          });

          if (interactionInsert.error) {
            throw new Error(interactionInsert.error.message);
          }

          const trustEdgeUpsert = await sideEffectClient.from('trust_edges').upsert({
            source_user_id: user.id,
            target_user_id: commentResult.data.author_id,
            domain_tag: 'general',
            edge_type: 'vote_signal',
            weight: contributionDelta,
            evidence_entity_type: 'comment',
            evidence_entity_id: params.id,
            metadata: {
              vote: nextVote,
            },
          });

          if (trustEdgeUpsert.error) {
            throw new Error(trustEdgeUpsert.error.message);
          }

          if (postCommunityResult.data?.community_id) {
            const repInsert = await sideEffectClient.from('reputation_events').upsert(
              {
                user_id: commentResult.data.author_id,
                community_id: postCommunityResult.data.community_id,
                source_type: nextVote === 1 ? 'comment_upvote' : nextVote === -1 ? 'comment_downvote' : 'comment_upvote',
                source_id: params.id,
                delta: contributionDelta,
                actor_user_id: user.id,
                event_type: nextVote === 1 ? 'comment_upvote' : nextVote === -1 ? 'comment_downvote' : 'vote_removed',
                entity_type: 'comment',
                entity_id: params.id,
                points: contributionDelta,
                metadata: {
                  vote: nextVote,
                },
              },
              { onConflict: 'user_id,community_id,source_type,source_id' },
            );

            if (repInsert.error) {
              throw new Error(repInsert.error.message);
            }
          }
        } catch (sideEffectError) {
          const sideEffectErrorMessage =
            sideEffectError instanceof Error
              ? sideEffectError.message
              : 'Unknown vote side effect error';

          const sideEffectErrorForClassification =
            sideEffectError instanceof Error
              ? sideEffectError
              : typeof sideEffectError === 'object' && sideEffectError !== null
                ? (sideEffectError as { message?: string; code?: string })
                : undefined;

          if (isRecoverableSupabaseReadError(sideEffectErrorForClassification)) {
            if (verboseLogging) {
              logInfo('api-vote-comment', 'Recoverable vote side effect failure', {
                userId: user.id,
                commentId: params.id,
                error: sideEffectErrorMessage,
              });
            }
          } else {
            logError('api-vote-comment', 'Vote side effects failed', {
              userId: user.id,
              commentId: params.id,
              error: sideEffectErrorMessage,
            });
          }
        }
      } else if (verboseLogging) {
        logInfo('api-vote-comment', 'Skipped vote side effects because service role client is unavailable', {
          userId: user.id,
          commentId: params.id,
        });
      }
    }

    if (verboseLogging) {
      logInfo('api-vote-comment', 'Vote response emitted', {
        userId: user.id,
        commentId: params.id,
        score: refreshedComment.data.vote_score,
        currentUserVote: nextVote,
      });
    }

    return ok({
      entityId: params.id,
      entityType: "comment",
      score: refreshedComment.data.vote_score,
      upvoteCount: upvoteCountResult.count ?? 0,
      downvoteCount: downvoteCountResult.count ?? 0,
      currentUserVote: nextVote,
      version: buildServerVersion(refreshedComment.data.updated_at),
      updatedAt: refreshedComment.data.updated_at,
      contributionDelta,
      rankDeltaHint: contributionDelta,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "You need to sign in.", 401);
    }

    logError('api-vote-comment', 'Vote route failed', {
      userId: authUserId,
      commentId: params.id,
      error: error instanceof Error ? error.message : 'Unknown vote route error',
    });

    return handleApiError(error);
  }
}
