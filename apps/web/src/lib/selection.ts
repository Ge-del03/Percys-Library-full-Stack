export function pruneSelectionToVisible(selected: Iterable<string>, visibleIds: Iterable<string>): Set<string> {
  const visible = new Set(visibleIds);
  return new Set(Array.from(selected).filter((id) => visible.has(id)));
}