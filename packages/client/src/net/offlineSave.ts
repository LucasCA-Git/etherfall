import { validateSave, type CharacterSave, type ClassId } from '@etherfall/shared';

/**
 * Offline characters live in this browser's localStorage (validated on every read, so editing
 * the storage by hand can't create an impossible character). Storage can be unavailable
 * (private mode, file:// in some browsers): every call degrades to "no saves".
 */
const KEY = 'etherfall.saves.v1';
const MAX_SAVES = 12;

function readAll(): CharacterSave[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? list.map(validateSave).filter((s): s is CharacterSave => s !== null) : [];
  } catch {
    return [];
  }
}

export function listOffline(): CharacterSave[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findOffline(name: string, classId: ClassId): CharacterSave | null {
  const n = name.toLowerCase();
  return readAll().find((s) => s.name.toLowerCase() === n && s.classId === classId) ?? null;
}

export function storeOffline(save: CharacterSave): boolean {
  try {
    const all = readAll().filter((s) => s.id !== save.id);
    all.unshift(save);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_SAVES)));
    return true;
  } catch {
    return false;
  }
}

export function deleteOffline(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(readAll().filter((s) => s.id !== id)));
  } catch {
    /* storage unavailable */
  }
}
