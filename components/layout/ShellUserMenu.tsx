'use client';

import { ChevronDown, Settings, User } from 'lucide-react';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown';

export interface ShellUserMenuProps {
  username: string;
  fullName: string;
}

export function ShellUserMenu({ username, fullName }: ShellUserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-bg-surface px-2.5 py-2 text-left transition-colors hover:border-border-default lg:px-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-accent/10 text-[11px] font-semibold text-accent">
            {fullName
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="hidden min-w-0 lg:block">
          <div className="max-w-[132px] truncate text-sm font-medium text-text-primary">{fullName}</div>
          <div className="max-w-[132px] truncate text-xs text-text-tertiary">@{username}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-text-tertiary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl border-border-subtle bg-bg-elevated p-2">
        <div className="px-2 py-2">
          <div className="text-sm font-semibold text-text-primary">{fullName}</div>
          <div className="text-xs text-text-tertiary">@{username}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => window.location.assign(`/u/${username}`)}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.location.assign('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          <LogoutButton className="w-full justify-start" compact />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
