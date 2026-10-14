/**
 * What is safe to put in a log line for a request URL: the path only, with secrets removed.
 * Query strings are dropped (they can carry phone numbers or codes), and the tokens of links that work without
 * signing in are hidden: parent pages (/p/), "I've paid" (/f/), pay pages (/pay/) and the delivery-report webhook.
 */
export function safeUrl(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.replace(
    /\/(p|f|pay|webhooks\/wa-dlr)\/[A-Za-z0-9_.~-]{16,}/g,
    (_m, kind: string) => `/${kind}/[hidden]`,
  );
}
