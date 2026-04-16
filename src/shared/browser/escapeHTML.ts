/**
 * Escape HTML-special characters to prevent injection when
 * interpolating untrusted strings into HTML template literals.
 */
export const escapeHTML = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
