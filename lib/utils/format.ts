import { formatDistanceToNowStrict } from 'date-fns';

export function formatRelativeTime(value: string | Date) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function formatCompactRelativeTime(value: string | Date) {
  const target = new Date(value).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - target) / 1000));

  if (seconds < 60) {
    return 'now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
