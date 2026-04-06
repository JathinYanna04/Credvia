import type { PersonaDetailRecord, PersonaSlug } from '@/lib/personas';
import type { ProfileRow } from '@/lib/profile-state';

export type ProfileCompletionCategory =
  | 'identity'
  | 'credibility'
  | 'discovery'
  | 'contribution';

export interface ProfileCompletionItem {
  id: string;
  category: ProfileCompletionCategory;
  title: string;
  description: string;
  complete: boolean;
  href: string;
}

export interface ProfileCompletionState {
  entryComplete: boolean;
  completedCount: number;
  totalCount: number;
  progress: number;
  items: ProfileCompletionItem[];
}

function hasText(value: string | null | undefined, min = 1) {
  return (value ?? '').trim().length >= min;
}

function hasList(value: string[] | null | undefined) {
  return (value?.length ?? 0) > 0;
}

function personaItems(
  persona: PersonaSlug | null,
  detailRecord: Partial<PersonaDetailRecord> | null | undefined,
): ProfileCompletionItem[] {
  if (!persona) {
    return [];
  }

  if (persona === 'student') {
    return [
      {
        id: 'student-college',
        category: 'credibility',
        title: 'Add your college or learning base',
        description: 'Helps other students, mentors, and recruiters place your context quickly.',
        complete: hasText(detailRecord?.college),
        href: '/settings',
      },
      {
        id: 'student-degree',
        category: 'credibility',
        title: 'Add degree and graduation year',
        description: 'Turns your profile into a more useful signal for internships and early-career paths.',
        complete: hasText(detailRecord?.degree) && Boolean(detailRecord?.graduation_year),
        href: '/settings',
      },
      {
        id: 'student-projects',
        category: 'credibility',
        title: 'Add projects or target roles',
        description: 'A small amount of proof-of-work makes your profile much easier to trust.',
        complete: hasList(detailRecord?.projects) || hasList(detailRecord?.target_roles),
        href: '/settings',
      },
    ];
  }

  if (persona === 'job_seeker') {
    return [
      {
        id: 'job-targets',
        category: 'credibility',
        title: 'Add target roles',
        description: 'Clarifies what opportunities should find you first.',
        complete: hasList(detailRecord?.target_roles),
        href: '/settings',
      },
      {
        id: 'job-locations',
        category: 'discovery',
        title: 'Set preferred locations or work mode',
        description: 'Improves how jobs and recruiter discovery align with your goals.',
        complete: hasList(detailRecord?.preferred_locations) || hasText(detailRecord?.work_mode),
        href: '/settings',
      },
      {
        id: 'job-skills',
        category: 'credibility',
        title: 'Add proof of skill',
        description: 'Use your profile, resume, or projects to show what backs up your move.',
        complete: false,
        href: '/resume',
      },
    ];
  }

  if (persona === 'professional') {
    return [
      {
        id: 'pro-role',
        category: 'credibility',
        title: 'Add your current role',
        description: 'Anchors your public contribution in lived experience.',
        complete: hasText(detailRecord?.current_title),
        href: '/settings',
      },
      {
        id: 'pro-company',
        category: 'credibility',
        title: 'Add company or industry context',
        description: 'Makes your perspective easier to trust and easier to discover.',
        complete: hasText(detailRecord?.company) || hasText(detailRecord?.industry),
        href: '/settings',
      },
      {
        id: 'pro-expertise',
        category: 'credibility',
        title: 'Add achievements or expertise areas',
        description: 'A few concrete signals beat a generic summary every time.',
        complete: hasList(detailRecord?.achievements) || hasList(detailRecord?.expertise_areas),
        href: '/settings',
      },
    ];
  }

  if (persona === 'recruiter') {
    return [
      {
        id: 'rec-company',
        category: 'credibility',
        title: 'Add company',
        description: 'Builders should be able to understand your hiring context fast.',
        complete: hasText(detailRecord?.company),
        href: '/settings',
      },
      {
        id: 'rec-roles',
        category: 'credibility',
        title: 'Add hiring roles',
        description: 'Makes your profile more useful to the right candidates.',
        complete: hasList(detailRecord?.hiring_roles),
        href: '/settings',
      },
      {
        id: 'rec-regions',
        category: 'discovery',
        title: 'Set hiring regions or domains',
        description: 'Clarifies where and how people should engage with you.',
        complete: hasList(detailRecord?.hiring_regions) || hasText(detailRecord?.industry),
        href: '/settings',
      },
    ];
  }

  if (persona === 'founder') {
    return [
      {
        id: 'founder-startup',
        category: 'credibility',
        title: 'Add startup name',
        description: 'People should be able to tell what you are building at a glance.',
        complete: hasText(detailRecord?.startup_name),
        href: '/settings',
      },
      {
        id: 'founder-stage',
        category: 'credibility',
        title: 'Add stage or traction',
        description: 'This helps collaborators and mentors understand where you actually are.',
        complete: hasText(detailRecord?.startup_stage) || hasText(detailRecord?.current_traction),
        href: '/settings',
      },
      {
        id: 'founder-help',
        category: 'discovery',
        title: 'Add domains or what help you need',
        description: 'Turns your profile into a useful collaboration surface instead of a vague founder label.',
        complete: hasList(detailRecord?.startup_domains) || hasList(detailRecord?.help_needed),
        href: '/settings',
      },
    ];
  }

  return [
    {
      id: 'mentor-topics',
      category: 'credibility',
      title: 'Add expertise areas',
      description: 'Promising builders should be able to see where you are most useful.',
      complete: hasList(detailRecord?.expertise_areas),
      href: '/settings',
    },
    {
      id: 'mentor-focus',
      category: 'credibility',
      title: 'Add mentoring topics',
      description: 'Makes mentorship requests more relevant and higher-signal.',
      complete: hasList(detailRecord?.mentor_topics),
      href: '/settings',
    },
    {
      id: 'mentor-availability',
      category: 'discovery',
      title: 'Add availability style',
      description: 'Sets the right expectation without forcing a heavy scheduling workflow.',
      complete: hasText(detailRecord?.availability_style) || hasText(detailRecord?.mentoring_format),
      href: '/settings',
    },
  ];
}

