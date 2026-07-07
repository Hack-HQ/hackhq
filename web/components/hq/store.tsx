"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Hackathon } from "@/lib/types-hq";

export type Stage = "interested" | "applied" | "accepted" | "going";

export const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "interested", label: "Interested", color: "#17b26a" },
  { id: "applied", label: "Applied", color: "#f5a623" },
  { id: "accepted", label: "Accepted", color: "#3b6bf0" },
  { id: "going", label: "Going", color: "#ed5b29" },
];

type TrackerMap = Record<string, Stage>;

const STAGE_IDS = new Set<string>(STAGES.map((s) => s.id));

/**
 * Coerce an untrusted parsed localStorage value into a clean TrackerMap:
 * keep only string ids mapped to a known Stage, drop everything else. Guards
 * against a valid-JSON-but-wrong-shape payload being cast blindly.
 */
function sanitizeTrackerMap(value: unknown): TrackerMap {
  if (!value || typeof value !== "object") return {};
  const out: TrackerMap = {};
  for (const [id, stage] of Object.entries(value as Record<string, unknown>)) {
    if (typeof stage === "string" && STAGE_IDS.has(stage)) {
      out[id] = stage as Stage;
    }
  }
  return out;
}

type TrackerContextValue = {
  tracked: TrackerMap;
  save: (id: string) => void;
  move: (id: string, stage: Stage) => void;
  remove: (id: string) => void;
  isTracked: (id: string) => boolean;
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

export function HQProvider({ children }: { children: React.ReactNode }) {
  const [tracked, setTracked] = useState<TrackerMap>({});
  const [selected, setSelected] = useState<Hackathon | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      // Deliberate post-mount hydration (localStorage is unavailable during
      // SSR); validate the shape rather than trusting any valid JSON.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setTracked(sanitizeTrackerMap(JSON.parse(raw)));
    } catch {
      /* first visit / corrupted - start fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tracked));
    } catch {
      /* private mode - tracker just won't persist */
    }
  }, [tracked, hydrated]);

  const save = useCallback(
    (id: string) =>
      setTracked((t) => (t[id] ? t : { ...t, [id]: "interested" })),
    [],
  );
  const move = useCallback(
    (id: string, stage: Stage) => setTracked((t) => ({ ...t, [id]: stage })),
    [],
  );
  const remove = useCallback(
    (id: string) =>
      setTracked((t) => {
        const rest = { ...t };
        delete rest[id];
        return rest;
      }),
    [],
  );
  const isTracked = useCallback((id: string) => id in tracked, [tracked]);

  const trackerValue = useMemo(
    () => ({ tracked, save, move, remove, isTracked }),
    [tracked, save, move, remove, isTracked],
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
