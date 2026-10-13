import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import {
  MAX_CHARS_PER_ACCOUNT, MAX_PASS, MIN_PASS, USER_RE, cleanName, isClassId, newCharacter, summarize, validateSave,
  type CharacterSave, type CharacterSummary, type ClassId,
} from '@etherfall/shared';

const scrypt = promisify(scryptCb) as (pass: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 64;
/** Hard cap so a script can't grow the file (and every save) without bound. */
export const MAX_ACCOUNTS = 2000;

interface Account {
  user: string;
  salt: string;
  hash: string;
  createdAt: number;
  chars: CharacterSave[];
}

interface DbFile {
  v: 1;
  accounts: Record<string, Account>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

async function hashPassword(pass: string, salt: Buffer): Promise<Buffer> {
  return scrypt(pass, salt, KEY_LEN, SCRYPT);
}

/**
 * Accounts and their characters, persisted as one JSON file written atomically
 * (temp file + rename). Passwords are stored only as salted scrypt hashes.
 * `file = null` keeps everything in memory (tests).
 */
export class AccountStore {
  // null-prototype map: usernames like "__proto__" or "constructor" are just keys
  private db: DbFile = { v: 1, accounts: Object.create(null) as Record<string, Account> };
  /** Lowercased character names in use (unique across the server). */
  private names = new Set<string>();
  private dirty = false;
  private writing: Promise<void> | null = null;

  private constructor(private file: string | null) {}

  static async open(file: string | null): Promise<AccountStore> {
    const s = new AccountStore(file);
    if (file) {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8')) as DbFile;
        if (parsed && parsed.v === 1 && parsed.accounts) {
          const accounts = Object.create(null) as Record<string, Account>;
          for (const [k, v] of Object.entries(parsed.accounts)) accounts[k] = v;
          s.db = { v: 1, accounts };
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
    for (const a of Object.values(s.db.accounts)) for (const c of a.chars) s.names.add(c.name.toLowerCase());
    return s;
  }

  get accountCount(): number {
    return Object.keys(this.db.accounts).length;
  }

  private key(user: string): string {
    return user.toLowerCase();
  }

  async register(user: string, pass: string): Promise<Result<string>> {
    if (typeof user !== 'string' || !USER_RE.test(user)) return fail('Usuário: 3 a 16 letras, números ou _');
    if (typeof pass !== 'string' || pass.length < MIN_PASS || pass.length > MAX_PASS) return fail(`Senha: ${MIN_PASS} a ${MAX_PASS} caracteres`);
    if (this.db.accounts[this.key(user)]) return fail('Esse usuário já existe');
    if (this.accountCount >= MAX_ACCOUNTS) return fail('O servidor atingiu o limite de contas');
    const salt = randomBytes(16);
    const hash = await hashPassword(pass, salt);
    if (this.db.accounts[this.key(user)]) return fail('Esse usuário já existe'); // raced while hashing
    this.db.accounts[this.key(user)] = { user, salt: salt.toString('base64'), hash: hash.toString('base64'), createdAt: Date.now(), chars: [] };
    this.dirty = true;
    return ok(user);
  }

  async login(user: string, pass: string): Promise<Result<string>> {
    const generic = 'Usuário ou senha incorretos';
    if (typeof user !== 'string' || typeof pass !== 'string' || pass.length > MAX_PASS) return fail(generic);
    const acc = this.db.accounts[this.key(user)];
    // hash even for unknown users so timing does not reveal which accounts exist
    const salt = acc ? Buffer.from(acc.salt, 'base64') : randomBytes(16);
    const hash = await hashPassword(pass, salt);
    if (!acc) return fail(generic);
    const want = Buffer.from(acc.hash, 'base64');
    return want.length === hash.length && timingSafeEqual(want, hash) ? ok(acc.user) : fail(generic);
  }

  listChars(user: string): CharacterSummary[] {
    return (this.db.accounts[this.key(user)]?.chars ?? []).map(summarize);
  }

  createChar(user: string, rawName: unknown, classId: unknown, gender?: unknown): Result<CharacterSummary[]> {
    const acc = this.db.accounts[this.key(user)];
    if (!acc) return fail('Conta não encontrada');
    if (!isClassId(classId)) return fail('Classe inválida');
    const name = cleanName(rawName);
    if (name.length < 2) return fail('Nome do personagem: 2 a 16 caracteres');
    if (acc.chars.length >= MAX_CHARS_PER_ACCOUNT) return fail(`Limite de ${MAX_CHARS_PER_ACCOUNT} personagens por conta`);
    if (this.names.has(name.toLowerCase())) return fail('Já existe um personagem com esse nome');
    acc.chars.push(newCharacter(randomUUID(), name, classId as ClassId, Date.now(), gender === 'f' ? 'f' : 'm'));
    this.names.add(name.toLowerCase());
    this.dirty = true;
    return ok(this.listChars(user));
  }

  deleteChar(user: string, id: string): Result<CharacterSummary[]> {
    const acc = this.db.accounts[this.key(user)];
    if (!acc) return fail('Conta não encontrada');
    const gone = acc.chars.find((c) => c.id === id);
    if (!gone) return fail('Personagem não encontrado');
    acc.chars = acc.chars.filter((c) => c.id !== id);
    this.names.delete(gone.name.toLowerCase());
    this.dirty = true;
    return ok(this.listChars(user));
  }

  /** A validated copy of one of the account's characters. */
  getChar(user: string, id: string): CharacterSave | null {
    const c = this.db.accounts[this.key(user)]?.chars.find((x) => x.id === id);
    return c ? validateSave(c) : null;
  }

  saveChar(user: string, save: CharacterSave): void {
    const acc = this.db.accounts[this.key(user)];
    if (!acc) return;
    const i = acc.chars.findIndex((c) => c.id === save.id);
    if (i < 0) return;
    acc.chars[i] = save;
    this.dirty = true;
  }

  /** Persist if anything changed. Concurrent calls share the same write. */
  async flush(): Promise<void> {
    if (!this.file) {
      this.dirty = false;
      return;
    }
    // never return while a write is still in flight (shutdown must not exit mid-save)
    while (this.writing) await this.writing.catch(() => {});
    if (!this.dirty) return;
    this.dirty = false;
    const file = this.file;
    const data = JSON.stringify(this.db);
    this.writing = (async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 }); // password hashes: owner-only
      await rename(tmp, file);
    })();
    try {
      await this.writing;
    } catch (err) {
      this.dirty = true;
      throw err;
    } finally {
      this.writing = null;
    }
  }
}
