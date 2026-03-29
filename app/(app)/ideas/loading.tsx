import { StartupIdeaCardSkeleton } from '@/components/startup-ideas/StartupIdeaCardSkeleton';

export default function IdeasLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <div className="h-10 w-56 rounded-md bg-bg-surface" />
        <div className="h-4 w-80 rounded-md bg-bg-surface" />
      </div>
      <div className="surface-panel h-32" />
      <StartupIdeaCardSkeleton />
      <StartupIdeaCardSkeleton />
    </div>
  );
}
