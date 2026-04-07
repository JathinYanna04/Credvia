'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/Card';
import { getCredibilityBadge, getPersonaDefinition, type PersonaSlug } from '@/lib/personas';

export function OnboardingPreviewCard({
  fullName,
  username,
  headline,
  bio,
  persona,
  secondaryPersonas,
  openTo,
  interestTags,
  expertiseTags,
  location,
}: {
  fullName: string;
  username: string;
  headline: string;
  bio: string;
  persona: PersonaSlug | null;
  secondaryPersonas: PersonaSlug[];
  openTo: string[];
  interestTags: string[];
  expertiseTags: string[];
  location?: string;
}) {
  const personaDefinition = persona ? getPersonaDefinition(persona) : null;

  return (
    <Card padding="lg" className="rounded-[28px]">
      <div className="flex flex-wrap items-center gap-3">
        {personaDefinition ? <Badge>{personaDefinition.label}</Badge> : null}
        {secondaryPersonas.map((item) => (
          <Badge key={item} variant="secondary">
            {getPersonaDefinition(item).label}
          </Badge>
        ))}
        <Badge variant="secondary">
          {getCredibilityBadge({ contributionScore: 12, credibilityScore: 8, helpfulnessScore: 6 })}
        </Badge>
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-text-primary">
        {fullName || username || 'Your profile'}
      </h2>
      <p className="mt-2 text-base text-text-secondary">
        {headline || personaDefinition?.onboardingIntent || 'Shape how people understand your direction quickly.'}
      </p>
      <p className="mt-4 text-sm leading-6 text-text-secondary">
        {bio || personaDefinition?.emptyStateTone || 'Your first profile should feel specific, calm, and easy to trust.'}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {location ? <Badge variant="secondary">{location}</Badge> : null}
        {openTo.map((item) => (
          <Badge key={item} variant="secondary">
            {item.replace(/_/g, ' ')}
          </Badge>
        ))}
        {expertiseTags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
        {interestTags.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
    </Card>
  );
}
