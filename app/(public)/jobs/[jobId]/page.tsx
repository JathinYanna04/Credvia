import { redirect } from 'next/navigation';

<<<<<<< HEAD
export default function JobDetailPage({ params }: { params: { jobId: string } }) {
=======
export default function LegacyJobDetailPage({
  params,
}: {
  params: { jobId: string };
}) {
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
  redirect(`/career/jobs/${params.jobId}`);
}
