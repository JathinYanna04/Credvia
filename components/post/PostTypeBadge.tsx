import { BookOpen, Briefcase, FileText, HelpCircle, Lightbulb, MessageSquare, Rocket, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PostType } from '@/lib/types';

export interface PostTypeBadgeProps {
  type: PostType;
}

const config = {
  question: { label: 'Question', icon: HelpCircle, variant: 'warning' },
  discussion: { label: 'Discussion', icon: MessageSquare, variant: 'info' },
  project_showcase: { label: 'Project', icon: Rocket, variant: 'default' },
  resource: { label: 'Resource', icon: BookOpen, variant: 'success' },
  opportunity: { label: 'Opportunity', icon: Briefcase, variant: 'accent' },
  resume_review: { label: 'Resume Review', icon: FileText, variant: 'warning' },
  looking_for_collaborator: {
    label: 'Collaborator',
    icon: Users,
    variant: 'info',
  },
  startup_idea: {
    label: 'Startup Idea',
    icon: Lightbulb,
    variant: 'accent',
  },
} as const;

export function PostTypeBadge({ type }: PostTypeBadgeProps) {
  const item = config[type];
  const Icon = item.icon;

  return (
    <Badge variant={item.variant}>
      <Icon className="h-3 w-3" />
      {item.label}
    </Badge>
  );
}
