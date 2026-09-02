/**
 * Refuse to build production from a CI system that is not this repo's pipeline.
 *
 * The failure this exists to prevent is a race nobody can see in a green run.
 * Cloudflare Workers Builds has been connected to this repository since
 * 2026-08-21 with a Clerk *development* publishable key as its build variable
 * (see web/README.md -> Deployment -> Workers Builds). It builds every push to
 * `main` and promotes about a minute later, so on 2026-09-02 it deployed its
 * own build of commit af5b3d6 over the one deploy.yml had just verified: same
 * commit, same listings, but `pk_test_` in the bundle, which bounces every
 * first-time visitor into a Clerk dev-instance handshake (HTTP 307) and breaks
 * sign-in until the next GitHub deploy overwrites it.
 *
 * Disabling that integration lives in the Cloudflare dashboard. This is the
 * half that lives in the repository: its build fails here, before it can
 * produce a bundle to promote, and the error says where to fix it. One
 * pipeline, not two.
 *
 * `WORKERS_CI=1` is injected by Workers Builds itself
 * (developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables),
 * so this cannot fire on a laptop, in GitHub Actions, or in `next dev` — only
 * inside the build system it names.
 */

/** Escape hatch, for deliberately re-enabling Workers Builds later. */
export const ALLOW_VAR = "HACKHQ_ALLOW_FOREIGN_CI";

export const FOREIGN_CI_MESSAGE = [
  "Refusing to build: this build is running on Cloudflare Workers Builds (WORKERS_CI=1),",
  "which is not this repository's deploy pipeline.",
  "",
  "Production deploys come from .github/workflows/deploy.yml, which supplies production",
  "credentials from repository secrets, runs the credential preflight, and verifies that",
  "the public site actually serves the build before recording it as shipped. Workers Builds",
  "was connected with a Clerk development key and promotes its build about a minute after",
  "every push, overwriting that verified deploy with one that redirects visitors to a Clerk",
  "development instance.",
  "",
  "Fix it in the Cloudflare dashboard: Workers & Pages -> hackhq -> Settings -> Builds ->",
  "Disconnect. To keep the integration but stop it deploying, set its deploy command to",
  "`npx wrangler versions upload` and its NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY build variable",
  "to the production pk_live_ key.",
  "",
  `If you are deliberately moving production onto Workers Builds, set ${ALLOW_VAR}=1 as a`,
  "build variable and retire deploy.yml in the same change. See web/README.md -> Deployment.",
].join("\n");

/**
 * The error message for a build that must not run here, or null when the build
 * is allowed to proceed.
 *
 * Takes the environment as an argument rather than reading `process.env`, so
 * the rule is testable without mutating global state.
 */
export function foreignCiError(
  env: Record<string, string | undefined>,
): string | null {
  const allowed = env[ALLOW_VAR];
  if (allowed === "1" || allowed?.toLowerCase() === "true") return null;
  // Only Workers Builds sets this. GitHub Actions sets CI=true but never
  // WORKERS_CI, so this stays silent in the pipeline we do want.
  return env.WORKERS_CI ? FOREIGN_CI_MESSAGE : null;
}
