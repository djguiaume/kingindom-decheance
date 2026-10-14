/** View-only choices shared by the scene and its regression tests. */
export function projectileFrame(source: string): 'arrow' | 'bolt' | 'ballista_bolt' | 'boulder' {
  switch (source) {
    case 'catapult':
      return 'boulder';
    case 'crossbowman':
      return 'bolt';
    case 'ballista_tower':
      return 'ballista_bolt';
    default:
      return 'arrow';
  }
}

/** Destroyed buildings still occupy their plot; their ruin replaces the empty foundation. */
export function emptyPlotIds(
  slots: readonly string[],
  buildings: readonly { slot: string }[],
): Set<string> {
  const occupied = new Set(buildings.map((b) => b.slot));
  return new Set(slots.filter((id) => !occupied.has(id)));
}
