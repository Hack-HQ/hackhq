// Refuse to build a production bundle out of development credentials.
//
// The failure this exists to prevent (audit, 2026-08-26) is silent and total:
//
//   `npm run deploy` builds locally, and `next build` loads `.env.local`. That
//   file holds a Clerk *development* instance (`pk_test_…`/`sk_test_…`). The
//   publishable key is inlined into the client bundle at build time, while
//   `CLERK_SECRET_KEY` lives on the Worker as a secret that a deploy never
//   touches — so the browser would get `pk_test_` while the server kept
//   verifying with `sk_live_`. Two different Clerk instances, two different user
//   databases: every sign-in fails, and nothing in the build says so.
//
//   The same build drops PostHog entirely, because the project token is not in
//   `.env.local` at all. An absent analytics token is a legitimate configuration
//   (see lib/analytics.ts), so nothing warns — production just stops reporting.
//
// Both are invisible at build time and only observable in production, which is
// what makes them worth a hard gate rather than a warning.
//
// This runs as `predeploy`, so it covers `npm run deploy` from a laptop and the
// same script from CI, and it cannot be skipped by forgetting a flag.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Next's own precedence for `next build` (NODE_ENV=production), highest first.
// Replicated rather than approximated: reading only `process.env` would miss
// `.env.local` entirely, which is precisely where the test keys live — the
// check would pass and the build would still bake `pk_test_`.
const ENV_FILES = [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
];

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in out)) out[key] = value;
  }
  return out;
}

const fileEnv = {};
for (const name of ENV_FILES) {
  for (const [k, v] of Object.entries(parseEnvFile(join(webRoot, name)))) {
    if (!(k in fileEnv)) fileEnv[k] = v; // first file wins, matching Next
  }
}

// process.env outranks every file, which is how CI supplies production values.
const resolve = (key) => {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined && fromProcess !== "") {
    return { value: fromProcess, source: "environment" };
  }
  const fromFile = fileEnv[key];
  if (fromFile !== undefined && fromFile !== "") {
    return { value: fromFile, source: "env file" };
  }
  return { value: "", source: "unset" };
};

const ALLOW = process.env.HACKHQ_ALLOW_NONPROD_DEPLOY === "1";

const CHECKS = [
  {
    key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    // Not merely "present": a present-but-test key is the actual bug. The
    // Worker's CLERK_SECRET_KEY is a secret that deploys never overwrite, so a
    // test publishable key cannot be paired with a matching test secret here.
    check: (v) => v.startsWith("pk_live_"),
    expected: "a production key (pk_live_…)",
    consequence:
      "the browser would load a Clerk development instance while the Worker " +
      "keeps verifying with the live secret key — every sign-in fails",
  },
  {
    key: "NEXT_PUBLIC_MAPBOX_TOKEN",
    check: (v) => v.startsWith("pk."),
    expected: "a Mapbox public token (pk.…)",
    consequence: "the globe renders a placeholder instead of the map",
  },
  {
    key: "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
    check: (v) => v.startsWith("phc_"),
    expected: "a PostHog project token (phc_…)",
    consequence:
      "analytics silently disappears from production — an absent token is a " +
      "valid config, so nothing else would warn",
  },
];

// Anything matching this in a value that is about to be inlined into the client
// bundle is a development credential, whatever the variable happens to be named.
const TEST_CREDENTIAL = /^(pk|sk)_test_/;

const failures = [];
const rows = [];

for (const { key, check, expected, consequence } of CHECKS) {
  const { value, source } = resolve(key);
  const ok = value !== "" && check(value);
  rows.push({
    key,
    source,
    shown: value ? `${value.slice(0, 12)}…` : "(unset)",
    ok,
  });
  if (!ok) {
    failures.push(
      `  ${key}\n` +
        `    found:    ${value ? `${value.slice(0, 12)}… (from ${source})` : "unset"}\n` +
        `    expected: ${expected}\n` +
        `    if wrong: ${consequence}`,
    );
  }
}

// A second, broader net: catch a development credential under any NEXT_PUBLIC_
// name, including ones added after this file was written.
for (const [key, value] of Object.entries({ ...fileEnv, ...process.env })) {
  if (!key.startsWith("NEXT_PUBLIC_") || typeof value !== "string") continue;
  if (!TEST_CREDENTIAL.test(value)) continue;
  if (CHECKS.some((c) => c.key === key)) continue; // already reported above
  failures.push(
    `  ${key}\n` +
      `    found:    ${value.slice(0, 12)}… (a development credential)\n` +
      `    expected: a production credential, or the variable unset`,
  );
}

const label = (ok) => (ok ? "ok  " : "FAIL");
console.log("[preflight] production build credentials");
for (const r of rows) {
  console.log(
    `  ${label(r.ok)} ${r.key.padEnd(34)} ${r.shown.padEnd(16)} ${r.source}`,
  );
}

if (failures.length === 0) {
  console.log("[preflight] all production credentials present — building");
  process.exit(0);
}

if (ALLOW) {
  console.warn(
    "\n[preflight] " +
      failures.length +
      " check(s) failed, but HACKHQ_ALLOW_NONPROD_DEPLOY=1 is set — continuing.\n" +
      "[preflight] Do not use this to publish to hacking-hq.com.\n",
  );
  process.exit(0);
}

console.error(
  "\n[preflight] refusing to build: this would ship a broken production bundle.\n",
);
console.error(failures.join("\n\n"));
console.error(
  "\n" +
    "Production deploys are meant to run from .github/workflows/deploy.yml, which\n" +
    "supplies these from repository secrets. See web/README.md -> Deployment.\n" +
    "\n" +
    "To build a non-production bundle anyway (previews, local Worker testing):\n" +
    "  HACKHQ_ALLOW_NONPROD_DEPLOY=1 npm run deploy\n",
);
process.exit(1);
