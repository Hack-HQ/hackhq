/* ---------------------------------------------------------------------------
   /api/tracker - the signed-in user's pipeline and wins (#226).

   | Method | Does |
   | ------ | ---- |
   | GET    | list every row for the caller |
   | PUT    | create or update one row (stage and/or win) |
   | DELETE | remove one row |
   | POST   | hand a browser-local tracker over, additively, on first sign-in |

   Two responses mean "carry on locally" rather than "something broke":
   `{ synced: false }` with a 200, returned when Clerk or Supabase is not
   configured. The tracker has always worked without a server, that stays true,
   and the client treats a 200 with `synced: false` as its cue to keep using
   localStorage alone. A signed-out caller, by contrast, gets a 401 - on a
   configured deployment that is a real failure, not a degraded mode.
--------------------------------------------------------------------------- */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isTrackerSyncConfigured } from "@/lib/env";
import { isHackathonId, isStage, parseTrackerEntries } from "@/lib/tracker";
import {
  deleteTrackerRow,
  importTrackerRows,
  listTracker,
  upsertTrackerRow,
} from "@/lib/tracker-store";

// Per-user data: never prerendered, never cached.
export const dynamic = "force-dynamic";

const NOT_SYNCED = { synced: false as const };

/**
 * Resolve the caller, or the reason there is nothing to do. Both keys and the
 * Clerk session are checked before any query, so an unconfigured deployment
 * never constructs a Supabase client.
 */
async function resolveUser(): Promise<
  { userId: string } | { response: NextResponse }
> {
  if (!isTrackerSyncConfigured()) {
    return { response: NextResponse.json(NOT_SYNCED) };
  }
  const { userId } = await auth();
  if (!userId) {
    return {
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { userId };
}

/**
 * Log the real cause server-side, tell the client only that it failed. Supabase
 * error messages can name columns and constraints, which is not something to
 * hand back over the wire.
 */
function serverError(operation: string, error: unknown): NextResponse {
  console.error(`[api/tracker] ${operation} failed:`, error);
  return NextResponse.json({ error: "Tracker sync failed" }, { status: 500 });
}

export async function GET() {
  const resolved = await resolveUser();
  if ("response" in resolved) return resolved.response;

  try {
    const entries = await listTracker(resolved.userId);
    return NextResponse.json({ synced: true, entries });
  } catch (error) {
    return serverError("list", error);
  }
}

export async function PUT(request: Request) {
  const resolved = await resolveUser();
  if ("response" in resolved) return resolved.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { hackathonId, stage, isWin } = (body ?? {}) as Record<string, unknown>;
  if (!isHackathonId(hackathonId)) {
    return NextResponse.json({ error: "Invalid hackathonId" }, { status: 400 });
  }
  if (stage !== undefined && !isStage(stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }
  if (isWin !== undefined && typeof isWin !== "boolean") {
    return NextResponse.json({ error: "Invalid isWin" }, { status: 400 });
  }
  if (stage === undefined && isWin === undefined) {
    return NextResponse.json(
      { error: "Provide stage, isWin, or both" },
      { status: 400 },
    );
  }

  try {
    const entry = await upsertTrackerRow(resolved.userId, hackathonId, {
      stage,
      isWin,
    });
    return NextResponse.json({ synced: true, entry });
  } catch (error) {
    return serverError("upsert", error);
  }
}

export async function DELETE(request: Request) {
  const resolved = await resolveUser();
  if ("response" in resolved) return resolved.response;

  const hackathonId = new URL(request.url).searchParams.get("hackathonId");
  if (!isHackathonId(hackathonId)) {
    return NextResponse.json({ error: "Invalid hackathonId" }, { status: 400 });
  }

  try {
    await deleteTrackerRow(resolved.userId, hackathonId);
    return NextResponse.json({ synced: true });
  } catch (error) {
    return serverError("delete", error);
  }
}

// A local tracker can only be as large as the listing set, but the bound is
// stated rather than assumed so an oversized body is rejected before it becomes
// one enormous upsert.
const MAX_IMPORT_ENTRIES = 500;

export async function POST(request: Request) {
  const resolved = await resolveUser();
  if ("response" in resolved) return resolved.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entries = parseTrackerEntries((body as { entries?: unknown })?.entries);
  if (entries.length > MAX_IMPORT_ENTRIES) {
    return NextResponse.json({ error: "Too many entries" }, { status: 413 });
  }

  try {
    await importTrackerRows(resolved.userId, entries);
    // Return the merged result so the client adopts the server's view in one
    // round trip, including any row the import deliberately left alone.
    const merged = await listTracker(resolved.userId);
    return NextResponse.json({ synced: true, entries: merged });
  } catch (error) {
    return serverError("import", error);
  }
}
