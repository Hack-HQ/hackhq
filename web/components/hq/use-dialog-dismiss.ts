import { useEffect, type RefObject } from "react";

type UseDialogDismissOptions<T extends HTMLElement> = {
  /** Focused when the dialog opens — usually the close button. */
  initialFocusRef: RefObject<T | null>;
  /**
   * Restore focus to whatever held it before opening, on close. Leave off when
   * an outer owner returns focus itself (e.g. the globe detail drawer, whose
   * opener in globe-map points focus back at the map pin / VIRTUAL trigger).
   */
  restoreFocus?: boolean;
};

/**
 * The shared "non-modal dismiss" behaviour for the globe drawers: while open,
 * Escape closes and focus moves to `initialFocusRef`; on close, focus optionally
 * returns to the opener (WCAG 2.4.3). Deliberately minimal — no focus trap and
 * no scroll lock, because these drawers leave the map interactive behind them.
 *
 * `onClose` must be stable (useCallback) — an unstable identity re-runs this
 * effect on every parent render, and the restore-focus cleanup would then yank
 * focus out of whatever the user is doing (e.g. typing in the filter search).
 */
export function useDialogDismiss<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  { initialFocusRef, restoreFocus = false }: UseDialogDismissOptions<T>,
) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      restoreFocus && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, onClose, initialFocusRef, restoreFocus]);
}
