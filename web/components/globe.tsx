"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Status } from "@/lib/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Status → marker color. Tweak to taste / match the legend.
const STATUS_COLORS: Record<Status, string> = {
  OPEN: "#10b981", // emerald
  CLOSING_SOON: "#f97316", // orange
  OPENS_SOON: "#3b82f6", // blue
  CLOSED: "#71717a", // zinc
};

// Grayscale look for the globe; cleared (full color) once focused on a city.
const GLOBE_FILTER = "grayscale(1) contrast(1.05) brightness(1.05)";

// The zoomed-out globe the experience starts on.
const GLOBE_VIEW = {
  center: [-30, 30] as [number, number],
  zoom: 1.4,
  pitch: 0,
  bearing: 0,
};

export type GlobePoint = {
  id: string;
  title: string;
  status: Status;
  lng: number;
  lat: number;
};

// A few hardcoded points just to confirm the token + markers render.
// Real data (geocoded from each opportunity's `location`) replaces this later.
const SAMPLE_POINTS: GlobePoint[] = [
  { id: "nyc", title: "Healthcare Hack NYC", status: "OPEN", lng: -74.006, lat: 40.7128 },
  { id: "sf", title: "Abridge x Anthropic", status: "CLOSING_SOON", lng: -122.4194, lat: 37.7749 },
  { id: "ldn", title: "Sample · London", status: "OPENS_SOON", lng: -0.1276, lat: 51.5072 },
  { id: "tok", title: "Sample · Tokyo", status: "CLOSED", lng: 139.6917, lat: 35.6895 },
];

export function Globe({
  points = SAMPLE_POINTS,
  heightClass = "h-[70vh]",
  rounded = true,
}: {
  points?: GlobePoint[];
  heightClass?: string;
  rounded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [focused, setFocused] = useState<GlobePoint | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapboxgl.accessToken) {
      console.warn("[Globe] NEXT_PUBLIC_MAPBOX_TOKEN is not set.");
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      // Standard style: 3D globe when zoomed out, 3D buildings when zoomed in.
      style: "mapbox://styles/mapbox/standard",
      projection: "globe",
      center: GLOBE_VIEW.center,
      zoom: GLOBE_VIEW.zoom,
      antialias: true,
    });
    mapRef.current = map;

    map.on("style.load", () => {
      // Dark/night lighting (glowing labels, dark building mass).
      map.setConfigProperty("basemap", "lightPreset", "night");
      // Black & white globe: desaturate the map tiles (markers stay colored).
      // Color smoothly returns when flying into a city (toggled below).
      const canvas = map.getCanvas();
      canvas.style.transition = "filter 1.8s ease";
      canvas.style.filter = GLOBE_FILTER;
    });

    // Drop a colored, clickable marker per point.
    const markers = points.map((p) => {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "9999px";
      el.style.background = STATUS_COLORS[p.status];
      el.style.border = "2px solid rgba(255,255,255,0.9)";
      el.style.boxShadow = `0 0 0 4px ${STATUS_COLORS[p.status]}40, 0 0 10px rgba(0,0,0,0.5)`;
      el.style.cursor = "pointer";
      el.style.transition = "transform 0.15s ease";
      el.title = p.title;
      el.addEventListener("mouseenter", () => (el.style.transform = "scale(1.35)"));
      el.addEventListener("mouseleave", () => (el.style.transform = "scale(1)"));

      // Click a circle → fly from the globe down into the 3D city view.
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setFocused(p);
        map.flyTo({
          center: [p.lng, p.lat],
          zoom: 16.5, // street level: 3D buildings appear
          pitch: 62, // tilt for the 3D angle
          bearing: -20,
          duration: 4500, // cinematic globe → city descent
          essential: true,
        });
      });

      return new mapboxgl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
    });

    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  // Grayscale on the globe, full color when focused on a city.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    canvas.style.filter = focused ? "none" : GLOBE_FILTER;
  }, [focused]);

  // Fly back out to the whole globe.
  const backToGlobe = () => {
    setFocused(null);
    mapRef.current?.flyTo({ ...GLOBE_VIEW, duration: 3500, essential: true });
  };

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className={`${heightClass} w-full ${rounded ? "rounded-xl" : ""}`}
      />

      {focused && (
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3">
          <button
            onClick={backToGlobe}
            className="pointer-events-auto rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur hover:bg-black/85"
          >
            ← Back to globe
          </button>
          <span className="pointer-events-none rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-zinc-100 backdrop-blur">
            {focused.title}
          </span>
        </div>
      )}
    </div>
  );
}
