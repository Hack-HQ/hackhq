// Auto-spin arithmetic and camera-ownership tracking for the globe.
//
// This lives outside the component because the bug it exists to prevent is a
// *decision* bug, not a rendering one: the spin used to re-arm itself while the
// user was mid-scroll, so every wheel tick spawned a fresh 1s rotation that
// fought the zoom. That logic was buried in a useEffect closure where nothing
// could test it. It is pure and time-injected here so it can be.

export const SECONDS_PER_REVOLUTION = 110;

/** Above this zoom the globe reads as a map, so it holds still. */
export const SPIN_MAX_ZOOM = 4;

/** Where the spin starts easing off toward the cutoff. */
export const SPIN_TAPER_ZOOM = 2;

/**
 * How long after the last wheel tick the camera stays reserved for the user.
 * `wheel` has no end event — unlike mouse/touch, nothing tells us the gesture
 * finished — so quiet time is the only available signal.
 */
export const WHEEL_IDLE_MS = 500;

/** Zoom past which the browsing chrome gives way to the Back-to-globe button. */
export const ZOOMED_IN_ZOOM = 3.2;

/**
 * Degrees of longitude the globe should advance for one spin step at `zoom`,
 * or `null` when it should not spin at all.
 */
export function spinDegrees(zoom: number): number | null {
  // Inclusive: at the cutoff the taper already yields zero degrees, and a
  // zero-degree step is not "no spin" to the caller — it still runs a 1s easeTo
  // to the same centre, whose moveend re-arms the next one. Saying null ends
  // the chain instead of leaving a no-op animation looping at this zoom.
  if (zoom >= SPIN_MAX_ZOOM) return null;
  const full = 360 / SECONDS_PER_REVOLUTION;
  if (zoom <= SPIN_TAPER_ZOOM) return full;
  return full * ((SPIN_MAX_ZOOM - zoom) / SPIN_TAPER_ZOOM);
}

/**
 * All `now` values are milliseconds from a *monotonic* clock — pass
 * `performance.now()`, not `Date.now()`. A backwards wall-clock step would make
 * the wheel window look freshly opened forever, and since only a timer resumes
 * the spin, the globe would stop rotating with nothing to restart it.
 */
export type CameraInteraction = {
  /** mousedown / touchstart — the user has grabbed the camera. */
  pointerDown(): void;
  /** mouseup / touchend / dragend — the grab ended. */
  pointerUp(): void;
  /** A wheel tick at `now`. */
  wheel(now: number): void;
  /**
   * The wheel gesture is over — call this from the idle timer that the `wheel`
   * ticks keep resetting.
   *
   * Releasing the camera has to be an explicit statement rather than something
   * `isInteracting` re-derives from the clock. The resume is the only thing
   * scheduled after the last tick, so if it were to consult the clock and find
   * itself a fraction of a millisecond early, it would decline and leave
   * nothing behind to try again — the spin would stop for good.
   */
  wheelEnded(): void;
  /** Whether the user owns the camera at `now`. */
  isInteracting(now: number): boolean;
};

export function createCameraInteraction(
  wheelIdleMs: number = WHEEL_IDLE_MS,
): CameraInteraction {
  let pointerHeld = false;
  let lastWheel: number | null = null;

  return {
    pointerDown() {
      pointerHeld = true;
    },
    pointerUp() {
      pointerHeld = false;
    },
    wheel(now: number) {
      lastWheel = now;
    },
    wheelEnded() {
      lastWheel = null;
    },
    isInteracting(now: number) {
      if (pointerHeld) return true;
      if (lastWheel === null) return false;
      return now - lastWheel < wheelIdleMs;
    },
  };
}
