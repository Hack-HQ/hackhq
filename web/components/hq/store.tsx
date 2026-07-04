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

type HQContext = {
  tracked: TrackerMap;
  save: (id: string) => void;
  move: (id: string, stage: Stage) => void;
  remove: (id: string) => void;
  isTracked: (id: string) => boolean;
  selected: Hackathon | null;
  setSelected: (h: Hackathon | null) => void;
};

const Ctx = createContext<HQContext | null>(null);

const LS_KEY = "hackhq-tracker-v1";

export function HQProvider({ children }: { children: React.ReactNode }) {
  const [tracked, setTracked] = useState<TrackerMap>({});
  const [selected, setSelected] = useState<Hackathon | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setTracked(JSON.parse(raw));
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
        const { [id]: _, ...rest } = t;
        return rest;
      }),
    [],
  );
  const isTracked = useCallback((id: string) => id in tracked, [tracked]);

  const value = useMemo(
    () => ({ tracked, save, move, remove, isTracked, selected, setSelected }),
    [tracked, save, move, remove, isTracked, selected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHQ(): HQContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHQ must be used inside <HQProvider>");
  return ctx;
}
