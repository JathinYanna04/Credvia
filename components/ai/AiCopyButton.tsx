'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface AiCopyButtonProps {
  value: string;
  label?: string;
}

export function AiCopyButton({ value, label = 'Copy' }: AiCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void onCopy()}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
