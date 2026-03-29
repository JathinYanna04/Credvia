export function PostCardSkeleton() {
  return (
    <div className="surface-panel p-5">
      <div className="skeleton mb-4 h-4 w-48" />
      <div className="skeleton mb-3 h-7 w-full" />
      <div className="skeleton mb-2 h-4 w-full" />
      <div className="skeleton mb-2 h-4 w-5/6" />
      <div className="mt-5 flex gap-2">
        <div className="skeleton h-8 w-8 rounded-full" />
        <div className="skeleton h-8 w-36" />
      </div>
    </div>
  );
}
