"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Hackathon } from "@/lib/types-hq";
import { STATE_META, countdown } from "@/lib/types-hq";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const GLOBE_VIEW = {
  center: [-72, 33] as [number, number],
  zoom: 1.55,
  pitch: 0,
  bearing: 0,
};

const SECONDS_PER_REVOLUTION = 110;

type GlobeMapProps = {
  /** Already filtered, and already known to have coordinates. */
  hackathons: Hackathon[];
  selected: Hackathon | null;
  onSelect: (h: Hackathon | null) => void;
};

export function GlobeMap({ hackathons, selected, onSelect }: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [zoomedIn, setZoomedIn] = useState(false);
  const hasToken = Boolean(mapboxgl.accessToken);

  // Auto-rotation is owned by the map effect but has to be switchable from the
  // marker effect (a click stops the spin), and the two effects have separate
  // closures — so it lives in refs rather than in either closure.
  const spinRef = useRef(true);
  const interactingRef = useRef(false);
  // The latest onSelect, so the marker effect doesn't have to tear down and
  // rebuild every marker just because the parent re-rendered a new callback.
  // Assigned in an effect, not during render — the markers only read it from an
  // event handler, which always runs after the effect has committed.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /* ---- The map itself: built once ---- */
  useEffect(() => {
    if (!containerRef.current || !hasToken) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    spinRef.current = !reducedMotion;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: "globe",
      center: GLOBE_VIEW.center,
      zoom: GLOBE_VIEW.zoom,
      antialias: true,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("style.load", () => {
      // Ink-and-ember atmosphere - matches the HackHQ palette.
      map.setFog({
        color: "rgb(32, 22, 16)",
        "high-color": "rgb(60, 30, 18)",
        "horizon-blend": 0.04,
        "space-color": "rgb(10, 8, 7)",
        "star-intensity": 0.4,
      });
    });

    function spinGlobe() {
      if (!spinRef.current || interactingRef.current) return;
      const zoom = map.getZoom();
      if (zoom > 4) return;
      let distancePerSecond = 360 / SECONDS_PER_REVOLUTION;
      if (zoom > 2) distancePerSecond *= (4 - zoom) / 2;
      const center = map.getCenter();
      center.lng -= distancePerSecond;
      map.easeTo({ center, duration: 1000, easing: (n) => n });
    }

    const hold = () => (interactingRef.current = true);
    const release = () => {
      interactingRef.current = false;
      spinGlobe();
    };

    map.on("mousedown", hold);
    map.on("touchstart", hold);
    map.on("mouseup", release);
    map.on("touchend", release);
    map.on("dragend", release);
    map.on("moveend", spinGlobe);
    map.on("zoom", () => setZoomedIn(map.getZoom() > 3.2));
    map.on("load", () => {
      setReady(true);
      spinGlobe();
    });

    // Clicking the globe itself (not a marker) dismisses the detail sheet — the
    // "click empty background to deselect" half of #17.
    map.on("click", () => onSelectRef.current(null));

    const globeEl = containerRef.current;
    const restoreSpin = () => {
      spinRef.current = !reducedMotion;
      spinGlobe();
    };
    globeEl.addEventListener("hq:backToGlobe", restoreSpin);

    // Keep the canvas in sync with the container (fonts/CSS can settle after
    // mount, and mapbox only auto-resizes on window resize).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(globeEl);

    return () => {
      ro.disconnect();
      globeEl.removeEventListener("hq:backToGlobe", restoreSpin);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [hasToken]);

  /* ---- Markers: rebuilt whenever the filtered list changes (#18) ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: "hq-popup",
      maxWidth: "280px",
    });

    const markers = hackathons.map((h) => {
      // A button, not a div: markers are the primary way into a hackathon from
      // this page, so they have to be reachable by keyboard (#17). Mapbox gives
      // us a bare element; the semantics are ours to add.
      const el = document.createElement("button");
      el.type = "button";
      el.className = "hq-marker";
      el.dataset.state = h.state;
      el.setAttribute(
        "aria-label",
        `${h.title}, ${h.host}, ${h.location}. ${STATE_META[h.state].label}.`,
      );

      const showPopup = () => {
        const meta = STATE_META[h.state];
        const cd = countdown(h);

        const root = document.createElement("div");

        const statusRow = document.createElement("div");
        statusRow.style.fontFamily = "var(--font-mono)";
        statusRow.style.fontSize = "10px";
        statusRow.style.letterSpacing = "0.22em";
        statusRow.style.color = meta.color;
        statusRow.style.marginBottom = "4px";
        statusRow.textContent = `● ${meta.label}${cd ? ` · ${cd.toUpperCase()}` : ""}`;

        const titleRow = document.createElement("div");
        titleRow.style.fontWeight = "600";
        titleRow.style.fontSize = "14px";
        titleRow.style.lineHeight = "1.25";
        titleRow.textContent = h.title;

        const metaRow = document.createElement("div");
        metaRow.style.fontSize = "12px";
        metaRow.style.color = "#9ba1a5";
        metaRow.style.marginTop = "3px";
        metaRow.textContent = `${h.host} · ${h.location}`;

        root.append(statusRow, titleRow, metaRow);
        popup.setLngLat([h.lng!, h.lat!]).setDOMContent(root).addTo(map);
      };

      const select = (e: Event) => {
        e.stopPropagation(); // don't let the map's background click deselect it
        spinRef.current = false;
        popup.remove();
        onSelectRef.current(h);
      };

      el.addEventListener("mouseenter", showPopup);
      el.addEventListener("focus", showPopup);
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("blur", () => popup.remove());
      el.addEventListener("click", select);

      return new mapboxgl.Marker({ element: el })
        .setLngLat([h.lng!, h.lat!])
        .addTo(map);
    });

    return () => {
      markers.forEach((m) => m.remove());
      popup.remove();
    };
  }, [hackathons, ready]);

  /* ---- Fly to whatever is selected, from a marker or the off-map list ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected || selected.lat === null) return;
    spinRef.current = false;
    map.flyTo({
      center: [selected.lng!, selected.lat!],
      // Stops short of street level: the sheet covers part of the map, and the
      // point is to see WHERE the hackathon is, not which building.
      zoom: 8,
      duration: 2200,
      essential: true,
    });
  }, [selected, ready]);

  const backToGlobe = () => {
    setZoomedIn(false);
    onSelect(null);
    mapRef.current?.flyTo({ ...GLOBE_VIEW, duration: 2400, essential: true });
    containerRef.current?.dispatchEvent(new Event("hq:backToGlobe"));
  };

  return (
    <>
      {hasToken ? (
        <div className="absolute inset-0">
          <div ref={containerRef} className="h-full w-full" />
        </div>
      ) : (
        <TokenFallback />
      )}

      {/* Legibility gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-ink-deep/95 via-ink-deep/40 to-transparent" />

      {zoomedIn && (
        <button
          onClick={backToGlobe}
          // Hidden on mobile while a sheet is open: there, the controls run the
          // full width and this button lands on top of them. Closing the sheet
          // (✕) brings it back. On desktop the sheet starts below it, so both fit.
          className={`glass-dark absolute right-6 top-6 z-10 rounded-full px-5 py-2.5 font-mono text-[11px] tracking-[0.2em] text-paper transition hover:bg-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral sm:right-10 sm:top-9 ${
            selected ? "hidden sm:block" : ""
          }`}
        >
          ← BACK TO GLOBE
        </button>
      )}
    </>
  );
}

function TokenFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(60%_60%_at_50%_40%,#2a1c12_0%,#17130f_55%,#0c0a08_100%)]">
      <div className="relative h-72 w-72 opacity-50 sm:h-96 sm:w-96">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-coral/40"
            style={{ transform: `scaleX(${1 - i * 0.28})` }}
          />
        ))}
        <div className="absolute inset-x-0 top-1/2 h-px bg-coral/40" />
        <div className="absolute inset-x-0 top-1/4 h-px scale-x-90 bg-coral/25" />
        <div className="absolute inset-x-0 top-3/4 h-px scale-x-90 bg-coral/25" />
      </div>
      <div className="glass-dark absolute bottom-1/3 rounded-2xl px-5 py-3 text-center font-mono text-[11px] tracking-[0.15em] text-paper/80">
        SET NEXT_PUBLIC_MAPBOX_TOKEN TO LIGHT UP THE GLOBE
      </div>
    </div>
  );
}
