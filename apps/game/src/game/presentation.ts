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

/**
 * The art a destroyed building shows: its own ruin, so a ruined tower still reads as a tower,
 * else the shared ruin, else null (the scene then fades the intact building).
 */
export function ruinFrame(type: string, has: (frame: string) => boolean): string | null {
  if (has(`ruin_${type}`)) return `ruin_${type}`;
  return has('ruin') ? 'ruin' : null;
}

/** Friendly proximity opens the gate from either side, independent of its lane orientation. */
export function gateIsOpen(
  at: { x: number; y: number },
  destroyed: boolean,
  king: { alive: boolean; pos: { x: number; y: number } },
  units: readonly { pos: { x: number; y: number } }[],
): boolean {
  const near = (p: { x: number; y: number }, radius: number) =>
    (p.x - at.x) ** 2 + (p.y - at.y) ** 2 < radius * radius;
  return !destroyed && ((king.alive && near(king.pos, 2.5)) || units.some((u) => near(u.pos, 2)));
}
