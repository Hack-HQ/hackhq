"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  STATE_META,
  countdown,
  type HackState,
  type Hackathon,
} from "@/lib/types-hq";
import { GlobeDetailDrawer } from "./globe-detail-drawer";
import { GlobeFilterBar } from "./globe-filter-bar";
import { GlobeVirtualDrawer } from "./globe-virtual-drawer";

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
  const markerRefs = useRef<Map<string, HTMLElement>>(new Map());
  const markerInstances = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const selectedMarkerIdRef = useRef<string | null>(null);
  // Latest close handler, so the map-created "click" listener (bound once in
  // the effect) always calls the current one instead of a stale closure.
  const closeDrawerRef = useRef<() => void>(() => {});
  // Freeze/resume the auto-spin from outside the map effect. The effect owns the
  // wiring; these let the drawer callbacks pause it (marker + virtual paths) and
  // resume it on close.
  const spinEnabledRef = useRef(true);
  const resumeSpinRef = useRef<() => void>(() => {});
  // The "🌐 VIRTUAL" trigger, so a detail opened from the virtual list can hand
  // focus back to it on close (WCAG 2.4.3) — the marker path uses markerRefs.
  const virtualTriggerRef = useRef<HTMLButtonElement>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [selectedHackathon, setSelectedHackathon] = useState<Hackathon | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [activeStatuses, setActiveStatuses] = useState<Set<HackState>>(
    new Set(),
  );
  const [activeFormats, setActiveFormats] = useState<Set<Hackathon["format"]>>(
    new Set(),
  );
  const [virtualOpen, setVirtualOpen] = useState(false);
  const hasToken = Boolean(mapboxgl.accessToken);

  const located = useMemo(
    () => hackathons.filter((h) => h.lat !== null && h.lng !== null),
    [hackathons],
  );

  // Non-virtual listings we could not place. A virtual hackathon isn't missing
  // from the map — it has nowhere to be — so it doesn't count here.
  const unmapped = hackathons.filter(
    (h) => h.format !== "Virtual" && (h.lat === null || h.lng === null),
  ).length;

  // Search + status apply everywhere (map pins and the virtual list). The
  // format pills (In-Person / Hybrid) only narrow the map pins — "Virtual" is
  // not a pin filter, it's the control that opens the online-events drawer.
  const matchesQueryStatus = useCallback(
    (h: Hackathon) => {
      const q = query.toLowerCase().trim();
      const okQuery =
        !q ||
        h.host.toLowerCase().includes(q) ||
        h.title.toLowerCase().includes(q) ||
        h.location.toLowerCase().includes(q);
      const okStatus = activeStatuses.size === 0 || activeStatuses.has(h.state);
      return okQuery && okStatus;
    },
    [query, activeStatuses],
  );

  const visibleIds = useMemo(
    () =>
      new Set(
        located
          .filter(matchesQueryStatus)
          .filter(
            (h) => activeFormats.size === 0 || activeFormats.has(h.format),
          )
          .map((h) => h.id),
      ),
    [located, matchesQueryStatus, activeFormats],
  );

  // Virtual events never get a marker (no coordinates), so they live in a
  // dedicated drawer instead — this is how online-only events stay
  // discoverable. They ignore the pin-only format filters.
  const virtualList = useMemo(
    () => hackathons.filter((h) => h.format === "Virtual" && h.state !== "closed"),
    [hackathons],
  );
  const visibleVirtual = useMemo(
    () => virtualList.filter(matchesQueryStatus),
    [virtualList, matchesQueryStatus],
  );

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
    spinEnabledRef.current = !reducedMotion;

    function spinGlobe() {
      if (!spinEnabledRef.current || userInteracting) return;
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
    popupRef.current = popup;
    const markerMap = markerRefs.current;
    const markerInstanceMap = markerInstances.current;

    function showPopup(h: Hackathon) {
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

      popup
        .setLngLat([h.lng!, h.lat!])
        .setDOMContent(root)
        .addTo(map);
    }

    function openHackathon(h: Hackathon) {
      selectedMarkerIdRef.current = h.id;
      setSelectedHackathon(h);
      setVirtualOpen(false);
      spinEnabledRef.current = false;
      popup.remove();
      // Re-query at click time (not the mount-captured value) so a reduced-motion
      // preference toggled mid-session is honored, matching backToGlobe/closeDrawer.
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      // On small screens the detail card is a bottom sheet, so reserve the
      // lower ~55% of the map with camera padding. flyTo then centers the pin
      // in the remaining upper band, keeping it clear of the card. (offset is
      // unreliable here with the globe projection + large zoom change.)
      const smallScreen = window.matchMedia("(max-width: 767px)").matches;
      map.flyTo({
        center: [h.lng!, h.lat!],
        zoom: 9.5,
        // Respect prefers-reduced-motion: jump instead of a 2.6s fly. (essential:
        // true would otherwise force this animation to play regardless.)
        duration: reduced ? 0 : 2600,
        essential: true,
        padding: smallScreen
          ? {
              top: 0,
              right: 0,
              bottom: Math.round(map.getContainer().clientHeight * 0.55),
              left: 0,
            }
          : { top: 0, right: 0, bottom: 0, left: 0 },
      });
    }

    map.on("click", () => closeDrawerRef.current());

    const markers = located.map((h) => {
      const el = document.createElement("div");
      el.className = "hq-marker";
      el.dataset.state = h.state;
      el.tabIndex = 0;
      // setAttribute, not the el.role / el.ariaLabel IDL props: those only map to
      // the underlying attributes on browsers with ARIA reflection (roughly
      // 2023+), so older engines would announce each pin as an unlabeled generic.
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `Open details for ${h.title} in ${h.location}`,
      );
      markerMap.set(h.id, el);

      el.addEventListener("mouseenter", () => showPopup(h));
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("focus", () => showPopup(h));
      el.addEventListener("blur", () => popup.remove());
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openHackathon(h);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        openHackathon(h);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([h.lng!, h.lat!])
        .addTo(map);
      markerInstanceMap.set(h.id, marker);
      return marker;
    });

    const restoreSpin = () => {
      spinEnabledRef.current = !reducedMotion;
      spinGlobe();
    };
    resumeSpinRef.current = restoreSpin;
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
      markerMap.clear();
      markerInstanceMap.clear();
      popup.remove();
      popupRef.current = null;
      resumeSpinRef.current = () => {};
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  const backToGlobe = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const markerId = selectedMarkerIdRef.current;
    setZoomedIn(false);
    setSelectedHackathon(null);
    selectedMarkerIdRef.current = null;
    mapRef.current?.flyTo({
      ...GLOBE_VIEW,
      duration: reduced ? 0 : 2400,
      essential: true,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    containerRef.current?.dispatchEvent(new Event("hq:backToGlobe"));
    // The Back-to-globe button unmounts with zoomedIn, so return focus to the
    // pin that started the fly-in instead of letting it drop to <body>.
    if (markerId) {
      window.requestAnimationFrame(() => {
        markerRefs.current.get(markerId)?.focus({ preventScroll: true });
      });
    }
  };

  // Close the detail card. Both entry points (marker fly-in and virtual list)
  // route here, and focus always returns to whatever opened it (WCAG 2.4.3).
  const closeDrawer = useCallback(() => {
    const markerId = selectedMarkerIdRef.current;
    selectedMarkerIdRef.current = null;
    setSelectedHackathon(null);
    if (markerId) {
      // Marker path: opening flew the camera in and (on mobile) reserved a 55%
      // bottom padding so the pin cleared the bottom sheet. Clear it on close so
      // the pin recenters and later manual zoom/pan isn't thrown off, then hand
      // focus back to the pin that opened the card.
      const map = mapRef.current;
      if (map) {
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        map.easeTo({
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          duration: reduced ? 0 : 300,
          essential: true,
        });
      }
      window.requestAnimationFrame(() => {
        markerRefs.current.get(markerId)?.focus({ preventScroll: true });
      });
      return;
    }
    // Virtual path: no pin and no camera padding was set. Resume the auto-spin
    // the virtual flow paused, and return focus to the 🌐 VIRTUAL trigger, which
    // reappears in the filter bar once the detail closes.
    resumeSpinRef.current();
    window.requestAnimationFrame(() => {
      virtualTriggerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  // The virtual drawer's own onClose. Stable identity (useCallback) so the
  // drawer's [open, onClose] focus effect doesn't tear down and re-run on every
  // parent re-render — otherwise typing in the filter search would yank focus
  // out of the input after every keystroke.
  const closeVirtual = useCallback(() => {
    setVirtualOpen(false);
    resumeSpinRef.current();
  }, []);

  // Background map click: dismiss whichever drawer is open, and nothing else.
  // Clicking the bare globe must not start a camera move — that would stutter
  // the auto-spin.
  const dismissActive = useCallback(() => {
    if (selectedHackathon) closeDrawer();
    else if (virtualOpen) closeVirtual();
  }, [selectedHackathon, virtualOpen, closeDrawer, closeVirtual]);

  // The map's "click" listener is bound once in the effect; keep the ref it
  // calls pointed at the latest dismiss handler.
  useEffect(() => {
    closeDrawerRef.current = dismissActive;
  }, [dismissActive]);

  // Show/hide markers live as filters change. The creation effect binds markers
  // once; here we just add/remove each instance from the map by the visible set.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerInstances.current.forEach((marker, id) => {
      if (visibleIds.has(id)) marker.addTo(map);
      else marker.remove();
    });
    // A tooltip could be pinned to a marker we just hid.
    popupRef.current?.remove();
    // If the selected pin is no longer in the visible set, dismiss its detail so
    // the drawer never describes a hidden pin. Filters can't change while a
    // detail is open (the bar is hidden then), so this fires only when the
    // `hackathons` data itself changes underneath an open card — defensive, but
    // cheap.
    const selId = selectedMarkerIdRef.current;
    if (selId && !visibleIds.has(selId)) closeDrawer();
  }, [visibleIds, closeDrawer]);

  const toggleStatus = useCallback((s: HackState) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const toggleFormat = useCallback((f: Hackathon["format"]) => {
    setActiveFormats((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setQuery("");
    setActiveStatuses(new Set());
    setActiveFormats(new Set());
  }, []);

  // Opening the virtual list closes any open detail (they share the same slot),
  // and vice versa, so at most one drawer is ever visible. Freeze the spin so
  // the globe holds still behind the reading surface, matching a marker detail.
  const openVirtualList = useCallback(() => {
    selectedMarkerIdRef.current = null;
    setSelectedHackathon(null);
    setVirtualOpen(true);
    spinEnabledRef.current = false;
  }, []);

  // Virtual events have no coordinates, so they must NOT go through the marker
  // fly-in path (which would fly to [null, null]). Just open the detail drawer,
  // keeping the spin frozen behind it (closeDrawer resumes it).
  const openVirtual = useCallback((h: Hackathon) => {
    selectedMarkerIdRef.current = null;
    setVirtualOpen(false);
    setSelectedHackathon(h);
    spinEnabledRef.current = false;
  }, []);

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

        {/* Browsing tools - search + status/format filters + virtual list.
            Hidden while a detail drawer is open or the camera is zoomed in, so
            it never fights the detail card or the Back-to-globe button. */}
        {hasToken && !selectedHackathon && !zoomedIn && (
          <GlobeFilterBar
            query={query}
            onQueryChange={setQuery}
            activeStatuses={activeStatuses}
            onToggleStatus={toggleStatus}
            activeFormats={activeFormats}
            onToggleFormat={toggleFormat}
            virtualCount={visibleVirtual.length}
            virtualButtonRef={virtualTriggerRef}
            onOpenVirtual={openVirtualList}
            onClearAll={clearAll}
          />
        )}

        {/* Back-to-globe (after a marker fly-in) */}
        {zoomedIn && (
          <button
            onClick={backToGlobe}
            className="glass-dark absolute right-6 top-6 z-20 rounded-full px-5 py-2.5 font-mono text-[11px] tracking-[0.2em] text-paper transition hover:bg-ink/80 sm:right-10 sm:top-9"
          >
            ← BACK TO GLOBE
          </button>
        )}

        <GlobeDetailDrawer
          hackathon={selectedHackathon}
          onClose={closeDrawer}
        />

        <GlobeVirtualDrawer
          open={virtualOpen}
          hackathons={visibleVirtual}
          onClose={closeVirtual}
          onSelect={openVirtual}
        />

        {/* Page title overlay - bottom-left */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <div className="kicker text-coral">Pillar 01 · Explore</div>
          <h1 className="display mt-3 text-[clamp(1.8rem,4.5vw,3.6rem)] text-paper">
            The globe
          </h1>
          {unmapped > 0 && (
            // The globe can only show what it has coordinates for. Say so out
            // loud rather than quietly rendering an incomplete map (#111).
            //
            // Deliberately does not state WHY a listing is missing. The cause is
            // either "no venue announced yet" (TBA) or "we failed to place a real
            // city" — and this component cannot tell them apart. Naming the first
            // cause would tell visitors a hackathon has no venue when it may
            // simply be one we haven't geocoded.
            <p className="mt-3 font-mono text-[11px] tracking-[0.12em] text-paper/50">
              {unmapped} {unmapped === 1 ? "hackathon is" : "hackathons are"} not on
              the map yet. Find {unmapped === 1 ? "it" : "them"} in the deck.
            </p>
          )}
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
