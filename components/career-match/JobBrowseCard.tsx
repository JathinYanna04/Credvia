import Link from 'next/link';
import type { CareerJob } from '@/components/career-match/types';
import { formatDate } from '@/components/career-match/utils';
import { Badge } from '@/components/ui/badge';

export interface JobBrowseCardProps {
  job: CareerJob;
  detailHrefBase?: string;
}

export function JobBrowseCard({ job, detailHrefBase = '/career/jobs' }: JobBrowseCardProps) {
  return (
    <article className="surface-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{job.source_key.toUpperCase()}</Badge>
        {job.remote_policy ? <Badge variant="outline">{job.remote_policy}</Badge> : null}
        {job.seniority ? <Badge variant="outline">{job.seniority}</Badge> : null}
      </div>

      <div>
        <Link href={`${detailHrefBase}/${job.id}`} className="text-xl font-semibold text-text-primary hover:text-accent">
          {job.title}
        </Link>
        <p className="mt-1 text-sm text-text-secondary">
          {job.company?.company_name ?? 'Unknown company'}
          {job.location ? ` - ${job.location}` : ''}
        </p>
      </div>

      <p className="line-clamp-3 text-sm leading-6 text-text-secondary">
        {job.description_clean ?? job.description_raw ?? 'No normalized job description available yet.'}
      </p>

      <div className="flex flex-wrap gap-2">
        {job.skills.slice(0, 6).map((skill) => (
          <Badge key={`${job.id}-${skill.slug}`} variant={skill.required ? 'accent' : 'secondary'}>
            {skill.name}
          </Badge>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <span>Updated {formatDate(job.posted_at ?? job.ingested_at)}</span>
        <Link href={job.apply_url} target="_blank" rel="noreferrer" className="text-accent hover:text-text-primary">
          Apply
        </Link>
      </div>
    </article>
  );
}
