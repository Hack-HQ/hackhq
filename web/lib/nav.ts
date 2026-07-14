/** The primary sections, shared by the desktop links and the mobile menu. */
export const NAV_LINKS: [string, string][] = [
  ["GLOBE", "/globe"],
  ["DECK", "/deck"],
  ["MY HQ", "/my"],
];

/**
 * Is `href` the section the visitor is currently in?
 *
 * A section owns its subpaths (/deck/anything is still the deck), but "/" is
 * matched exactly — otherwise the home link would light up on every route.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
