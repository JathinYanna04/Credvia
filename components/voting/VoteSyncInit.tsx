'use client';

import { useEffect } from 'react';
import { initializeVoteSync } from '@/lib/voting-sync';

export function VoteSyncInit() {
  useEffect(() => initializeVoteSync(), []);

  return null;
}
