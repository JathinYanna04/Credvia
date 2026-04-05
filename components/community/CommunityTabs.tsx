"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils/cn";

interface CommunityTabsProps {
  slug: string;
}

const tabs = [
  { label: "Feed", href: (slug: string) => `/c/${slug}`, match: null },
  {
    label: "About",
    href: (slug: string) => `/c/${slug}/about`,
    match: "about",
  },
  {
    label: "Rules",
    href: (slug: string) => `/c/${slug}/rules`,
    match: "rules",
  },
  {
    label: "Top Contributors",
    href: (slug: string) => `/c/${slug}/contributors`,
    match: "contributors",
  },
] as const;

export function CommunityTabs({ slug }: CommunityTabsProps) {
  const segment = useSelectedLayoutSegment();

  return (
    <div className="flex flex-wrap gap-3 border-b border-border-subtle pb-3 text-sm text-text-secondary">
      {tabs.map((tab) => {
        const isActive = segment === tab.match;

        return (
          <Link
            key={tab.label}
            href={tab.href(slug)}
            className={cn(
              "transition-colors hover:text-text-primary",
              isActive && "text-accent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
