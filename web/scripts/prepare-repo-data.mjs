// Materializes the repo-root data files into web/lib/generated/ as plain JSON
// modules, so the site's loaders can `import` them instead of reading from disk
// at request time.
//
// Why this exists
// ---------------
// The data pages (`/`, `/deck`, `/globe`, `/hackathons`, ...) previously called
// `fs.readFileSync` on files that live ABOVE this Next.js project (../README.md,
// ../.github/scripts/listings.json, ../.github/scripts/geocodes.json). That
// works on Node serverless hosts only because `outputFileTracingIncludes`
// bundles those parent files into the function. Cloudflare Workers have no
// filesystem at all, so any request-time `fs` read throws there (and the
// failure is delayed: the first prerender succeeds, then hourly ISR
// regeneration hits ENOENT).
//
// Reading the files here — at build time, in Node, where the filesystem exists —
// and emitting them as JSON the loaders import turns every request-time disk
// read into a compile-time constant. The bundle is then runtime-agnostic and
// deploys cleanly to Workers, Vercel, or Node.
//
// This does not change the render contract documented in web/README.md: the
// data was already frozen into the deployment at build time (a content edit
// always needed a rebuild). Date-derived state ("closing soon", day counts) is
// still computed from `new Date()` on every ISR regeneration, so hourly
// revalidation keeps working exactly as before.
//
// Runs via the `predev` / `build` / `pretest` npm lifecycle hooks. Output is
// gitignored and regenerated on every run.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, "..");
const repoRoot = path.join(webRoot, "..");
const outDir = path.join(webRoot, "lib", "generated");

const README_PATH = path.join(repoRoot, "README.md");
const LISTINGS_PATH = path.join(repoRoot, ".github", "scripts", "listings.json");
const GEOCODES_PATH = path.join(repoRoot, ".github", "scripts", "geocodes.json");
const GALLERY_PATH = path.join(repoRoot, ".github", "scripts", "gallery.json");
const ASSETS_DIR = path.join(repoRoot, "assets");

mkdirSync(outDir, { recursive: true });

// --- README: emit as { content: string } so JSON.stringify handles escaping.
const readme = readFileSync(README_PATH, "utf8");
writeFileSync(
  path.join(outDir, "readme.json"),
  JSON.stringify({ content: readme }),
);

// --- listings.json and geocodes.json: re-parse then re-serialize so a malformed
// source fails the build loudly here, not at render time.
const listings = JSON.parse(readFileSync(LISTINGS_PATH, "utf8"));
if (!Array.isArray(listings)) {
  throw new Error("listings.json did not parse to an array");
}
writeFileSync(path.join(outDir, "listings.json"), JSON.stringify(listings));

const geocodes = JSON.parse(readFileSync(GEOCODES_PATH, "utf8"));
writeFileSync(path.join(outDir, "geocodes.json"), JSON.stringify(geocodes));

// --- gallery.json: community photos for the infinite canvas. Same
// build-time snapshot pattern as listings, no request-time fs on Workers.
const gallery = JSON.parse(readFileSync(GALLERY_PATH, "utf8"));
if (!Array.isArray(gallery)) {
  throw new Error("gallery.json did not parse to an array");
}
writeFileSync(path.join(outDir, "gallery.json"), JSON.stringify(gallery));

// --- Asset manifest: the "assets/<path>" list resolveAssetSrc() uses to decide
// local-vs-remote without an fs.existsSync at request time. Mirrors what
// copy-repo-assets.mjs copies into public/repo-assets.
function walk(dir, prefix) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(abs).isDirectory()) {
      out.push(...walk(abs, rel));
    } else {
      out.push(`assets/${rel}`);
    }
  }
  return out;
}
const assetManifest = walk(ASSETS_DIR, "");
writeFileSync(
  path.join(outDir, "asset-manifest.json"),
  JSON.stringify(assetManifest),
);

// --- public/site-data/: the same listings snapshot, plus which commit it came
// from, served as static files at /site-data/listings.json and
// /site-data/build.json.
//
// This is how "is the site up to date with the repository?" gets answered
// exactly. .github/scripts/check_site_freshness.py used to look for each
// listing's URL inside the home page's RSC payload, and that payload is split
// into arbitrary <script> chunks — a URL straddling a chunk boundary reads as a
// missing hackathon (TreeHacks and VTHacks were reported missing from a
// deployment that contained them, 2026-09-01). Comparing listing ids against a
// file that IS the deployed snapshot has no such failure mode, and the commit
// sha says which deploy is live without inferring it from a git tag.
//
// Static on purpose: served by the ASSETS binding, so it never passes through
// middleware (Clerk only sees document requests anyway) and costs no Worker
// invocation. The site-data directory is gitignored and regenerated every run.
const siteDataDir = path.join(webRoot, "public", "site-data");
mkdirSync(siteDataDir, { recursive: true });
writeFileSync(path.join(siteDataDir, "listings.json"), JSON.stringify(listings));

function commitSha() {
  // CI first (GitHub Actions, then Cloudflare Workers Builds), then git for a
  // local build. "unknown" rather than a throw: a build from a tarball with no
  // .git still has to succeed; it just cannot be matched to a commit.
  const fromEnv = process.env.GITHUB_SHA || process.env.WORKERS_CI_COMMIT_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}
const buildInfo = {
  sha: commitSha(),
  builtAt: new Date().toISOString(),
  listings: listings.length,
};
writeFileSync(path.join(siteDataDir, "build.json"), JSON.stringify(buildInfo));

console.log(
  `[prepare-repo-data] wrote lib/generated/ ` +
    `(${listings.length} listings, ${gallery.length} gallery photos, ` +
    `${assetManifest.length} assets) and public/site-data/ ` +
    `(sha ${buildInfo.sha.slice(0, 7)})`,
);
