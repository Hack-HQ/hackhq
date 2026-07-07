// Shared body scroll-lock with reference counting. Multiple overlays (the
// preloader curtain, the detail modal) can request a lock at once; the body
// only scrolls again once every holder has released. This avoids the race
// where one overlay's cleanup re-enables scrolling while another still needs
// it locked.
let locks = 0;
let previousOverflow = "";

export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (locks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}
