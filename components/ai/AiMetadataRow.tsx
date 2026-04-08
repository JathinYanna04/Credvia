export interface AiMetadataItem {
  label: string;
  value: string | null | undefined;
}

export interface AiMetadataRowProps {
  items: AiMetadataItem[];
}

export function AiMetadataRow({ items }: AiMetadataRowProps) {
  const visibleItems = items.filter((item) => item.value && item.value.trim().length > 0);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3 text-xs text-text-tertiary">
      {visibleItems.map((item) => (
        <div key={item.label} className="rounded-full bg-bg-overlay px-3 py-1">
          <span className="uppercase tracking-[0.12em]">{item.label}</span>
          <span className="ml-2 text-text-secondary">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
