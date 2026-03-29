import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function BestAnswerBadge() {
  return (
    <Badge variant="accent">
      <Star className="h-3 w-3" />
      Best answer
    </Badge>
  );
}
