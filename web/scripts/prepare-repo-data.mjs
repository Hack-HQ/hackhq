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
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, "..");
const repoRoot = path.join(webRoot, "..");
const outDir = path.join(webRoot, "lib", "generated");

const README_PATH = path.join(repoRoot, "README.md");
const LISTINGS_PATH = path.join(repoRoot, ".github", "scripts", "listings.json");
const GEOCODES_PATH = path.join(repoRoot, ".github", "scripts", "geocodes.json");
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

console.log(
  `[prepare-repo-data] wrote lib/generated/ ` +
    `(${listings.length} listings, ${assetManifest.length} assets)`,
);
