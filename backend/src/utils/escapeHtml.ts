/**
 * Escape HTML special characters to prevent XSS in server-rendered templates.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips script tags and unsafe attributes from string.
 */
export function sanitizeMetaContent(str: unknown): string {
  if (!str) return '';
  return escapeHtml(String(str).replace(/[\r\n\t]+/g, ' ').trim());
}

