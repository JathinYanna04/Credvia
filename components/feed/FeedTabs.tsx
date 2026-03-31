'use client';

import { ScrollablePillTabs } from '@/components/ui/ScrollablePillTabs';
import type { FeedTab } from '@/lib/types';

export interface FeedTabsProps {
  value: FeedTab;
  onValueChange: (value: FeedTab) => void;
}

export function FeedTabs({ value, onValueChange }: FeedTabsProps) {
  return (
    <ScrollablePillTabs
      value={value}
      onValueChange={onValueChange}
      items={[
        { value: 'for-you', label: 'For You' },
        { value: 'communities', label: 'Communities' },
      ]}
    />
  );
}
