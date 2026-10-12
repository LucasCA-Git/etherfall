import { CLASSES, CLASS_ORDER, DEFAULT_WORLD_SEED, cleanName, generateWorld, newCharacter, type CharacterSave, type ClassId } from '@etherfall/shared';
import { AudioEngine } from './audio/audio';
import { Game } from './game/game';
import { OnlineLobby } from './hud/lobby';
import { findOffline, listOffline, storeOffline } from './net/offlineSave';
import type { Transport } from './net/localTransport';
import { WebSocketTransport } from './net/wsTransport';
import { loadKeymap } from './input/keymap';
import { loadSettings, PRESETS, type PresetId } from './render/settings';
import './style.css';

const WORLD_SEED = DEFAULT_WORLD_SEED;

function boot(): void {
  const params = new URLSearchParams(location.search);
  const app = document.getElementById('app')!;
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const overlay = document.getElementById('overlay') as HTMLCanvasElement;
  const actors = document.getElementById('actors') as HTMLCanvasElement | null;
  const hud = document.getElementById('hud')!;
  const title = document.getElementById('title')!;
  const audio = new AudioEngine();
  const settings = loadSettings();
  const preset = params.get('preset') as PresetId | null;
  if (preset && PRESETS[preset]) Object.assign(settings, PRESETS[preset].s);

  const qc = params.get('class') as ClassId | null;
  let chosen: ClassId = qc && CLASS_ORDER.includes(qc) ? qc : 'vanguard';
  const GLYPH: Record<ClassId, string> = { vanguard: '@╱◘', barbarian: 'Ψ@╲', rogue: '†@†', ranger: '@)→', arcanist: '@│✦', warlock: '☠@│', healer: '☼│@' };
  const list = title.querySelector<HTMLElement>('.classes')!;
  const cards: HTMLElement[] = [];
  const select = (c: ClassId) => {
    chosen = c;
    cards.forEach((el) => el.classList.toggle('on', el.dataset.class === c));
  };
  for (const id of CLASS_ORDER) {
    const def = CLASSES[id];
    const el = document.createElement('div');
    el.className = 'class-card';
    el.dataset.class = id;
    const add = (cls: string, text: string) => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      el.append(d);
    };
    add('glyph', GLYPH[id]);
    add('cname', def.name);
    add('cdesc', def.fantasy);
    add('cabil', `Q ${def.abilities.q.label} · E ${def.abilities.e.label} · ${def.weaponName}`);
    el.addEventListener('click', () => select(id));
    list.append(el);
    cards.push(el);
  }
  select(chosen);
  const nameInput = document.getElementById('name') as HTMLInputElement;
  let storedName = '';
  try {
    storedName = localStorage.getItem('etherfall.name') ?? '';
  } catch {
    /* storage unavailable */
  }
  nameInput.value = params.get('name') ?? storedName;

  const errorEl = document.getElementById('error')!;
  const launch = (o: { classId: ClassId; name: string; transport?: Transport; save?: CharacterSave }): Game | null => {
    audio.unlock();
    title.classList.add('hidden');
    app.classList.add('playing');
    try {
      const day = Number(params.get('day') ?? 0);
      const seed = Number(params.get('seed')) || WORLD_SEED;
      const rainQ = params.get('rain');
      const rain = rainQ === null ? null : Math.min(1, Math.max(0, Number(rainQ) || 0));
      const game = new Game({
        canvas, overlay, actors: actors ?? undefined, hudRoot: hud, classId: o.classId, name: o.name, seed, settings, keymap: loadKeymap(), audio,
        dayOffset: Number.isFinite(day) ? day : 0, rain, transport: o.transport, save: o.save,
      });
      window.__etherfall = game;
      game.start();
      canvas.focus();
      return game;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      title.classList.remove('hidden');
      app.classList.remove('playing');
      errorEl.textContent = `Não foi possível iniciar: ${msg}`;
      console.error(err);
      return null;
    }
  };

  // ---------------- offline: the character is saved in this browser ----------------
  const start = () => {
    const name = cleanName(nameInput.value) || 'Errante';
    try {
      localStorage.setItem('etherfall.name', name);
    } catch {
      /* ignore */
    }
    const save = findOffline(name, chosen) ?? newCharacter(`off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name, chosen, Date.now());
    const game = launch({ classId: chosen, name, save });
    if (!game) return;
    if (save.level > 1) game.hud.message(`${save.name} continua no nível ${save.level}. Progresso salvo neste navegador.`, 'good');
    const persist = () => {
      const cur = game.currentSave();
      if (cur) storeOffline(cur);
    };
    persist();
    setInterval(persist, 10_000);
    addEventListener('beforeunload', persist);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
  };

  const saves = document.createElement('div');
  saves.className = 'offline-saves';
  const renderSaves = () => {
    const all = listOffline();
    saves.replaceChildren();
    if (!all.length) return;
    const label = document.createElement('span');
    label.className = 'hint';
    label.textContent = 'Continuar:';
    saves.append(label);
    for (const sv of all.slice(0, 6)) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${sv.name} · ${CLASSES[sv.classId].name} · Nv ${sv.level}`;
      b.addEventListener('click', () => {
        nameInput.value = sv.name;
        select(sv.classId);
        start();
      });
      saves.append(b);
    }
  };
  renderSaves();
  const enter = title.querySelector<HTMLElement>('.enter')!;
  enter.after(saves);

  // ---------------- online: accounts on the server that served this page ----------------
  const tabs = document.createElement('div');
  tabs.className = 'modes';
  const offBtn = document.createElement('button');
  offBtn.className = 'btn';
  offBtn.id = 'mode-offline';
  offBtn.textContent = 'Jogar sozinho';
  const onBtn = document.createElement('button');
  onBtn.className = 'btn';
  onBtn.id = 'mode-online';
  onBtn.textContent = 'Online (servidor)';
  tabs.append(offBtn, onBtn);
  let lobby: OnlineLobby | null = null;
  const mode = (online: boolean) => {
    offBtn.classList.toggle('primary', !online);
    onBtn.classList.toggle('primary', online);
    enter.classList.toggle('hidden', online);
    saves.classList.toggle('hidden', online);
    if (online && !lobby) {
      lobby = new OnlineLobby(saves.parentElement!, {
        selectedClass: () => chosen,
        onPlay: (conn, playerId, seed, ch, roomCode) => {
          const transport = new WebSocketTransport(conn, generateWorld(seed), playerId);
          const game = launch({ classId: ch.classId, name: ch.name, transport });
          if (!game) return conn.close();
          transport.onError = (m) => game.hud.toast(m);
          transport.onDisconnect = (m) => showDisconnect(m);
          game.hud.setRoom(roomCode);
          game.hud.message(
            roomCode
              ? `${ch.name} está na sala ${roomCode}. Passe o código para seus amigos entrarem. Seu progresso é salvo automaticamente.`
              : `${ch.name} entrou no mundo aberto. Seu progresso é salvo automaticamente.`,
            'good',
          );
        },
      });
      saves.after(lobby.root);
    }
    lobby?.root.classList.toggle('hidden', !online);
  };
  offBtn.addEventListener('click', () => mode(false));
  onBtn.addEventListener('click', () => mode(true));
  const showDisconnect = (msg: string) => {
    if (document.getElementById('disconnect')) return;
    const d = document.createElement('div');
    d.id = 'disconnect';
    d.className = 'disconnect panel';
    const t = document.createElement('div');
    t.textContent = msg;
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = 'Voltar à tela inicial';
    b.addEventListener('click', () => location.reload());
    d.append(t, b);
    document.body.append(d);
  };
  const online = location.protocol.startsWith('http') || params.has('server');
  if (online) {
    fetch('/api/info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { online?: boolean } | null) => {
        if (!info?.online && !params.has('server')) return;
        list.before(tabs);
        mode(params.get('mode') !== 'offline');
      })
      .catch(() => {
        if (params.has('server')) {
          list.before(tabs);
          mode(true);
        }
      });
  }

  document.getElementById('start')!.addEventListener('click', start);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') start();
  });
  if (params.get('autostart') === '1') start();
}

boot();
