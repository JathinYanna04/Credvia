'use client';

import { useEffect, useRef } from 'react';

export interface InfiniteScrollProps {
  onLoadMore?: () => void;
}

export function InfiniteScroll({ onLoadMore }: InfiniteScrollProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current || !onLoadMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        onLoadMore();
      }
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [onLoadMore]);

  return <div ref={ref} className="h-10 w-full" aria-hidden="true" />;
}
