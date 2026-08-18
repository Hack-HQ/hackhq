/* ---------------------------------------------------------------------------
   Drizzle is a READ-ONLY tool in this repo.

   `supabase/migrations/` is the source of truth for the database, and it carries
   things drizzle-kit cannot model: row level security, the column-level GRANTs
   that withhold `submitted_by`, two BEFORE UPDATE triggers, and the
   `auth.jwt()` default on `user_hackathons.user_id`. A generated migration
   would contain none of them, and applying one would drop `origin` and
   `submitted_by` — cascading all four policies on a table where RLS stays
   enabled, i.e. default deny.

   So `db:push`, `db:generate` and `db:migrate` are gone from package.json. Only
   `db:pull` (introspect) and `db:studio` (browse) remain, and `out:` below
   exists solely as the destination for `db:pull` output. Schema changes are
   hand-applied SQL — see `docs/runbooks/apply-migration.md`.
--------------------------------------------------------------------------- */

import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or SUPABASE_DATABASE_URL is required for Drizzle");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
