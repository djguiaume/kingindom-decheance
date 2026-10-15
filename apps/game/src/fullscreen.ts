/** Full screen, plus a landscape lock where the browser allows it (a convenience, ADR-009). */
export async function fullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    // Not supported (e.g. iOS Safari): the game works without it.
  }
}
