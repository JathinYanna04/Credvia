'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bootstrapIdeaGroupConversation } from '@/lib/chat/bootstrap-client';
import { cn } from '@/lib/utils/cn';

interface JoinIdeaDiscussionButtonProps {
  currentUserId?: string | null;
  ideaId: string;
  founderUserId: string;
  className?: string;
  label?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function JoinIdeaDiscussionButton({
  currentUserId,
  ideaId,
  founderUserId,
  className,
  label = 'Join discussion',
  variant = 'outline',
  size = 'default',
}: JoinIdeaDiscussionButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!currentUserId) {
    return (
      <Button asChild variant={variant} size={size} className={className}>
        <Link href="/login">
          <MessagesSquare className="h-4 w-4" />
          Sign in to join
        </Link>
      </Button>
    );
  }

  const joinDiscussion = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const result = await bootstrapIdeaGroupConversation(
        currentUserId,
        ideaId,
        founderUserId,
      );

      if (result.warning) {
        setStatusMessage(result.warning);
      }

      router.push(`/messages/${result.conversationId}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Unable to join this discussion right now.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={loading}
        onClick={() => {
          void joinDiscussion();
        }}
      >
        <MessagesSquare className="h-4 w-4" />
        {label}
      </Button>
      {statusMessage ? (
        <p className="text-xs text-text-secondary">{statusMessage}</p>
      ) : null}
    </div>
  );
}
