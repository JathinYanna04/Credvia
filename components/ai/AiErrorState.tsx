export interface AiErrorStateProps {
  message: string;
}

export function AiErrorState({ message }: AiErrorStateProps) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
      {message}
    </div>
  );
}
