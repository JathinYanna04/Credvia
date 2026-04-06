import { z } from 'zod';

export const PERSONA_SLUGS = [
  'student',
  'job_seeker',
  'professional',
  'recruiter',
  'founder',
  'mentor',
] as const;

export const PersonaSlugSchema = z.enum(PERSONA_SLUGS);

export type PersonaSlug = z.infer<typeof PersonaSlugSchema>;

export const PROFILE_INTENT_VALUES = [
  'learn',
  'get_hired',
  'hire',
  'mentor',
  'find_mentor',
  'validate_idea',
  'build_in_public',
  'recruit_cofounder',
  'network',
  'share_knowledge',
] as const;

export const OPEN_TO_VALUES = [
  'job_opportunities',
  'internships',
  'mentorship',
  'mentoring',
  'collaboration',
  'recruiting',
  'cofounder_matching',
  'community_feedback',
  'freelance',
  'speaking',
] as const;

export const ProfileIntentSchema = z.enum(PROFILE_INTENT_VALUES);
export const OpenToSchema = z.enum(OPEN_TO_VALUES);

export type ProfileIntent = z.infer<typeof ProfileIntentSchema>;
export type OpenToValue = z.infer<typeof OpenToSchema>;

const stringArraySchema = z.array(z.string().min(1).max(60)).max(8);
const profileTagArraySchema = z.array(z.string().min(1).max(60)).max(12);
const personaArraySchema = z.array(PersonaSlugSchema).max(3);
const profileIntentArraySchema = z.array(ProfileIntentSchema).max(6);
const openToArraySchema = z.array(OpenToSchema).max(6);

export const ScoreSummarySchema = z
  .object({
    contribution_score: z.number().int().nonnegative().default(0),
    credibility_score: z.number().int().nonnegative().default(0),
    helpfulness_score: z.number().int().nonnegative().default(0),
    expertise_score: z.number().int().nonnegative().default(0),
    community_score: z.number().int().nonnegative().default(0),
    persona_completion_score: z.number().int().min(0).max(100).default(0),
  })
  .strict();

export type ScoreSummary = z.infer<typeof ScoreSummarySchema>;

