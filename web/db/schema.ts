/* ---------------------------------------------------------------------------
   TYPES ONLY. This file is not a migration authority.

   `supabase/migrations/` is the single source of truth for this database. Those
   files carry the parts Drizzle cannot model at all:

     - row level security, and the eight policies across the two tables;
     - column-level GRANTs - on `hackathons`, withholding `submitted_by` from
       `anon` and `authenticated` while still allowing it on INSERT; on
       `user_hackathons`, withholding UPDATE on `user_id` and both directions on
       `created_at` (20260818013000);
     - three non-internal triggers - `skip_sync_over_user_rows` and
       `clear_featured_on_content_swap` on `hackathons`, and
       `force_tracker_owner` on `user_hackathons`, which fills `user_id` from the
       request JWT and raises 42501 on a mismatch. That trigger, not the
       `auth.jwt()` DEFAULT below, is the control: a DEFAULT is only consulted
       when the column is omitted. The DEFAULT is a convenience.

   A generated migration would contain none of it, so generating one from this
   file and applying it would silently delete the security model: dropping
   `origin` or `submitted_by` cascades all four `hackathons` policies, and RLS
   stays enabled, which means the table falls to default deny.

   That is why `db:push`, `db:generate` and `db:migrate` no longer exist in
   package.json. What remains is `db:pull` (introspect the live schema) and
   `db:studio` (read it). Schema changes are written as SQL in
   `supabase/migrations/` and applied by hand through the Supabase SQL Editor -
   see `docs/runbooks/apply-migration.md`.

   Keeping the shapes below faithful still matters: they are the types the app
   compiles against, and `.github/scripts/test_schema_drift.py` fails CI when
   they stop matching the migrations. Every column here is annotated with the
   migration that defines it.

   Known gap, deliberately not papered over: `drizzle/meta/0000_snapshot.json`
   describes only `public.hackathons`, records `"isRLSEnabled": false` and an
   empty `policies` map, and does not mention `user_hackathons` at all. It is a
   historical artefact of the one Drizzle-authored migration
   (`drizzle/0000_add_hackathon_event_dates.sql`, whose `startDate`/`endDate`
   columns are already in the Supabase baseline at
   `20260722141955_baseline_hackathons.sql:27-28`). Nothing reads the snapshot
   now that generation is gone.
--------------------------------------------------------------------------- */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The public board. Mirrors `20260722141955_baseline_hackathons.sql` (21
 * columns) plus `20260722144205_add_deck_columns.sql` (5 more) = 26.
 *
 * Read visibility is NOT expressed here and cannot be: `anon` and
 * `authenticated` hold column-level SELECT on 25 of these 26, with
 * `submitted_by` withheld (`20260722185202`, `20260722192614`), and the row
 * filter is the `read visible hackathons` policy. Treat every column below as
 * public except `submittedBy`.
 */
export const hackathons = pgTable(
  "hackathons",
  {
    // `gen_random_uuid()` default added by 20260722154341; `id` is deliberately
    // absent from the INSERT grant, so a submitter can neither supply nor omit
    // it without that default.
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    host: text("host").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
    format: text("format"),
    prize: text("prize"),
    state: text("state"),
    active: boolean("active").default(true),
    // Losing this default would make every synced row invisible to the public
    // read policy, which filters on `is_visible = true`.
    isVisible: boolean("is_visible").default(true),
    // bigint in the database, not integer: these are epoch milliseconds and
    // overflow int4. `mode: "number"` keeps the TS type `number`, matching what
    // listings.json carries.
    datePosted: bigint("date_posted", { mode: "number" }),
    dateUpdated: bigint("date_updated", { mode: "number" }),
    // A GitHub username, already public in listings.json and the README. Kept
    // readable on purpose (20260722185202:23-24).
    source: text("source"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geoStatus: text("geo_status"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
    deadline: date("deadline"),
    // Maintainer-only: absent from the column write grants, and cleared by the
    // `clear_featured_on_content_swap` trigger when a non-service writer swaps
    // the content out from under it (20260722190603).
    featured: boolean("featured").default(false),
    // camelCase in the database. They predate this schema and
    // seed_supabase.py reads them under these names.
    startDate: date("startDate"),
    endDate: date("endDate"),
    // Which write path produced the row. The `skip_sync_over_user_rows` trigger
    // keys on it to stop the hourly sync re-owning a user submission
    // (20260722154046), and the read policy's owner branch tests it.
    origin: text("origin").notNull().default("listings_json"),
    description: text("description"),
    logoUrl: text("logo_url"),
    hostType: text("host_type"),
    // The submitter's Clerk `sub`. INSERT-grantable to `authenticated` but
    // never SELECT-grantable and never UPDATE-grantable, so a row cannot be
    // re-owned. Not readable by the app at any privilege level it uses.
    submittedBy: text("submitted_by"),
  },
  (table) => [
    check("hackathons_origin_check", sql`origin in ('listings_json', 'user')`),
    check(
      "hackathons_host_type_check",
      sql`host_type is null or host_type in ('university', 'community', 'company')`,
    ),
    index("hackathons_origin_idx").on(table.origin),
  ],
);

/**
 * Per-user tracker rows: which stage a hackathon sits in for one user, and
 * whether they won it (#226). `userId` is the Clerk `sub`, matching the
 * `submittedBy` convention above.
 *
 * There is intentionally no foreign key to `hackathons` — that table is an
 * hourly mirror of `listings.json`, and the app renders from the JSON, so an FK
 * would reject saves for listings newer than the last sync. The authoritative
 * definition (defaults, RLS, grants) is
 * `supabase/migrations/20260725154500_user_hackathons.sql`; this mirrors it for
 * Drizzle's benefit and does not create the policies.
 *
 * `userId` carries a database default — `default auth.jwt() ->> 'sub'`, written
 * here as raw SQL so the shape is at least visible — but that default is not
 * what keeps a row from being owned by someone else. A DEFAULT is only consulted
 * when the column is omitted, so a caller that names `user_id` never reaches it.
 * What refuses a mismatch is the `public.force_tracker_owner` BEFORE INSERT OR
 * UPDATE trigger from
 * `20260818013000_force_tracker_owner_and_column_grants.sql`: it fills `user_id`
 * from the JWT `sub` when omitted and raises SQLSTATE 42501 otherwise, and that
 * migration also stops granting UPDATE on `user_id` at all, so an existing row
 * cannot be re-owned. Behind both sit the `WITH CHECK` policies. None of it
 * binds in service-role mode: the trigger keys on the request JWT and
 * `service_role` carries none, RLS is bypassed, and column grants do not apply —
 * there the boundary is the `.eq("user_id", ...)` filters in
 * `web/lib/tracker-store.ts` (#235). Drizzle can express none of this; the
 * migration files remain authoritative.
 */
export const userHackathons = pgTable(
  "user_hackathons",
  {
    userId: text("user_id")
      .notNull()
      .default(sql`auth.jwt() ->> 'sub'`),
    hackathonId: uuid("hackathon_id").notNull(),
    stage: text("stage").notNull().default("interested"),
    isWin: boolean("is_win").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.hackathonId] }),
    check(
      "user_hackathons_stage_check",
      sql`stage in ('interested', 'applied', 'accepted', 'going')`,
    ),
  ],
);
