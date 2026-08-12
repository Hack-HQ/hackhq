"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Hackathon } from "@/lib/types-hq";
import {
  parseTrackerEntries,
  sanitizeTrackerMap,
  sanitizeWinMap,
  splitEntries,
  toTrackerEntries,
  type Stage,
  type TrackerMap,
  type WinMap,
} from "@/lib/tracker";

// The stage vocabulary lives in lib/tracker.ts so /api/tracker can validate
// against the same list. Re-exported here because this is where the app has
// always imported it from.
export { STAGES, type Stage } from "@/lib/tracker";

type TrackerContextValue = {
  tracked: TrackerMap;
  wins: WinMap;
  save: (id: string) => void;
  move: (id: string, stage: Stage) => void;
  remove: (id: string) => void;
  isTracked: (id: string) => boolean;
  hasWin: (id: string) => boolean;
  toggleWin: (id: string) => void;
  /** True once this tracker is backed by the signed-in user's account. */
  synced: boolean;
};

type SelectionContextValue = {
  selected: Hackathon | null;
  setSelected: (h: Hackathon | null) => void;
};

// Two contexts so a selection change (opening/closing the detail modal) doesn't
// re-render every tracker consumer (all the deck cards), and vice versa.
const TrackerCtx = createContext<TrackerContextValue | null>(null);
const SelectionCtx = createContext<SelectionContextValue | null>(null);

const LS_KEY = "hackhq-tracker-v1";
const LS_WINS_KEY = "hackhq-wins-v1";
// Set once this browser has offered its local tracker to an account. Without it
// a later visit would re-upload rows the user has since deleted from their
// account, because the import is deliberately additive.
const LS_IMPORTED_KEY = "hackhq-tracker-imported-v1";

/* ---------------------------------------------------------------------------
   Where the tracker lives

   localStorage first, always: it needs no account, and it is what a signed-out
   visitor gets. On mount the provider then asks /api/tracker whether this
   session has somewhere better to put it. Three answers, all of them fine:

     200 { synced: false }  sync isn't configured — stay local
     401                    signed out — stay local
     200 { synced: true }   adopt the account's rows as the truth

   The provider asks the route rather than reading Clerk hooks, because it also
   mounts on deployments with no <ClerkProvider> above it, where those hooks
   throw. Only the third answer switches `synced` on, and only then does a
   change get written through to the server.
--------------------------------------------------------------------------- */

