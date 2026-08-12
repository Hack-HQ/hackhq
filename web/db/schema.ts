import {
  boolean,
  date,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const hackathons = pgTable("hackathons", {
  id: uuid("id").primaryKey(),
  host: text("host").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  locations: text("locations").array().notNull(),
  format: text("format"),
  prize: text("prize"),
  state: text("state"),
  active: boolean("active"),
  isVisible: boolean("is_visible"),
  datePosted: integer("date_posted"),
  dateUpdated: integer("date_updated"),
  source: text("source"),
  deadline: date("deadline"),
  startDate: date("startDate"),
  endDate: date("endDate"),
  featured: boolean("featured"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  geoStatus: text("geo_status"),
});

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
 */
export const userHackathons = pgTable(
  "user_hackathons",
  {
    userId: text("user_id").notNull(),
    hackathonId: uuid("hackathon_id").notNull(),
    stage: text("stage").notNull().default("interested"),
    isWin: boolean("is_win").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.hackathonId] })],
);
