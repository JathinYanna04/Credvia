export interface AiEmptyStateProps {
  title: string;
  message: string;
}

export function AiEmptyState({ title, message }: AiEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-base p-4">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary">{message}</p>
    </div>
  );
}
