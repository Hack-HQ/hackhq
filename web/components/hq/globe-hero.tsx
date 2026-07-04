"use client";

import { useEffect, useRef } from "react";

export function GlobeHero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videoRef.current?.pause();
    }
  }, []);

  return (
    <section id="globe" className="p-2">
      <div className="shell bg-ink h-[min(94vh,1000px)] min-h-[640px]">
        {/* Opening animation from the RedNote Red Hackathon Summit */}
        <div className="absolute inset-0">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            src="/rednote-summit-opening.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        </div>

        {/* Legibility gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-ink-deep/95 via-ink-deep/40 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink-deep/80 to-transparent" />

        {/* Wordmark overlay - official HACKHQ title, bottom-left */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hackhq-wordmark.svg"
              alt="HackHQ"
              className="w-full max-w-[1150px]"
            />
          </h1>
        </div>

      </div>
    </section>
  );
}
