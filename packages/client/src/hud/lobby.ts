import { CLASSES, archetypeOf, type CharacterSummary, type ClassId, type Gender } from '@etherfall/shared';
import { Connection, type AnyServerMsg } from '../net/wsTransport';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export interface LobbyHooks {
  /** Class currently highlighted on the class cards (used to create a character). */
  selectedClass(): ClassId;
  /** Hero body picked on the title screen. */
  selectedGender(): Gender;
  /** The server accepted `play`: start the game on this connection. */
  onPlay(conn: Connection, playerId: number, seed: number, char: CharacterSummary, roomCode: string): void;
}

/**
 * Online title flow: log in or create an account, then pick / create / delete a character.
 * Everything is decided by the server; this panel only renders its answers.
 */
export class OnlineLobby {
  readonly root = h('div', 'lobby panel');
  private conn: Connection | null = null;
  private user = '';
  private chars: CharacterSummary[] = [];
  private status = h('div', 'lobby-status');
  private busy = false;
  private pending: CharacterSummary | null = null;

  constructor(parent: HTMLElement, private hooks: LobbyHooks) {
    parent.append(this.root);
    this.renderLogin();
  }

  private async connection(): Promise<Connection> {
    if (this.conn && !this.conn.closed) return this.conn;
    const c = await Connection.open();
    c.onMessages((msgs) => this.receive(c, msgs));
    c.onClose(() => {
      if (this.conn === c) this.conn = null;
    });
    this.conn = c;
    return c;
  }

  private say(text: string, bad = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('bad', bad);
  }

  private receive(c: Connection, msgs: AnyServerMsg[]): void {
    let welcome: { playerId: number; seed: number } | null = null;
    let room = '';
    for (const m of msgs) {
      if (m.t === 'auth') {
        this.busy = false;
        this.user = m.user;
        this.chars = m.chars;
        this.renderChars();
      } else if (m.t === 'chars') {
        this.busy = false;
        this.chars = m.chars;
        this.renderChars();
      } else if (m.t === 'lobbyError' || m.t === 'error') {
        this.busy = false;
        this.say(m.message, true);
      } else if (m.t === 'kicked') {
        this.say(m.message, true);
      } else if (m.t === 'welcome' && this.pending) {
        welcome = { playerId: m.playerId, seed: m.seed };
      } else if (m.t === 'room') {
        room = m.code;
      }
    }
    // the server sends welcome and the room code in the same frame
    if (welcome && this.pending) {
      const ch = this.pending;
      this.pending = null;
      this.busy = false;
      this.hooks.onPlay(c, welcome.playerId, welcome.seed, ch, room);
    }
  }

  private async request(msg: Parameters<Connection['send']>[0], wait: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.say(wait);
    try {
      (await this.connection()).send(msg);
    } catch (err) {
      this.busy = false;
      this.say(err instanceof Error ? err.message : String(err), true);
    }
  }

  private renderLogin(): void {
    const user = h('input');
    user.id = 'lobby-user';
    user.placeholder = 'Usuário';
    user.autocomplete = 'username';
    user.maxLength = 16;
    const pass = h('input');
    pass.id = 'lobby-pass';
    pass.type = 'password';
    pass.placeholder = 'Senha';
    pass.autocomplete = 'current-password';
    pass.maxLength = 72;
    const login = h('button', 'btn primary', 'Entrar');
    login.id = 'lobby-login';
    const register = h('button', 'btn', 'Criar conta');
    register.id = 'lobby-register';
    login.addEventListener('click', () => void this.request({ t: 'login', user: user.value.trim(), pass: pass.value }, 'Entrando...'));
    register.addEventListener('click', () => void this.request({ t: 'register', user: user.value.trim(), pass: pass.value }, 'Criando conta...'));
    pass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') login.click();
    });
    const row = h('div', 'lobby-row');
    row.append(user, pass, login, register);
    this.say('Sua conta e seus personagens ficam salvos neste servidor.');
    this.root.replaceChildren(h('div', 'menu-title', 'Jogar online'), row, this.status);
  }

  private renderChars(): void {
    // co-op: a room code typed here makes "Jogar" join that room; "Criar sala" opens a new one
    const code = h('input');
    code.id = 'lobby-room';
    code.placeholder = 'Código da sala (opcional)';
    code.maxLength = 8;
    code.autocomplete = 'off';
    code.style.textTransform = 'uppercase';
    const list = h('div', 'char-list');
    if (!this.chars.length) list.append(h('p', 'hint', 'Nenhum personagem ainda: escolha uma classe nos cartões acima e crie o primeiro.'));
    for (const c of this.chars) {
      const row = h('div', 'char-row');
      const sub = archetypeOf(c.classId, c.subclass)?.name ?? null;
      const info = h('div', 'char-info');
      info.append(h('b', '', c.name), h('span', 'hint', ` ${CLASSES[c.classId].name}${sub ? ` · ${sub}` : ''} · Nível ${c.level}`));
      const play = h('button', 'btn primary', 'Jogar');
      play.dataset.char = c.name;
      play.title = 'Entra no mundo aberto, ou na sala do código digitado acima';
      play.addEventListener('click', () => {
        this.pending = c;
        const room = code.value.trim();
        void this.request({ t: 'play', id: c.id, room }, room ? `Entrando na sala ${room.toUpperCase()}...` : `Entrando com ${c.name}...`);
      });
      const host = h('button', 'btn', 'Criar sala');
      host.dataset.host = c.name;
      host.title = 'Abre uma sala privada e mostra o código para seus amigos';
      host.addEventListener('click', () => {
        this.pending = c;
        void this.request({ t: 'play', id: c.id, create: true }, 'Criando sala...');
      });
      const del = h('button', 'btn', 'Excluir');
      del.addEventListener('click', () => {
        if (del.dataset.confirm === '1') void this.request({ t: 'deleteChar', id: c.id }, 'Excluindo...');
        else {
          del.dataset.confirm = '1';
          del.textContent = 'Confirmar?';
          setTimeout(() => {
            del.dataset.confirm = '';
            del.textContent = 'Excluir';
          }, 3000);
        }
      });
      row.append(info, play, host, del);
      list.append(row);
    }
    const name = h('input');
    name.id = 'lobby-charname';
    name.placeholder = 'Nome do novo personagem';
    name.maxLength = 16;
    const create = h('button', 'btn', 'Criar personagem');
    create.id = 'lobby-create';
    create.addEventListener('click', () => {
      const cls = this.hooks.selectedClass();
      void this.request({ t: 'createChar', name: name.value.trim(), classId: cls, gender: this.hooks.selectedGender() }, `Criando ${CLASSES[cls].name}...`);
    });
    const newRow = h('div', 'lobby-row');
    newRow.append(name, create);
    this.say('');
    const roomRow = h('div', 'lobby-row');
    roomRow.append(code, h('span', 'hint', 'Co-op: "Criar sala" gera um código; quem digitar o código aqui e clicar em "Jogar" entra na mesma sala.'));
    this.root.replaceChildren(
      h('div', 'menu-title', `Personagens de ${this.user}`),
      roomRow,
      list,
      h('p', 'hint', 'Novo personagem: escolha a classe nos cartões acima, dê um nome e crie.'),
      newRow,
      this.status,
    );
  }
}
