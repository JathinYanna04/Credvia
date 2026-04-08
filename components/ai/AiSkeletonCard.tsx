export interface AiSkeletonCardProps {
  lines?: number;
}

export function AiSkeletonCard({ lines = 3 }: AiSkeletonCardProps) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-base p-4">
      <div className="h-5 w-40 animate-pulse rounded-lg bg-bg-overlay" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div key={index} className="h-3 animate-pulse rounded-md bg-bg-overlay" />
        ))}
      </div>
    </div>
  );
}
