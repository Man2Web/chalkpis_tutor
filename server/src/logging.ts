/**
 * What is safe to put in a log line for a request URL: the path only, with secrets removed.
 * Query strings are dropped (they can carry phone numbers or codes) and parent-link tokens are hidden.
 */
export function safeUrl(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.replace(/\/p\/[A-Za-z0-9_-]{16,}/g, '/p/[hidden]');
}
