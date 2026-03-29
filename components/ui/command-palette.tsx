'use client';

import { Command } from 'cmdk';
import { Search, Settings, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { mockCommunities, mockPosts, mockUsers } from '@/lib/mock-data';
import { cn } from '@/lib/utils/cn';

export interface CommandPaletteProps {
  className?: string;
}

export function CommandPalette({ className }: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <div className="mx-auto mt-24 w-[min(720px,92vw)]">
        <Command
          className={cn('surface-elevated overflow-hidden', className)}
          loop
        >
          <div className="flex items-center border-b border-border-subtle px-4">
            <Search className="h-4 w-4 text-text-tertiary" />
            <Command.Input
              placeholder="Search communities, posts, people, and actions"
              className="h-14 w-full bg-transparent px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>
          <Command.List className="max-h-[420px] overflow-y-auto p-3">
            <Command.Empty className="px-3 py-8 text-center text-sm text-text-secondary">
              No matching results.
            </Command.Empty>

            <Command.Group heading="Actions" className="px-2 py-2 text-xs text-text-tertiary">
              <Command.Item className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-primary aria-selected:bg-bg-overlay">
                <Search className="h-4 w-4 text-accent" />
                Create post
              </Command.Item>
              <Command.Item className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-primary aria-selected:bg-bg-overlay">
                <Settings className="h-4 w-4 text-text-secondary" />
                Open settings
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Communities" className="px-2 py-2 text-xs text-text-tertiary">
              {mockCommunities.map((community) => (
                <Command.Item
                  key={community.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-primary aria-selected:bg-bg-overlay"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-overlay font-mono text-xs text-accent">
                    {community.icon}
                  </div>
                  <div className="flex-1">
                    <div>{community.name}</div>
                    <div className="text-xs text-text-secondary">{community.description}</div>
                  </div>
                  <Users className="h-4 w-4 text-text-tertiary" />
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="People" className="px-2 py-2 text-xs text-text-tertiary">
              {mockUsers.map((user) => (
                <Command.Item
                  key={user.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm text-text-primary aria-selected:bg-bg-overlay"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-overlay text-xs font-semibold text-accent">
                    {user.fullName
                      .split(' ')
                      .map((chunk) => chunk[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div>{user.fullName}</div>
                    <div className="text-xs text-text-secondary">@{user.username}</div>
                  </div>
                  <UserPlus className="h-4 w-4 text-text-tertiary" />
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Posts" className="px-2 py-2 text-xs text-text-tertiary">
              {mockPosts.map((post) => (
                <Command.Item
                  key={post.id}
                  className="cursor-pointer rounded-xl px-3 py-3 text-sm text-text-primary aria-selected:bg-bg-overlay"
                >
                  <div>{post.title}</div>
                  <div className="text-xs text-text-secondary">{post.community.name}</div>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
      <button
        className="absolute inset-0 -z-10 cursor-default"
        onClick={() => setOpen(false)}
        aria-label="Close command palette"
      />
    </div>
  );
}
