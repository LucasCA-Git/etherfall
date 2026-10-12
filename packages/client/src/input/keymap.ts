/** Logical actions and their remappable bindings (KeyboardEvent.code or 'Mouse0..2'). */
export type InputAction =
  | 'up' | 'down' | 'left' | 'right'
  | 'light' | 'heavy' | 'block' | 'dodge' | 'sprint'
  | 'abilQ' | 'abilE' | 'abil1' | 'abil2' | 'abil3' | 'abil4' | 'ultimate'
  | 'interact' | 'context' | 'inventory' | 'character' | 'talents' | 'map' | 'quests' | 'menu' | 'debug';

export const ACTION_LABELS: Record<InputAction, string> = {
  up: 'Mover para cima', down: 'Mover para baixo', left: 'Mover para a esquerda', right: 'Mover para a direita',
  light: 'Ataque leve', heavy: 'Ataque pesado (segure p/ carregar)', block: 'Bloquear / aparar', dodge: 'Esquiva', sprint: 'Correr',
  abilQ: 'Habilidade Q', abilE: 'Habilidade E', abil1: 'Habilidade 1', abil2: 'Habilidade 2', abil3: 'Habilidade 3', abil4: 'Habilidade 4',
  ultimate: 'Suprema (R)', interact: 'Interagir', context: 'Ação contextual (G)', inventory: 'Inventário', character: 'Personagem', talents: 'Talentos e subclasse',
  map: 'Mapa', quests: 'Missões', menu: 'Menu', debug: 'Painel de depuração',
};

export type KeyMap = Record<InputAction, string[]>;

export const DEFAULT_KEYMAP: KeyMap = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  light: ['Mouse0'], heavy: ['Mouse1', 'KeyV'], block: ['Mouse2'], dodge: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'],
  abilQ: ['KeyQ'], abilE: ['KeyE'], abil1: ['Digit1'], abil2: ['Digit2'], abil3: ['Digit3'], abil4: ['Digit4'], ultimate: ['KeyR'],
  interact: ['KeyF'], context: ['KeyG'], inventory: ['KeyI'], character: ['KeyC'], talents: ['KeyK'], map: ['KeyM'], quests: ['KeyJ'], menu: ['Escape'], debug: ['F3'],
};

const STORAGE_KEY = 'etherfall.keymap';

export function loadKeymap(): KeyMap {
  const km: KeyMap = structuredClone(DEFAULT_KEYMAP);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return km;
    const parsed = JSON.parse(raw) as Partial<KeyMap>;
    for (const k of Object.keys(km) as InputAction[]) {
      const v = parsed[k];
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) km[k] = v.slice(0, 3);
    }
  } catch {
    /* storage unavailable: defaults */
  }
  return km;
}

export function saveKeymap(km: KeyMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(km));
  } catch {
    /* ignore */
  }
}

export function prettyKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    Mouse0: 'Clique E', Mouse1: 'Clique M', Mouse2: 'Clique D', Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift dir.',
    Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return names[code] ?? code;
}
