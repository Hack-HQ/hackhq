import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext adapter for Cloudflare Workers. The app has no request-time
// filesystem or Node-server dependency (repo data is imported as build-time
// constants — see lib/generated/ and scripts/prepare-repo-data.mjs), so no
// custom caching/queue overrides are needed here. ISR still works via the
// Workers runtime; add an incrementalCache/queue binding later if we want
// on-demand revalidation backed by KV/R2.
export default defineCloudflareConfig();
