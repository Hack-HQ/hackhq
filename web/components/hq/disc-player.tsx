"use client";

import { useEffect, useRef, useState } from "react";
// The exact Framer module, vendored byte-for-byte from
// https://framer.com/m/DiscPlayer-mPbY.js@7vFoVOLqCdOhQeAstLq2
// (its `framer` import resolves to components/vendor/framer-shim via
// the turbopack.resolveAlias in next.config.ts)
import FramerDiscPlayer from "@/components/vendor/DiscPlayer";

/**
 * Hack Radio - the exact Framer DiscPlayer docked top-left.
 *
 * The disc plays ONLY the music the user loads themselves:
 * - Until they paste a Spotify link, clicking the record just opens the
 *   panel asking for their music (the click is stopped before it reaches
 *   the component, so the needle stays lifted - no fake playback).
 * - Once their link is loaded, the same click drops the needle, spins the
 *   record, and plays THEIR music through the Spotify embed.
 * - The component's internal demo audio is force-muted, so the only sound
 *   is the user's Spotify.
 */

/**
 * The vendored component drives its needle/spin animations off its own
 * internal <audio> element. We keep that mechanism fully intact (so the
 * visuals behave exactly as authored) but force ITS audio silent + looping.
 * Scoped strictly to the component's default demo file.
 */
const FRAMER_DEMO_MP3 =
  "https://framerusercontent.com/assets/8w3IUatLX9a5JVJ6XPCVuHi94.mp3";

// Intercept only `new Audio(FRAMER_DEMO_MP3)` so the vendored component's demo
// track is silenced (the only sound is the user's Spotify). Runs lazily from
// the component below rather than as a top-level import side effect, and is
// idempotent, so it only takes effect when the disc player is actually used and
// is safe under React's double render.
let demoAudioMuted = false;

function muteFramerDemoAudio() {
  if (demoAudioMuted || typeof window === "undefined") return;
  demoAudioMuted = true;
  const RealAudio = window.Audio;
  const PatchedAudio = function (this: unknown, src?: string) {
    const a = new RealAudio(src);
    if (src === FRAMER_DEMO_MP3) {
      // The demo track must NEVER be heard: silence the element for real
      // and make play() a no-op. ('ended' also never fires, so the needle
      // never lifts mid-session.)
      a.muted = true;
      a.volume = 0;
      a.play = () => Promise.resolve();
    }
    return a;
  } as unknown as typeof Audio;
  PatchedAudio.prototype = RealAudio.prototype;
  window.Audio = PatchedAudio;
}

type SpotifyController = {
  togglePlay: () => void;
  pause: () => void;
  loadUri: (uri: string) => void;
  addListener: (event: string, cb: (e: SpotifyPlaybackEvent) => void) => void;
  destroy?: () => void;
};

type SpotifyPlaybackEvent = { data: { isPaused: boolean; isBuffering: boolean } };

type SpotifyIFrameAPI = {
  createController: (
    el: HTMLElement,
    options: { uri: string; width: string | number; height: string | number },
    cb: (controller: SpotifyController) => void,
  ) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
  }
}

/** The record itself - the component's only element with cursor: pointer. */
function findDisc(wrap: HTMLElement | null): HTMLElement | null {
  if (!wrap) return null;
  for (const d of wrap.querySelectorAll("div")) {
    if (getComputedStyle(d).cursor === "pointer") return d as HTMLElement;
  }
  return null;
}

