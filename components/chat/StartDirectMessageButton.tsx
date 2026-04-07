'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bootstrapDirectMessageConversation } from '@/lib/chat/bootstrap-client';
import { cn } from '@/lib/utils/cn';

interface StartDirectMessageButtonProps {
  currentUserId?: string | null;
  targetUserId: string;
  className?: string;
  label?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function StartDirectMessageButton({
  currentUserId,
  targetUserId,
  className,
  label = 'Message',
  variant = 'secondary',
  size = 'default',
}: StartDirectMessageButtonProps) {
  const router = useRouter();
  const inFlightRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!currentUserId) {
    return (
      <Button asChild variant={variant} size={size} className={className}>
        <Link href="/login">
          <MessageCircle className="h-4 w-4" />
          Sign in to message
        </Link>
      </Button>
    );
  }

  if (currentUserId === targetUserId) {
    return null;
  }

  const startConversation = async () => {
    if (loading || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setLoading(true);
    setStatusMessage(null);

    try {
      const result = await bootstrapDirectMessageConversation(
        currentUserId,
        targetUserId,
      );

      if (result.warning) {
        setStatusMessage(result.warning);
      }

      router.push(`/messages/${result.conversationId}`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Unable to start this conversation right now.',
      );
    } finally {
      inFlightRef.current = false;
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
          void startConversation();
        }}
      >
        <MessageCircle className="h-4 w-4" />
        {label}
      </Button>
      {statusMessage ? (
        <p className="text-xs text-text-secondary">{statusMessage}</p>
      ) : null}
    </div>
  );
}
