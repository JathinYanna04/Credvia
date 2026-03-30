'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FeedTab } from '@/lib/types';

export interface FeedTabsProps {
  value: FeedTab;
  onValueChange: (value: FeedTab) => void;
}

export function FeedTabs({ value, onValueChange }: FeedTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as FeedTab)}>
      <TabsList className="w-full justify-start rounded-none border-b border-border-subtle bg-transparent p-0">
        <TabsTrigger value="for-you">For You</TabsTrigger>
        <TabsTrigger value="communities">Communities</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
