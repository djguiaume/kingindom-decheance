import type { KingSettings } from '@kd/content';

const KEY = 'kd.king';

type KingChoices = {
  defaultKing: string;
  kings: readonly KingSettings[];
};

/** Returns the remembered king when it still exists, otherwise the content-defined default. */
export function selectedKingId(
  content: KingChoices,
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): string {
  try {
    const id = storage?.getItem(KEY);
    return id && content.kings.some((king) => king.id === id) ? id : content.defaultKing;
  } catch {
    return content.defaultKing;
  }
}

/** Remembers the menu choice independently from perks and mutators. */
export function saveSelectedKingId(
  id: string,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, id);
  } catch {
    // Selection persistence is optional; a blocked store must not block Play.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
