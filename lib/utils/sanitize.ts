import DOMPurify from 'dompurify';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHtml(html: string) {
  if (typeof window === 'undefined') {
    return escapeHtml(html).replace(/\n/g, '<br />');
  }

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
