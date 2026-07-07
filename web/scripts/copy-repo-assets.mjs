// Copies the repo-root ../assets tree into web/public/repo-assets so the
// stats banner and gallery photos are served as ordinary static files.
//
// Why: resolveAssetSrc() maps local assets to /repo-assets/<path>. Previously a
// dynamic route read them from ../assets at request time, which 404s on
// serverless (files outside web/ aren't in the function bundle). Copying them
// into public/ at build time bundles them and lets Next serve them statically.
//
// Runs automatically via the `predev` / `prebuild` npm lifecycle hooks.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, "..");
const src = path.join(webRoot, "..", "assets");
const dest = path.join(webRoot, "public", "repo-assets");

if (!existsSync(src)) {
  // Not fatal — remote fallback (raw.githubusercontent) still serves assets.
  console.warn(`[copy-repo-assets] source not found: ${src} — skipping`);
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
// dereference: materialize real files (don't copy symlinks), so no symlink can
// point outside the bundle.
cpSync(src, dest, { recursive: true, dereference: true });
console.log(`[copy-repo-assets] copied ${src} -> ${dest}`);
