export interface AiEvidenceItem {
  claim: string;
  evidence: string;
  source: string;
  confidence: number;
}

export interface AiEvidenceListProps {
  title?: string;
  items: AiEvidenceItem[];
}

export function AiEvidenceList({ title = 'Evidence', items }: AiEvidenceListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-base p-4 text-sm text-text-secondary">
        No evidence captured.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={`${item.claim}-${index}`} className="rounded-2xl border border-border-subtle bg-bg-base p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
              <span className="rounded-full bg-bg-overlay px-2 py-0.5">{item.source}</span>
              <span>{Math.round(Math.max(0, Math.min(1, item.confidence)) * 100)}%</span>
            </div>
            <p className="mt-2 text-sm font-medium text-text-primary">{item.claim}</p>
            <p className="mt-2 text-sm text-text-secondary">{item.evidence}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