export function buildProfileCompletionChecklist(input: {
  profile: Pick<
    ProfileRow,
    | 'primary_persona'
    | 'username'
    | 'full_name'
    | 'headline'
    | 'bio'
    | 'open_to'
    | 'profile_intent'
    | 'interest_tags'
    | 'expertise_tags'
  >;
  detailRecord?: Partial<PersonaDetailRecord> | null;
  joinedCommunityIds?: string[] | null;
  selectedSkillIds?: string[] | null;
  contributionStats?: {
    posts_count?: number | null;
    comments_count?: number | null;
  } | null;
}) : ProfileCompletionState {
  const persona = (input.profile.primary_persona ?? null) as PersonaSlug | null;
  const items: ProfileCompletionItem[] = [
    {
      id: 'identity-name',
      category: 'identity',
      title: 'Add your display name',
      description: 'This is the minimum identity layer that makes your profile feel real.',
      complete: hasText(input.profile.full_name, 2),
      href: '/settings',
    },
    {
      id: 'identity-username',
      category: 'identity',
      title: 'Claim a clear username',
      description: 'Credvia uses usernames for public profile URLs and mentions.',
      complete: hasText(input.profile.username, 3),
      href: '/settings',
    },
    {
      id: 'identity-headline',
      category: 'identity',
      title: 'Add a short headline',
      description: 'A crisp one-line summary helps people understand your direction faster.',
      complete: hasText(input.profile.headline, 10),
      href: '/settings',
    },
    {
      id: 'identity-bio',
      category: 'identity',
      title: 'Add a short bio',
      description: 'A few lines of context improve trust without needing a full profile rewrite.',
      complete: hasText(input.profile.bio, 20),
      href: '/settings',
    },
    ...personaItems(persona, input.detailRecord),
    {
      id: 'discovery-open-to',
      category: 'discovery',
      title: 'Set what you are open to',
      description: 'Lets recruiters, mentors, founders, and peers engage the right way.',
      complete: hasList(input.profile.open_to),
      href: '/settings',
    },
    {
      id: 'discovery-interests',
      category: 'discovery',
      title: 'Add interests or expertise tags',
      description: 'Improves discovery, search, and recommendation quality later on.',
      complete: hasList(input.profile.interest_tags) || hasList(input.profile.expertise_tags),
      href: '/settings',
    },
    {
      id: 'discovery-community',
      category: 'discovery',
      title: 'Join a community or add skills',
      description: 'A small amount of context makes your first week in the app much more relevant.',
      complete:
        (input.joinedCommunityIds?.length ?? 0) > 0 || (input.selectedSkillIds?.length ?? 0) > 0,
      href: '/communities',
    },
    {
      id: 'contribution-first',
      category: 'contribution',
      title: 'Make your first contribution',
      description: 'A thoughtful question, answer, or project update starts the trust loop.',
      complete:
        ((input.contributionStats?.posts_count ?? 0) + (input.contributionStats?.comments_count ?? 0)) > 0,
      href: '/post/new',
    },
  ];

  const completedCount = items.filter((item) => item.complete).length;
  const totalCount = items.length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return {
    entryComplete:
      hasText(input.profile.username, 3) &&
      hasText(input.profile.full_name, 2) &&
      hasText(input.profile.primary_persona as string | null, 1),
    completedCount,
    totalCount,
    progress,
    items,
  };
}
