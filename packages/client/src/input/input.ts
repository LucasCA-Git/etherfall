import { Btn, type InputCommand } from '@etherfall/shared';
import type { InputAction, KeyMap } from './keymap';

const BUTTON_OF: Partial<Record<InputAction, number>> = {
  light: Btn.Light, heavy: Btn.Heavy, block: Btn.Block, dodge: Btn.Dodge, sprint: Btn.Sprint,
  abilQ: Btn.AbilQ, abilE: Btn.AbilE, abil1: Btn.Abil1, abil2: Btn.Abil2, abil3: Btn.Abil3, abil4: Btn.Abil4,
  ultimate: Btn.Ultimate, interact: Btn.Interact,
};

/**
 * Collects keyboard, mouse and gamepad state and turns it into InputCommands.
 * Presses shorter than one tick are latched so a quick click is never lost.
 */
export class InputManager {
  private held = new Set<string>();
  private latched = new Set<string>();
  private uiPressed: InputAction[] = [];
  mouseX = 0;
  mouseY = 0;
  wheel = 0;
  /** When set, the next key/mouse press is captured for rebinding instead of gameplay. */
  captureNext: ((code: string) => void) | null = null;
  enabled = true;
  private padAim: number | null = null;

  constructor(
    private el: HTMLElement,
    public keymap: KeyMap,
  ) {
    window.addEventListener('keydown', (e) => {
      if (this.captureNext) {
        e.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (['Space', 'Tab', 'F3'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.press(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    el.addEventListener('mousedown', (e) => {
      const code = `Mouse${e.button}`;
      if (this.captureNext) {
        const cb = this.captureNext;
        this.captureNext = null;
        cb(code);
        return;
      }
      e.preventDefault();
      this.press(code);
    });
    window.addEventListener('mouseup', (e) => this.held.delete(`Mouse${e.button}`));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.padAim = null;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  private press(code: string): void {
    this.held.add(code);
    this.latched.add(code);
    for (const a of Object.keys(this.keymap) as InputAction[]) {
      if (this.keymap[a].includes(code) && !BUTTON_OF[a] && !['up', 'down', 'left', 'right'].includes(a)) this.uiPressed.push(a);
    }
  }

  private isDown(a: InputAction): boolean {
    return this.keymap[a].some((c) => this.held.has(c) || this.latched.has(c));
  }

  /** UI actions (menu, map, ...) pressed since last call. */
  consumeUi(): InputAction[] {
    const out = this.uiPressed;
    this.uiPressed = [];
    return out;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Called once per authoritative tick. `aimFromMouse` is the world-space angle to the cursor. */
  sample(aimFromMouse: number): InputCommand {
    let mx = 0;
    let my = 0;
    let buttons = 0;
    if (this.enabled) {
      mx = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
      my = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
      for (const [a, bit] of Object.entries(BUTTON_OF) as [InputAction, number][]) if (this.isDown(a)) buttons |= bit;
      const pad = this.pollGamepad();
      if (pad) {
        if (Math.hypot(pad.mx, pad.my) > 0.2) {
          mx = pad.mx;
          my = pad.my;
        }
        buttons |= pad.buttons;
      }
    }
    this.latched.clear();
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    return { seq: 0, mx, my, aim: this.padAim ?? aimFromMouse, buttons };
  }

  /** Standard-mapping gamepad: left stick move, right stick aim, RT light, RB heavy, LT block, A dodge, X/Y abilities. */
  private pollGamepad(): { mx: number; my: number; buttons: number } | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const ax = (i: number) => (Math.abs(gp.axes[i] ?? 0) > 0.18 ? gp.axes[i]! : 0);
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    const rx = ax(2);
    const ry = ax(3);
    if (Math.hypot(rx, ry) > 0.4) this.padAim = Math.atan2(ry, rx);
    let buttons = 0;
    if (b(7)) buttons |= Btn.Light;
    if (b(5)) buttons |= Btn.Heavy;
    if (b(6)) buttons |= Btn.Block;
    if (b(0)) buttons |= Btn.Dodge;
    if (b(10)) buttons |= Btn.Sprint;
    if (b(2)) buttons |= Btn.AbilQ;
    if (b(3)) buttons |= Btn.AbilE;
    if (b(1)) buttons |= Btn.Interact;
    return { mx: ax(0), my: ax(1), buttons };
  }
}
