import { describe, expect, it } from "vitest";
import {
  SECONDS_PER_REVOLUTION,
  SPIN_MAX_ZOOM,
  WHEEL_IDLE_MS,
  createCameraInteraction,
  spinDegrees,
} from "./globe-spin";

const FULL_RATE = 360 / SECONDS_PER_REVOLUTION;

describe("spinDegrees", () => {
  it("spins at the full rate while the globe is still a globe", () => {
    expect(spinDegrees(1.55)).toBeCloseTo(FULL_RATE);
  });

  it("holds the globe still once the camera is zoomed past the cutoff", () => {
    expect(spinDegrees(SPIN_MAX_ZOOM + 0.01)).toBeNull();
    expect(spinDegrees(9.5)).toBeNull();
  });

  it("tapers to a standstill as the camera approaches the cutoff", () => {
    // Half-way through the taper band, half the rate.
    expect(spinDegrees(3)).toBeCloseTo(FULL_RATE / 2);
    expect(spinDegrees(SPIN_MAX_ZOOM)).toBeCloseTo(0);
  });

  it("never speeds up as the camera zooms in", () => {
    const rates = [1, 1.55, 2, 2.5, 3, 3.5, SPIN_MAX_ZOOM].map(
      (z) => spinDegrees(z) ?? Number.NaN,
    );
    rates.reduce((previous, rate) => {
      expect(rate).toBeLessThanOrEqual(previous);
      return rate;
    });
  });
});

describe("createCameraInteraction", () => {
  it("reports the camera as idle before any input", () => {
    expect(createCameraInteraction().isInteracting(0)).toBe(false);
  });

  it("treats a held pointer as interaction until it is released", () => {
    const input = createCameraInteraction();
    input.pointerDown();
    expect(input.isInteracting(0)).toBe(true);
    input.pointerUp();
    expect(input.isInteracting(0)).toBe(false);
  });

  // The regression this module exists for. Scroll/trackpad zoom fires neither
  // mousedown nor touchstart, so the auto-spin never knew the user had taken the
  // camera — it kept re-arming a 1s easeTo on every moveend and fought the zoom.
  it("treats wheel zoom as interaction", () => {
    const input = createCameraInteraction();
    input.wheel(1000);
    expect(input.isInteracting(1000)).toBe(true);
  });

  it("keeps the camera reserved until the wheel has gone quiet", () => {
    const input = createCameraInteraction();
    input.wheel(1000);
    expect(input.isInteracting(1000 + WHEEL_IDLE_MS - 1)).toBe(true);
    expect(input.isInteracting(1000 + WHEEL_IDLE_MS)).toBe(false);
  });

  it("lets a later wheel tick extend the quiet window", () => {
    const input = createCameraInteraction();
    input.wheel(1000);
    input.wheel(1400);
    // Past the first tick's window, still inside the second's.
    expect(input.isInteracting(1000 + WHEEL_IDLE_MS + 1)).toBe(true);
    expect(input.isInteracting(1400 + WHEEL_IDLE_MS)).toBe(false);
  });

  it("keeps a held pointer interacting long after the wheel window lapses", () => {
    const input = createCameraInteraction();
    input.pointerDown();
    input.wheel(0);
    expect(input.isInteracting(10_000)).toBe(true);
  });

  it("stays reserved after pointer release while the wheel is still warm", () => {
    // Trackpads emit wheel with no pointer at all; releasing a drag must not
    // hand the camera back mid-scroll.
    const input = createCameraInteraction();
    input.pointerDown();
    input.wheel(1000);
    input.pointerUp();
    expect(input.isInteracting(1100)).toBe(true);
  });
});
