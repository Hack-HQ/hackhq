/**
 * Return `url` only if it is a plain http(s) link, otherwise `undefined`.
 *
 * Listing URLs are community-submitted. Ingestion already neutralizes bad
 * schemes (`util.clean_url` force-prepends `https://`), but the frontend should
 * not blindly trust that: if `listings.json` is ever populated by a path that
 * skips `clean_url` (a new script, a manual edit, a compromised CI step), a
 * `javascript:` / `data:` value rendered into an anchor's `href` becomes
 * click-to-XSS — React does not sanitize hrefs. Passing every listing `url`
 * through this guard means an unsafe value yields no `href` (a dead, harmless
 * anchor) instead of an executable one.
 */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}
