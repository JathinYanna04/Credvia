import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getPersonaDefinition, type PersonaSlug } from '@/lib/personas';

export function FeedEmpty({ persona }: { persona?: PersonaSlug | null }) {
  const resolvedPersona = persona ? getPersonaDefinition(persona) : null;

  return (
    <div className="surface-panel space-y-4 p-8 text-center">
      <h3 className="text-xl font-semibold">Your feed is quiet right now</h3>
      <p className="mx-auto max-w-md text-sm text-text-secondary">
        {resolvedPersona?.emptyStateTone ??
          'Start with a few communities so Credvia can surface better questions, stronger answers, and people worth following.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/communities">Explore communities</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/post/new">
            {resolvedPersona?.ctaLabel ?? 'Ask your first question'}
          </Link>
        </Button>
      </div>
    </div>
  );
}
