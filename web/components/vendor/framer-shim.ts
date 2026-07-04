/**
 * Minimal shim for the `framer` package so vendored Framer modules
 * (components/vendor/*.js) run outside Framer. Only the APIs the
 * DiscPlayer module touches are provided.
 */

export function addPropertyControls(): void {
  /* design-tool metadata — no-op outside Framer */
}

export const ControlType = {
  File: "file",
  Color: "color",
  ResponsiveImage: "responsiveimage",
  Enum: "enum",
  Boolean: "boolean",
  Number: "number",
  String: "string",
} as const;

export function useIsStaticRenderer(): boolean {
  return false;
}
