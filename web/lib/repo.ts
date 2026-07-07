// Single source of truth for the repository identity. Override via
// NEXT_PUBLIC_REPO_SLUG (e.g. on a fork) so URLs don't silently break.
export const REPO_SLUG =
  process.env.NEXT_PUBLIC_REPO_SLUG ?? "Hack-HQ/hackhq";

export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const REPO_RAW_BASE = `https://raw.githubusercontent.com/${REPO_SLUG}/main/`;
