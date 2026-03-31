import { redirect } from 'next/navigation';

export default function JobDetailPage({ params }: { params: { jobId: string } }) {
  redirect(`/career/jobs/${params.jobId}`);
}
