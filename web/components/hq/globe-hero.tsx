"use client";

import { useEffect, useRef } from "react";

export function GlobeHero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const video = videoRef.current;
    if (!video) return;
    if (reduce) {
      video.pause();
      return;
    }
    video.play().catch(() => {});
  }, []);

  return (
    <section id="globe" className="p-2">
      <div className="shell bg-ink h-[min(94vh,1000px)] min-h-[640px]">
        {/* Opening animation from the RedNote Red Hackathon Summit.

            Two encodes of the same master: browsers that decode AV1 (Chrome,
            Firefox, Edge, Safari on M3+/A17+) pick the 4K UHD source; everyone
            else falls through to the original 1080p H.264. The codecs param on
            the first <source> is what makes non-AV1 browsers skip it without
            fetching a byte. The UHD file is 1440p AV1 *8-bit* (12 MiB). It
            was 4K 10-bit, which froze: 10-bit AV1 has almost no hardware
            decode support, so browsers advertised support, picked it, then
            software-decoded 8.3 MP/frame and could not keep up. 8-bit at
            1440p halves the pixel rate and restores the hardware path. Well
            under Cloudflare Workers' 25 MiB static-asset cap - a separate
            limit from the 3 MiB Worker *script* cap, which never bound this
            (see b29f06f). */}
        <div className="absolute inset-0">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            poster="/rednote-summit-poster.jpg"
            muted
            loop
            playsInline
            preload="auto"
          >
            <source
              src="/rednote-summit-opening-4k.mp4"
              type='video/mp4; codecs="av01.0.12M.08"'
            />
            <source src="/rednote-summit-opening.mp4" type="video/mp4" />
          </video>
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