export function HQProvider({ children }: { children: React.ReactNode }) {
  const [tracked, setTracked] = useState<TrackerMap>({});
  const [wins, setWins] = useState<WinMap>({});
  const [selected, setSelected] = useState<Hackathon | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [synced, setSynced] = useState(false);

  // Mirrors of the state above, for the async paths: a rollback needs the value
  // from before its request, and the sync effect must not re-run on every edit.
  // Kept up to date in an effect, and declared before the effects that read
  // them so they are current by the time those run.
  const trackedRef = useRef(tracked);
  const winsRef = useRef(wins);
  const syncedRef = useRef(false);

  useEffect(() => {
    trackedRef.current = tracked;
    winsRef.current = wins;
  }, [tracked, wins]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const rawWins = localStorage.getItem(LS_WINS_KEY);
      // Deliberate post-mount hydration (localStorage is unavailable during
      // SSR); validate the shape rather than trusting any valid JSON.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setTracked(sanitizeTrackerMap(JSON.parse(raw)));
      if (rawWins) setWins(sanitizeWinMap(JSON.parse(rawWins)));
    } catch {
      /* first visit / corrupted - start fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tracked));
      localStorage.setItem(LS_WINS_KEY, JSON.stringify(wins));
    } catch {
      /* private mode - tracker just won't persist */
    }
  }, [tracked, wins, hydrated]);

  // Adopt the account's tracker, handing this browser's over first if it has one
  // and hasn't already. Runs after hydration so there is something to hand over.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/tracker");
        if (!res.ok) return;
        const body = await res.json();
        if (body?.synced !== true) return;

        let entries = parseTrackerEntries(body.entries);

        if (!localStorage.getItem(LS_IMPORTED_KEY)) {
          const local = toTrackerEntries(trackedRef.current, winsRef.current);
          if (local.length > 0) {
            const imported = await fetch("/api/tracker", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entries: local }),
            });
            // A failed handover must not be marked done: setting the flag here
            // would lose these rows for good, and adopting the server's list
            // below would wipe them from this browser too. Stay local instead —
            // the next visit retries the whole handover. (A thrown fetch takes
            // the catch below and bails the same way.)
            if (!imported.ok) return;
            const merged = await imported.json();
            if (merged?.synced !== true) return;
            entries = parseTrackerEntries(merged.entries);
          }
          localStorage.setItem(LS_IMPORTED_KEY, "1");
        }

        if (cancelled) return;
        const next = splitEntries(entries);
        setTracked(next.tracked);
        setWins(next.wins);
        syncedRef.current = true;
        setSynced(true);
      } catch {
        /* offline or blocked - the local tracker carries on */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  /**
   * Write one row through to the account, reverting the optimistic edit if it
   * doesn't land. Reverting is the point: leaving the change on screen would
   * show a save that isn't there, and the next visit would quietly replace it
   * with the server's version.
   */
  const push = useCallback(
    async (request: () => Promise<Response>, rollback: () => void) => {
      if (!syncedRef.current) return;
      try {
        const res = await request();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (error) {
        console.warn("[tracker] could not save to your account:", error);
        rollback();
      }
    },
    [],
  );

  const putRow = useCallback(
    (body: { hackathonId: string; stage?: Stage; isWin?: boolean }) =>
      fetch("/api/tracker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    [],
  );

  /** Restore one id to the stage and win it held before an optimistic edit. */
  const restore = useCallback((id: string, stage?: Stage, won?: boolean) => {
    setTracked((t) => {
      if (!stage) {
        const rest = { ...t };
        delete rest[id];
        return rest;
      }
      return { ...t, [id]: stage };
    });
    setWins((w) => {
      if (won) return { ...w, [id]: true };
      const rest = { ...w };
      delete rest[id];
      return rest;
    });
  }, []);

  const save = useCallback(
    (id: string) => {
      if (trackedRef.current[id]) return;
      setTracked((t) => ({ ...t, [id]: "interested" }));
      void push(
        () => putRow({ hackathonId: id, stage: "interested" }),
        () => restore(id, undefined, false),
      );
    },
    [push, putRow, restore],
  );

  const move = useCallback(
    (id: string, stage: Stage) => {
      const prevStage = trackedRef.current[id];
      const prevWin = winsRef.current[id] === true;
      setTracked((t) => ({ ...t, [id]: stage }));
      void push(
        () => putRow({ hackathonId: id, stage }),
        () => restore(id, prevStage, prevWin),
      );
    },
    [push, putRow, restore],
  );

  const remove = useCallback(
    (id: string) => {
      const prevStage = trackedRef.current[id];
      const prevWin = winsRef.current[id] === true;
      setTracked((t) => {
        const rest = { ...t };
        delete rest[id];
        return rest;
      });
      setWins((w) => {
        const rest = { ...w };
        delete rest[id];
        return rest;
      });
      void push(
        () =>
          fetch(`/api/tracker?hackathonId=${encodeURIComponent(id)}`, {
            method: "DELETE",
          }),
        () => restore(id, prevStage, prevWin),
      );
    },
    [push, restore],
  );

  /**
   * Record or clear a win. Claiming one also moves the hackathon to Going: you
   * cannot win an event you haven't attended, and that keeps the trophy from
   * appearing on something still sitting in Interested.
   */
  const toggleWin = useCallback(
    (id: string) => {
      const prevStage = trackedRef.current[id];
      const won = winsRef.current[id] !== true;

      setWins((w) => {
        if (won) return { ...w, [id]: true };
        const rest = { ...w };
        delete rest[id];
        return rest;
      });
      if (won && prevStage !== "going") {
        setTracked((t) => ({ ...t, [id]: "going" }));
      }

      void push(
        () =>
          putRow({
            hackathonId: id,
            isWin: won,
            ...(won ? { stage: "going" as Stage } : {}),
          }),
        () => restore(id, prevStage, !won),
      );
    },
    [push, putRow, restore],
  );

  const isTracked = useCallback((id: string) => id in tracked, [tracked]);
  const hasWin = useCallback((id: string) => wins[id] === true, [wins]);

  const trackerValue = useMemo(
    () => ({
      tracked,
      wins,
      save,
      move,
      remove,
      isTracked,
      hasWin,
      toggleWin,
      synced,
    }),
    [
      tracked,
      wins,
      save,
      move,
      remove,
      isTracked,
      hasWin,
      toggleWin,
      synced,
    ],
  );
  const selectionValue = useMemo(
    () => ({ selected, setSelected }),
    [selected],
  );

  return (
    <TrackerCtx.Provider value={trackerValue}>
      <SelectionCtx.Provider value={selectionValue}>
        {children}
      </SelectionCtx.Provider>
    </TrackerCtx.Provider>
  );
}

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerCtx);
  if (!ctx) throw new Error("useTracker must be used inside <HQProvider>");
  return ctx;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionCtx);
  if (!ctx) throw new Error("useSelection must be used inside <HQProvider>");
  return ctx;
}
