import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureProfileRecord, getRequiredUser } from '@/lib/supabase/helpers';

const OnboardingSchema = z
  .object({
    skills: z.array(z.string().uuid().or(z.string().min(3))).optional(),
    communityIds: z.array(z.string().uuid().or(z.string().min(3))).optional(),
    profile: z
      .object({
        username: z.string().regex(/^[a-z0-9_-]{3,30}$/).optional(),
        full_name: z.string().min(2).max(80).optional(),
        headline: z.string().max(160).optional(),
        bio: z.string().max(500).optional(),
        location: z.string().max(100).optional(),
      })
      .strict()
      .default({}),
    onboarding_complete: z.boolean().default(true),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, OnboardingSchema);

    await ensureProfileRecord(supabase, user);

    const normalizedSkills = body.skills ? [...new Set(body.skills)] : null;
    const normalizedCommunities = body.communityIds ? [...new Set(body.communityIds)] : null;

    if (Object.keys(body.profile).length > 0 || typeof body.onboarding_complete === 'boolean') {
      const profileUpdate = await supabase
        .from('profiles')
        .update({
          ...body.profile,
          onboarding_complete: body.onboarding_complete,
        })
        .eq('user_id', user.id);

      if (profileUpdate.error) {
        throw new Error(profileUpdate.error.message);
      }
    }

    if (normalizedSkills) {
      const deleteSkills = await supabase.from('user_skills').delete().eq('user_id', user.id);

      if (deleteSkills.error) {
        throw new Error(deleteSkills.error.message);
      }

      if (normalizedSkills.length > 0) {
        const skillInsert = await supabase.from('user_skills').insert(
          normalizedSkills.map((skillId) => ({
            user_id: user.id,
            skill_id: skillId,
          })),
        );

        if (skillInsert.error) {
          throw new Error(skillInsert.error.message);
        }
      }
    }

    if (normalizedCommunities) {
      const deleteMemberships = await supabase
        .from('community_memberships')
        .delete()
        .eq('user_id', user.id);

      if (deleteMemberships.error) {
        throw new Error(deleteMemberships.error.message);
      }

      if (normalizedCommunities.length > 0) {
        const membershipInsert = await supabase.from('community_memberships').insert(
          normalizedCommunities.map((communityId) => ({
            user_id: user.id,
            community_id: communityId,
            role: 'member',
          })),
        );

        if (membershipInsert.error) {
          throw new Error(membershipInsert.error.message);
        }
      }
    }

    return ok({
      saved: true,
      skills: normalizedSkills?.length ?? 0,
      communities: normalizedCommunities?.length ?? 0,
      onboarding_complete: body.onboarding_complete,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