export const PersonaDetailsSchema = z
  .object({
    student: z
      .object({
        college: z.string().max(120).optional(),
        degree: z.string().max(120).optional(),
        grad_year: z.string().max(4).optional(),
        interests: stringArraySchema.optional(),
      })
      .strict()
      .optional(),
    job_seeker: z
      .object({
        target_roles: stringArraySchema.optional(),
        experience_level: z.string().max(60).optional(),
        preferred_locations: stringArraySchema.optional(),
        work_mode: z.string().max(40).optional(),
      })
      .strict()
      .optional(),
    professional: z
      .object({
        current_title: z.string().max(120).optional(),
        industry: z.string().max(80).optional(),
        years_experience: z.string().max(40).optional(),
        skills: stringArraySchema.optional(),
      })
      .strict()
      .optional(),
    recruiter: z
      .object({
        company: z.string().max(120).optional(),
        hiring_focus: z.string().max(120).optional(),
        recruiting_for: stringArraySchema.optional(),
        industries: stringArraySchema.optional(),
        hiring_regions: stringArraySchema.optional(),
      })
      .strict()
      .optional(),
    founder: z
      .object({
        startup_name: z.string().max(120).optional(),
        stage: z.string().max(60).optional(),
        domains: stringArraySchema.optional(),
        team_status: z.string().max(120).optional(),
        help_needed: stringArraySchema.optional(),
      })
      .strict()
      .optional(),
    mentor: z
      .object({
        expertise_areas: stringArraySchema.optional(),
        mentoring_topics: stringArraySchema.optional(),
        availability: z.string().max(120).optional(),
        domains: stringArraySchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type PersonaDetailsMap = z.infer<typeof PersonaDetailsSchema>;

export const ProfileMetadataSchema = z
  .object({
    persona_details: PersonaDetailsSchema.optional(),
    feed_hints: z.array(z.string().max(120)).max(6).optional(),
    suggested_actions: z.array(z.string().max(120)).max(6).optional(),
    starter_recommendations: z
      .object({
        actions: z.array(z.string().max(120)).max(6).optional(),
        communities: z.array(z.string().max(120)).max(6).optional(),
        topics: z.array(z.string().max(120)).max(6).optional(),
        people: z.array(z.string().max(120)).max(6).optional(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

export type ProfileMetadata = z.infer<typeof ProfileMetadataSchema>;

export interface PersonaDefinition {
  slug: PersonaSlug;
  label: string;
  shortDescription: string;
  iconToken: string;
  onboardingIntent: string;
  likelyOutcomes: string[];
  feedHint: string;
  emptyStateTone: string;
  ctaLabel: string;
  suggestedActions: string[];
}

export const PERSONA_DEFINITIONS: Record<PersonaSlug, PersonaDefinition> = {
  student: {
    slug: 'student',
    label: 'Student',
    shortDescription: 'Learn in public, build projects, and turn curiosity into signal.',
    iconToken: 'graduation-cap',
    onboardingIntent: 'Show what you are learning, what you are building, and where you want momentum.',
    likelyOutcomes: ['Build stronger projects', 'Find mentors', 'Improve internship readiness'],
    feedHint: 'Learning-first threads, beginner-friendly projects, and internship-shaped opportunities.',
    emptyStateTone: 'Start with one sharp question or a small build update. Progress is enough.',
    ctaLabel: 'Share what you are learning',
    suggestedActions: ['Ask for feedback on a project', 'Join a learning-heavy community', 'Save internship-ready advice'],
  },
  job_seeker: {
    slug: 'job_seeker',
    label: 'Job Seeker',
    shortDescription: 'Focus your signal around the roles, locations, and skills you want next.',
    iconToken: 'briefcase',
    onboardingIntent: 'Make it obvious what roles you are targeting and what proof already supports that move.',
    likelyOutcomes: ['Sharpen your hiring signal', 'Get role-fit feedback', 'Discover career opportunities'],
    feedHint: 'Hiring discussions, role breakdowns, resume feedback, and opportunity-rich communities.',
    emptyStateTone: 'A focused profile helps the right opportunities feel closer, faster.',
    ctaLabel: 'Strengthen your career signal',
    suggestedActions: ['Refine your target roles', 'Follow hiring-heavy conversations', 'Share a resume or portfolio question'],
  },
  professional: {
    slug: 'professional',
    label: 'Professional',
    shortDescription: 'Show experience, expertise, and the work you can reliably contribute.',
    iconToken: 'badge-check',
    onboardingIntent: 'Highlight the experience and judgment people should trust when they see your contributions.',
    likelyOutcomes: ['Build public credibility', 'Share domain expertise', 'Grow your network through contribution'],
    feedHint: 'Industry discussions, deeper technical threads, and places where expertise compounds.',
    emptyStateTone: 'Credibility grows when your experience shows up in concrete, useful replies.',
    ctaLabel: 'Contribute from experience',
    suggestedActions: ['Answer a hard question', 'Share a system or workflow lesson', 'Follow communities where your experience compounds'],
  },
  recruiter: {
    slug: 'recruiter',
    label: 'Recruiter',
    shortDescription: 'Signal hiring intent, talent focus, and where you are looking for standout people.',
    iconToken: 'users-round',
    onboardingIntent: 'Help builders understand who you hire for, where, and what signals you pay attention to.',
    likelyOutcomes: ['Discover stronger candidates', 'Surface hiring intent', 'Follow talent-rich conversations'],
    feedHint: 'Talent-rich discussions, community reputation signals, and opportunity-relevant activity.',
    emptyStateTone: 'Good recruiting signal starts with clarity and consistency, not volume.',
    ctaLabel: 'Surface hiring intent',
    suggestedActions: ['Join communities with strong builders', 'Share what great candidates do well', 'Follow high-signal talent conversations'],
  },
  founder: {
    slug: 'founder',
    label: 'Founder',
    shortDescription: 'Build in public, validate quickly, and attract the right operators around your idea.',
    iconToken: 'rocket',
    onboardingIntent: 'Clarify what you are building, what stage you are in, and what help will move the company forward.',
    likelyOutcomes: ['Validate startup ideas', 'Attract collaborators', 'Make traction visible'],
    feedHint: 'Idea validation, startup feedback, hiring needs, and builder-energy threads.',
    emptyStateTone: 'Momentum comes from showing the problem clearly and inviting the right pressure-test.',
    ctaLabel: 'Build in public',
    suggestedActions: ['Publish a startup idea', 'Ask for validation feedback', 'Signal the help your startup needs'],
  },
  mentor: {
    slug: 'mentor',
    label: 'Mentor',
    shortDescription: 'Make your expertise accessible and help promising people move faster.',
    iconToken: 'handshake',
    onboardingIntent: 'Show the guidance areas where you are most helpful so the right questions find you.',
    likelyOutcomes: ['Offer office hours', 'Answer high-signal requests', 'Build trusted mentor credibility'],
    feedHint: 'Advice requests, promising builders, and places where thoughtful guidance creates lift.',
    emptyStateTone: 'Mentorship signal grows when people can quickly see where your guidance fits best.',
    ctaLabel: 'Offer guidance',
    suggestedActions: ['Answer an advice request', 'Share a framework you use', 'Make your mentoring topics easy to scan'],
  },
};

export function normalizePersonaSlug(value: unknown): PersonaSlug | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PERSONA_SLUGS.find((slug) => slug === normalized) ?? null;
}

export function getPersonaDefinition(persona: unknown) {
  const slug = normalizePersonaSlug(persona) ?? 'professional';
  return PERSONA_DEFINITIONS[slug];
}

export function getPersonaDetails(
  metadata: unknown,
  persona: PersonaSlug | null | undefined,
) {
  const parsed = ProfileMetadataSchema.safeParse(metadata);
  const resolvedPersona = persona ? normalizePersonaSlug(persona) : null;

  if (!parsed.success || !resolvedPersona) {
    return null;
  }

  return parsed.data.persona_details?.[resolvedPersona] ?? null;
}

export function mergeProfileMetadata(options: {
  current: unknown;
  primaryPersona?: PersonaSlug | null;
  personaDetails?: Record<string, unknown> | null;
  starterRecommendations?: ProfileMetadata['starter_recommendations'];
}) {
  const currentResult = ProfileMetadataSchema.safeParse(options.current);
  const base: ProfileMetadata = currentResult.success ? currentResult.data : {};
  const persona =
    options.primaryPersona ? PERSONA_DEFINITIONS[options.primaryPersona] : null;
  const nextPersonaDetails =
    options.primaryPersona
      ? PersonaDetailsSchema.parse({
          ...(base.persona_details ?? {}),
          [options.primaryPersona]: options.personaDetails ?? {},
        })
      : base.persona_details;

  return {
    ...base,
    ...(nextPersonaDetails ? { persona_details: nextPersonaDetails } : {}),
    ...(persona ? { feed_hints: [persona.feedHint] } : {}),
    ...(persona ? { suggested_actions: persona.suggestedActions } : {}),
    ...(options.starterRecommendations
      ? { starter_recommendations: options.starterRecommendations }
      : {}),
  } satisfies ProfileMetadata;
}

export const IdentityPreferencesSchema = z
  .object({
    secondary_personas: personaArraySchema.default([]),
    profile_intent: profileIntentArraySchema.default([]),
    open_to: openToArraySchema.default([]),
    expertise_tags: profileTagArraySchema.default([]),
    interest_tags: profileTagArraySchema.default([]),
    open_for_opportunities: z.boolean().default(false),
    open_for_mentorship: z.boolean().default(false),
    open_for_hiring: z.boolean().default(false),
  })
  .strict();

export type IdentityPreferences = z.infer<typeof IdentityPreferencesSchema>;

export interface PersonaDetailRecord {
  current_title: string | null;
  company: string | null;
  industry: string | null;
  years_experience: number | null;
  college: string | null;
  degree: string | null;
  graduation_year: number | null;
  target_roles: string[];
  preferred_locations: string[];
  work_mode: string | null;
  startup_name: string | null;
  startup_stage: string | null;
  startup_domains: string[];
  startup_team_size: number | null;
  mentor_topics: string[];
  mentoring_format: string | null;
  hiring_roles: string[];
  hiring_regions: string[];
  achievements: string[];
  projects: string[];
  current_traction: string | null;
  help_needed: string[];
  expertise_areas: string[];
  availability_style: string | null;
}

export const PersonaDetailRecordSchema = z
  .object({
    current_title: z.string().max(120).nullable().default(null),
    company: z.string().max(120).nullable().default(null),
    industry: z.string().max(80).nullable().default(null),
    years_experience: z.number().int().min(0).max(60).nullable().default(null),
    college: z.string().max(120).nullable().default(null),
    degree: z.string().max(120).nullable().default(null),
    graduation_year: z.number().int().min(1900).max(2200).nullable().default(null),
    target_roles: z.array(z.string().min(1).max(80)).default([]),
    preferred_locations: z.array(z.string().min(1).max(80)).default([]),
    work_mode: z.string().max(40).nullable().default(null),
    startup_name: z.string().max(120).nullable().default(null),
    startup_stage: z.string().max(60).nullable().default(null),
    startup_domains: z.array(z.string().min(1).max(80)).default([]),
    startup_team_size: z.number().int().min(1).max(100000).nullable().default(null),
    mentor_topics: z.array(z.string().min(1).max(80)).default([]),
    mentoring_format: z.string().max(120).nullable().default(null),
    hiring_roles: z.array(z.string().min(1).max(80)).default([]),
    hiring_regions: z.array(z.string().min(1).max(80)).default([]),
    achievements: z.array(z.string().min(1).max(160)).default([]),
    projects: z.array(z.string().min(1).max(160)).default([]),
    current_traction: z.string().max(160).nullable().default(null),
    help_needed: z.array(z.string().min(1).max(80)).default([]),
    expertise_areas: z.array(z.string().min(1).max(80)).default([]),
    availability_style: z.string().max(120).nullable().default(null),
  })
  .strict();

export function parseCommaSeparated(value: string | undefined | null) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getCredibilityBadge(input: {
  contributionScore?: number | null;
  credibilityScore?: number | null;
  helpfulnessScore?: number | null;
}) {
  const composite =
    (input.contributionScore ?? 0) +
    (input.credibilityScore ?? 0) +
    Math.round((input.helpfulnessScore ?? 0) * 0.75);

  if (composite >= 240) {
    return 'Trusted Builder';
  }

  if (composite >= 160) {
    return 'Rising Contributor';
  }

  if (composite >= 90) {
    return 'Active Voice';
  }

  return 'Emerging Member';
}

export function computePersonaCompletionScore(input: {
  primaryPersona: PersonaSlug | null | undefined;
  fullName?: string | null;
  headline?: string | null;
  bio?: string | null;
  secondaryPersonas?: string[] | null;
  profileIntent?: string[] | null;
  openTo?: string[] | null;
  interestTags?: string[] | null;
  expertiseTags?: string[] | null;
  joinedCommunityIds?: string[] | null;
  selectedSkillIds?: string[] | null;
  detailRecord?: Partial<PersonaDetailRecord> | null;
}) {
  let score = 0;

  if (input.primaryPersona) score += 20;
  if ((input.fullName ?? '').trim().length >= 2) score += 10;
  if ((input.headline ?? '').trim().length >= 10) score += 15;
  if ((input.bio ?? '').trim().length >= 20) score += 10;
  if ((input.secondaryPersonas?.length ?? 0) > 0) score += 10;
  if ((input.profileIntent?.length ?? 0) > 0) score += 10;
  if ((input.openTo?.length ?? 0) > 0) score += 10;
  if ((input.interestTags?.length ?? 0) > 0) score += 5;
  if ((input.expertiseTags?.length ?? 0) > 0) score += 5;
  if ((input.joinedCommunityIds?.length ?? 0) > 0) score += 3;
  if ((input.selectedSkillIds?.length ?? 0) > 0) score += 2;

  const detailValues = Object.values(input.detailRecord ?? {}).flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  const filledDetailCount = detailValues.filter((value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return true;
    return Boolean(value);
  }).length;

  if (filledDetailCount >= 2) score += 5;

  return Math.min(100, score);
}

export function getStarterRecommendations(input: {
  primaryPersona: PersonaSlug | null | undefined;
  profileIntent?: string[] | null;
  openTo?: string[] | null;
  interestTags?: string[] | null;
}) {
  const persona = getPersonaDefinition(input.primaryPersona);
  const interests = (input.interestTags ?? []).slice(0, 3);
  const openTo = (input.openTo ?? []).slice(0, 2).map((item) => item.replace(/_/g, ' '));

  return {
    actions: persona.suggestedActions.slice(0, 3),
    communities: interests.length > 0 ? interests : [persona.label],
    topics:
      interests.length > 0
        ? [...interests, ...openTo].slice(0, 4)
        : [persona.label, 'Career', 'Community'],
    people: [
      `${persona.label} leaders`,
      'Trusted contributors',
      'Builders in your strongest domains',
    ],
  } satisfies NonNullable<ProfileMetadata['starter_recommendations']>;
}
