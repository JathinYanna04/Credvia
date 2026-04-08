'use client';

import { Button } from '@/components/ui/button';

export interface AiShareButtonProps {
  title: string;
  text: string;
}

export function AiShareButton({ title, text }: AiShareButtonProps) {
  async function onShare() {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

    if (navigator.share) {
      await navigator.share({
        title,
        text,
        url: shareUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(`${title}\n\n${text}\n\n${shareUrl}`);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void onShare()}>
      Share
    </Button>
  );
}
