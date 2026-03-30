import { Badge } from '@/components/ui/badge';

export interface SkillGapPanelProps {
  matchedSkills: string[];
  missingSkills: string[];
}

export function SkillGapPanel({ matchedSkills, missingSkills }: SkillGapPanelProps) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      <article className="surface-panel p-5">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Matched skills</div>
        {matchedSkills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {matchedSkills.map((skill) => (
              <Badge key={skill} variant="success">
                {skill}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">No direct skill overlaps were detected yet.</p>
        )}
      </article>

      <article className="surface-panel p-5">
        <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Missing skills</div>
        {missingSkills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {missingSkills.map((skill) => (
              <Badge key={skill} variant="warning">
                {skill}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">No major skill gaps were flagged for this role.</p>
        )}
      </article>
    </section>
  );
}
