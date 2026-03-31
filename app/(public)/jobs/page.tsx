import { redirect } from 'next/navigation';

export default function JobsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();

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
}
