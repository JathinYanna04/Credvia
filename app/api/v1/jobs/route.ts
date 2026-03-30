import { handleApiError, ok } from '@/lib/api';
import { getJobCardsByIds } from '@/lib/career-match/queries';
import { JobListSchema } from '@/lib/schemas/career-match';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = JobListSchema.parse({
      q: searchParams.get('q') ?? undefined,
      location: searchParams.get('location') ?? undefined,
      remote: searchParams.get('remote') ?? undefined,
      employmentType: searchParams.get('employmentType') ?? undefined,
      company: searchParams.get('company') ?? undefined,
      skill: searchParams.get('skill') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
    });
    const supabase = await createServerSupabaseClient();

    let query = supabase.from('startup_jobs').select('id').eq('is_active', true).limit(100);
    if (filters.remote) {
      query = query.eq('remote_policy', filters.remote);
    }
    if (filters.employmentType) {
      query = query.ilike('metadata->>employmentType', `%${filters.employmentType}%`);
    }
    if (filters.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }
    if (filters.q) {
      query = query.or(`title.ilike.%${filters.q}%,description_clean.ilike.%${filters.q}%`);
    }

    const idsResult = await query;
    if (idsResult.error) {
      throw new Error(idsResult.error.message);
    }

    const jobs = await getJobCardsByIds(supabase, (idsResult.data ?? []).map((row) => row.id));
    let filtered = jobs;

    if (filters.company) {
      filtered = filtered.filter((job) => job.company?.company_name.toLowerCase().includes(filters.company!.toLowerCase()));
    }
    if (filters.skill) {
      filtered = filtered.filter((job) =>
        job.skills.some(
          (skill: { slug: string; name: string }) =>
            skill.slug.includes(filters.skill!.toLowerCase()) ||
            skill.name.toLowerCase().includes(filters.skill!.toLowerCase()),
        ),
      );
    }

    const sorted = [...filtered].sort((left, right) => {
      if (filters.sort === 'active') {
        return new Date(right.posted_at ?? right.ingested_at).getTime() - new Date(left.posted_at ?? left.ingested_at).getTime();
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

    return ok(sorted);
  } catch (error) {
    return handleApiError(error);
  }
}