function parseSpotifyUri(input: string): string | null {
  const trimmed = input.trim();
  if (/^spotify:(track|playlist|album|artist|episode):[A-Za-z0-9]+$/.test(trimmed)) {
    return trimmed;
  }
  const m = trimmed.match(
    /open\.spotify\.com\/(track|playlist|album|artist|episode)\/([A-Za-z0-9]+)/,
  );
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

export function DiscPlayer() {
  // Scope the demo-audio muting to the disc player: patch only when this
  // component is actually rendered, not at module import time.
  muteFramerDemoAudio();

  const [panelOpen, setPanelOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hasMusic, setHasMusic] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const discWrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SpotifyIFrameAPI | null>(null);
  const controllerRef = useRef<SpotifyController | null>(null);
  const aliveRef = useRef(true);

  // Load the Spotify IFrame API once; controllers are created lazily,
  // only when the user loads their own music.
  useEffect(() => {
    aliveRef.current = true;
    window.onSpotifyIframeApiReady = (api) => {
      if (!aliveRef.current) return;
      apiRef.current = api;
    };
    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      aliveRef.current = false;
      script.remove();
      delete window.onSpotifyIframeApiReady;
      controllerRef.current?.destroy?.();
      controllerRef.current = null;
    };
  }, []);

  const createOrLoad = (uri: string) => {
    if (controllerRef.current) {
      controllerRef.current.loadUri(uri);
      setHasMusic(true);
      return;
    }
    const api = apiRef.current;
    const mount = rootRef.current?.querySelector(
      "[data-spotify-mount]",
    ) as HTMLElement | null;
    if (!api || !mount) {
      setLinkError(true);
      return;
    }
    setConnecting(true);
    api.createController(mount, { uri, width: "100%", height: 80 }, (controller) => {
      if (!aliveRef.current) {
        controller.destroy?.();
        return;
      }
      controllerRef.current = controller;
      setConnecting(false);
      setHasMusic(true);
      controller.addListener("playback_update", (e) => {
        if (!aliveRef.current) return;
        setPlaying(!e.data.isPaused);
      });
    });
  };

  // Before the user loads music: block the component's click (needle stays
  // up) and prompt for their music. After: the same click that spins the
  // record also toggles THEIR Spotify.
  const onDiscClickCapture = (e: React.MouseEvent) => {
    const disc = findDisc(discWrapRef.current);
    if (!disc || !disc.contains(e.target as Node)) return; // tonearm etc.
    if (!hasMusic) {
      e.stopPropagation();
      e.preventDefault();
      setPanelOpen(true);
      return;
    }
    controllerRef.current?.togglePlay();
  };

  const loadLink = (e: React.FormEvent) => {
    e.preventDefault();
    const uri = parseSpotifyUri(link);
    if (!uri) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    createOrLoad(uri);
    setLink("");
  };

  return (
    <div
      ref={rootRef}
      className="fixed right-2 top-2 z-[80] hidden flex-col items-end gap-1 sm:flex"
    >
      {/* The exact Framer DiscPlayer - naked disc, no card. Plays only the
          music the user loads. Negative margins offset the component's
          internal 24px padding so the record sits snug in the corner. */}
      <div ref={discWrapRef} onClickCapture={onDiscClickCapture} className="-mr-4 -mt-4">
        <FramerDiscPlayer
          style={{ width: 190, height: 190 }}
          backgroundColor="rgba(0, 0, 0, 0)"
          discColor="#151210"
          needleDotColor="#ed5b29"
        />
      </div>

      {/* Music panel toggle */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="glass-dark flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[9px] font-bold tracking-[0.18em] text-paper transition hover:bg-white/10"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full bg-coral ${playing ? "" : "opacity-60"}`}
        />
        {panelOpen ? "HIDE MUSIC" : hasMusic ? "YOUR MUSIC" : "ADD YOUR MUSIC"}
      </button>

      {/* Music panel - always mounted so the embed keeps playing while
          hidden; visually collapsed when closed */}
      <div
        className={
          panelOpen
            ? "glass-dark w-[19rem] rounded-3xl p-4 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
            : "pointer-events-none invisible h-0 w-[19rem] overflow-hidden opacity-0"
        }
      >
        {!hasMusic && !connecting && (
          <div className="mb-3 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-paper/60">
            PASTE A SPOTIFY LINK. THE DISC PLAYS YOUR MUSIC - NOTHING ELSE.
          </div>
        )}
        <div className="overflow-hidden rounded-xl">
          <div data-spotify-mount />
        </div>
        {connecting && (
          <div className="mt-2 text-center font-mono text-[9px] tracking-[0.2em] text-paper/40">
            LOADING YOUR MUSIC…
          </div>
        )}
        <form onSubmit={loadLink} className="mt-3 flex gap-2">
          <input
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setLinkError(false);
            }}
            placeholder="Paste your Spotify link…"
            className={`min-w-0 flex-1 rounded-lg border bg-ink-deep/50 px-3 py-2 font-mono text-[10px] text-paper outline-none transition placeholder:text-paper/30 ${
              linkError ? "border-coral" : "border-white/15 focus:border-coral"
            }`}
          />
          <button
            type="submit"
            className="rounded-lg bg-paper px-3 py-2 font-mono text-[9px] font-bold tracking-[0.12em] text-ink transition hover:bg-white"
          >
            LOAD
          </button>
        </form>
        <div className="kicker mt-2 text-[8px] text-paper/30">
          Then tap the record to play. Signed into Spotify? Full tracks.
        </div>
      </div>
    </div>
  );
}
