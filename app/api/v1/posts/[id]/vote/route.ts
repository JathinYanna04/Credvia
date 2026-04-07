import { fail, handleApiError, ok, parseJson } from "@/lib/api";
import {
  describeVoteMutationBranch,
  toVoteDirectionValue,
  type VoteValue,
} from '@/lib/voting';
import {
  buildVoteRouteResponse,
  getVoteDbErrorMeta,
  mapVoteMutationError,
  recoverAuthoritativeVoteState,
} from '@/lib/voting-server';
import { VotePostSchema } from "@/lib/schemas/post";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/supabase/notifications";
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRequiredUser, isRecoverableSupabaseReadError } from "@/lib/supabase/helpers";
import { logError, logInfo } from '@/lib/utils/logger';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  let authUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    authUserId = user.id;
    const body = await parseJson(request, VotePostSchema);

    logInfo('api-vote-post', 'Vote request received', {
      userId: user.id,
      postId: params.id,
      requestedVote: body.direction,
    });

    const limit = await enforceRateLimit(
      "vote",
      `${user.id}:post:${params.id}`,
    );

    if (!limit.success) {
      return fail("RATE_LIMITED", "Too many votes. Try again shortly.", 429);
    }

    const postResult = await supabase
      .from("posts")
      .select("id, author_id, title, community_id")
      .eq("id", params.id)
      .eq("status", "published")
      .maybeSingle();

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!postResult.data) {
      return fail("NOT_FOUND", "Post not found.", 404);
    }

    const mutationResult = await supabase
      .rpc('mutate_post_vote_atomic', {
        p_entity_id: params.id,
        p_direction: toVoteDirectionValue(body.direction),
        p_value: null,
      })
      .single();

    if (mutationResult.error) {
      const mapped = mapVoteMutationError(mutationResult.error);
      const dbError = getVoteDbErrorMeta(mutationResult.error);

      logError('api-vote-post', 'Vote RPC failed', {
        userId: user.id,
        postId: params.id,
        requestedVote: body.direction,
        dbErrorCode: dbError.code,
        dbErrorMessage: dbError.message,
        dbErrorDetails: dbError.details,
        dbErrorHint: dbError.hint,
      });

      if (mapped) {
        if (mapped.code === 'NOT_FOUND') {
          return fail('NOT_FOUND', 'Post not found.', 404);
        }

        return fail(mapped.code, mapped.message, mapped.status);
      }

      if (mutationResult.error.code === '23505') {
        const recovered = await recoverAuthoritativeVoteState(
          supabase,
          'post',
          params.id,
          user.id,
        );

        if (recovered) {
          logInfo('api-vote-post', 'Recovered authoritative vote state after conflict', {
            userId: user.id,
            postId: params.id,
            requestedVote: body.direction,
            branch: 'race_recovered',
          });

          return ok(recovered);
        }
      }

      throw new Error(mutationResult.error.message);
    }

    if (!mutationResult.data?.updated_at) {
      throw new Error('Vote mutation did not return canonical updated_at.');
    }

    const previousVote = (mutationResult.data.previous_vote ?? 0) as VoteValue;
    const nextVote = (mutationResult.data.current_user_vote ?? 0) as VoteValue;
    const contributionDelta =
      mutationResult.data.contribution_delta ?? nextVote - previousVote;

    const mutationBranch = describeVoteMutationBranch(previousVote, nextVote);

    logInfo('api-vote-post', 'Vote mutation applied', {
      userId: user.id,
      postId: params.id,
      requestedVote: body.direction,
      previousVote,
      nextVote,
      branch: mutationBranch,
      contributionDelta,
    });

    if (contributionDelta !== 0 && postResult.data.author_id !== user.id) {
      const sideEffectClient = createServiceRoleClient();

      if (sideEffectClient) {
        try {
          const activeVoteDelta = (nextVote === 0 ? 0 : 1) - (previousVote === 0 ? 0 : 1);
          const [authorProfileResult, authorStatsResult, voterStatsResult] = await Promise.all([
            sideEffectClient
              .from('profiles')
              .select('user_id, contribution_score, credibility_score, helpfulness_score')
              .eq('user_id', postResult.data.author_id)
              .maybeSingle(),
            sideEffectClient
              .from('user_contribution_stats')
              .select('*')
              .eq('user_id', postResult.data.author_id)
              .maybeSingle(),
            sideEffectClient
              .from('user_contribution_stats')
              .select('*')
              .eq('user_id', user.id)
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
              .eq('user_id', postResult.data.author_id);

            if (authorUpdate.error) {
              throw new Error(authorUpdate.error.message);
            }
          }

          const authorStatsUpsert = await sideEffectClient
            .from('user_contribution_stats')
            .upsert(
              {
                user_id: postResult.data.author_id,
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
            target_user_id: postResult.data.author_id,
            entity_type: 'post',
            entity_id: params.id,
            interaction_type: nextVote === 1 ? 'upvote' : nextVote === -1 ? 'downvote' : 'remove_vote',
            value: contributionDelta,
            metadata: {
              community_id: postResult.data.community_id,
            },
          });

          if (interactionInsert.error) {
            throw new Error(interactionInsert.error.message);
          }

          const trustEdgeUpsert = await sideEffectClient.from('trust_edges').upsert({
            source_user_id: user.id,
            target_user_id: postResult.data.author_id,
            domain_tag: 'general',
            edge_type: 'vote_signal',
            weight: contributionDelta,
            evidence_entity_type: 'post',
            evidence_entity_id: params.id,
            metadata: {
              vote: nextVote,
            },
          });

          if (trustEdgeUpsert.error) {
            throw new Error(trustEdgeUpsert.error.message);
          }

          const repInsert = await sideEffectClient.from('reputation_events').upsert(
            {
              user_id: postResult.data.author_id,
              community_id: postResult.data.community_id,
              source_type: nextVote === 1 ? 'post_upvote' : nextVote === -1 ? 'post_downvote' : 'post_upvote',
              source_id: params.id,
              delta: contributionDelta,
              actor_user_id: user.id,
              event_type: nextVote === 1 ? 'post_upvote' : nextVote === -1 ? 'post_downvote' : 'vote_removed',
              entity_type: 'post',
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
            logInfo('api-vote-post', 'Recoverable vote side effect failure', {
              userId: user.id,
              postId: params.id,
              error: sideEffectErrorMessage,
            });
          } else {
            logError('api-vote-post', 'Vote side effects failed', {
              userId: user.id,
              postId: params.id,
              error: sideEffectErrorMessage,
            });
          }
        }
      } else {
        logInfo('api-vote-post', 'Skipped vote side effects because service role client is unavailable', {
          userId: user.id,
          postId: params.id,
        });
      }
    }

    if (contributionDelta !== 0 && nextVote !== 0 && postResult.data.author_id !== user.id) {
      await sendNotification({
        userId: postResult.data.author_id,
        notifType: "vote",
        actorUserId: user.id,
        entityType: "post",
        entityId: params.id,
        payload: {
          title: postResult.data.title,
          value: nextVote,
        },
      });
    }

    const response = buildVoteRouteResponse({
      entityId: params.id,
      entityType: 'post',
      currentUserVote: nextVote,
      upvoteCount: mutationResult.data.upvote_count,
      downvoteCount: mutationResult.data.downvote_count,
      score: mutationResult.data.score,
      updatedAt: mutationResult.data.updated_at,
      contributionDelta,
    });

    logInfo('api-vote-post', 'Vote response emitted', {
      userId: user.id,
      postId: params.id,
      userVote: response.userVote,
      score: response.score,
      upvoteCount: response.upvoteCount,
      downvoteCount: response.downvoteCount,
    });

    return ok(response);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "You need to sign in.", 401);
    }

    logError('api-vote-post', 'Vote route failed', {
      userId: authUserId,
      postId: params.id,
      error: error instanceof Error ? error.message : 'Unknown vote route error',
    });

    return handleApiError(error);
  }
}
