/** Count tracked IDs that still exist in the current hackathon list. */
export function countKnownTracked(
  tracked: Record<string, string>,
  knownIds: Iterable<string>,
): number {
  const known = new Set(knownIds);
  return Object.keys(tracked).filter((id) => known.has(id)).length;
}
