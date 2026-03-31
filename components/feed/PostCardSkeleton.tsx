export function PostCardSkeleton() {
  return (
    <div className="surface-panel p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="skeleton h-10 w-10 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-3 h-5 w-full" />
          <div className="skeleton h-4 w-5/6" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="skeleton h-11 rounded-2xl" />
        <div className="skeleton h-11 rounded-2xl" />
        <div className="skeleton h-11 rounded-2xl" />
      </div>
    </div>
  );
}
