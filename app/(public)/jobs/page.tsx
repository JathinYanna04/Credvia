import { redirect } from 'next/navigation';

<<<<<<< HEAD
export default function JobsPage({
=======
export default function LegacyJobsPage({
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();

<<<<<<< HEAD
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
      return;
    }

    if (typeof value === 'string' && value.length > 0) {
      params.set(key, value);
    }
  });

  redirect(params.toString() ? `/career/jobs?${params.toString()}` : '/career/jobs');
=======
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === 'string') {
      params.set(key, value);
      continue;
    }

    value?.forEach((entry) => params.append(key, entry));
  }

  const queryString = params.toString();
  redirect(queryString ? `/career/jobs?${queryString}` : '/career/jobs');
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
}
