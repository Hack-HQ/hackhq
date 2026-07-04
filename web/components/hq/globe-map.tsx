"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Hackathon } from "@/lib/types-hq";
import { STATE_META, countdown } from "@/lib/types-hq";
import { useHQ } from "./store";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const GLOBE_VIEW = {
  center: [-72, 33] as [number, number],
  zoom: 1.55,
  pitch: 0,
  bearing: 0,
};

const SECONDS_PER_REVOLUTION = 110;

export function GlobeMap({ hackathons }: { hackathons: Hackathon[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { setSelected } = useHQ();
  const [zoomedIn, setZoomedIn] = useState(false);
  const hasToken = Boolean(mapboxgl.accessToken);

  const located = hackathons.filter((h) => h.lat !== null && h.lng !== null);

  useEffect(() => {
    if (!containerRef.current || !hasToken) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

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

    // - Auto-rotate (pause while the user is interacting) -
    let userInteracting = false;
    let spinEnabled = !reducedMotion;

    function spinGlobe() {
      if (!spinEnabled || userInteracting) return;
      const zoom = map.getZoom();
      if (zoom > 4) return;
      let distancePerSecond = 360 / SECONDS_PER_REVOLUTION;
      if (zoom > 2) distancePerSecond *= (4 - zoom) / 2;
      const center = map.getCenter();
      center.lng -= distancePerSecond;
      map.easeTo({ center, duration: 1000, easing: (n) => n });
    }

    map.on("mousedown", () => (userInteracting = true));
    map.on("touchstart", () => (userInteracting = true));
    map.on("mouseup", () => {
      userInteracting = false;
      spinGlobe();
    });
    map.on("touchend", () => {
      userInteracting = false;
      spinGlobe();
    });
    map.on("dragend", () => {
      userInteracting = false;
      spinGlobe();
    });
    map.on("moveend", spinGlobe);
    map.on("zoom", () => setZoomedIn(map.getZoom() > 3.2));
    map.on("load", spinGlobe);

    // - Markers + shared hover popup -
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: "hq-popup",
      maxWidth: "280px",
    });

    const markers = located.map((h) => {
      const el = document.createElement("div");
      el.className = "hq-marker";
      el.dataset.state = h.state;

      el.addEventListener("mouseenter", () => {
        const meta = STATE_META[h.state];
        const cd = countdown(h);
        popup
          .setLngLat([h.lng!, h.lat!])
          .setHTML(
            `<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.22em;color:${meta.color};margin-bottom:4px;">● ${meta.label}${cd ? ` · ${cd.toUpperCase()}` : ""}</div>
             <div style="font-weight:600;font-size:14px;line-height:1.25;">${h.title}</div>
             <div style="font-size:12px;color:#9ba1a5;margin-top:3px;">${h.host} · ${h.location}</div>`,
          )
          .addTo(map);
      });
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        spinEnabled = false;
        popup.remove();
        map.flyTo({
          center: [h.lng!, h.lat!],
          zoom: 9.5,
          duration: 2600,
          essential: true,
        });
        setSelected(h);
      });

      return new mapboxgl.Marker({ element: el })
        .setLngLat([h.lng!, h.lat!])
        .addTo(map);
    });

    const restoreSpin = () => {
      spinEnabled = !reducedMotion;
      spinGlobe();
    };
    const globeEl = containerRef.current;
    globeEl.addEventListener("hq:backToGlobe", restoreSpin);

    // Keep the canvas in sync with the container (fonts/CSS can settle after
    // mount, and mapbox only auto-resizes on window resize).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(globeEl);

    return () => {
      ro.disconnect();
      globeEl.removeEventListener("hq:backToGlobe", restoreSpin);
      markers.forEach((m) => m.remove());
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  const backToGlobe = () => {
    setZoomedIn(false);
    mapRef.current?.flyTo({ ...GLOBE_VIEW, duration: 2400, essential: true });
    containerRef.current?.dispatchEvent(new Event("hq:backToGlobe"));
  };

  return (
    <section id="globe" className="p-2 pt-0">
      <div className="shell bg-ink h-[min(86vh,1000px)] min-h-[560px]">
        {/* Map canvas - wrapper owns positioning because mapbox-gl forces
            `position: relative` on the container element itself */}
        {hasToken ? (
          <div className="absolute inset-0">
            <div ref={containerRef} className="h-full w-full" />
          </div>
        ) : (
          <TokenFallback />
        )}

        {/* Legibility gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-ink-deep/95 via-ink-deep/40 to-transparent" />

        {/* Back-to-globe (after a marker fly-in) */}
        {zoomedIn && (
          <button
            onClick={backToGlobe}
            className="glass-dark absolute right-6 top-6 z-10 rounded-full px-5 py-2.5 font-mono text-[11px] tracking-[0.2em] text-paper transition hover:bg-ink/80 sm:right-10 sm:top-9"
          >
            ← BACK TO GLOBE
          </button>
        )}

        {/* Page title overlay - bottom-left */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <div className="kicker text-coral">Pillar 01 · Explore</div>
          <h1 className="display mt-3 text-[clamp(1.8rem,4.5vw,3.6rem)] text-paper">
            The globe
          </h1>
        </div>
      </div>
    </section>
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
