import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DEFAULT_WORLD_SEED } from '@etherfall/shared';
import { startServer } from './server';

/**
 * ETHERFALL server entry point.
 *   npm run build && npm run server
 * Environment: PORT (8080), HOST (0.0.0.0), ETHERFALL_DATA (data file), ETHERFALL_SEED, MAX_PLAYERS,
 * ETHERFALL_TRUST_PROXY=1 (behind Cloudflare Tunnel), ETHERFALL_PUBLIC_URL (public address, e.g. the tunnel URL).
 */
const here = dirname(fileURLToPath(import.meta.url)); // packages/server/dist
const repo = resolve(here, '../../..');
const clientDir = resolve(repo, 'packages/client/dist');
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const dataFile = resolve(process.env.ETHERFALL_DATA ?? resolve(repo, 'data/accounts.json'));

const srv = await startServer({
  port,
  host,
  dataFile,
  clientDir: existsSync(resolve(clientDir, 'index.html')) ? clientDir : null,
  seed: Number(process.env.ETHERFALL_SEED) || DEFAULT_WORLD_SEED,
  maxPlayers: Number(process.env.MAX_PLAYERS) || 32,
  trustProxy: process.env.ETHERFALL_TRUST_PROXY === '1',
  publicOrigins: (process.env.ETHERFALL_PUBLIC_URL ?? '').split(',').map((x) => x.trim()).filter(Boolean),
});

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => `http://${a!.address}:${srv.port}`);
console.log('');
console.log('  ETHERFALL — servidor online');
console.log(`  Neste computador:  http://localhost:${srv.port}`);
for (const u of lan) console.log(`  Na rede local:     ${u}`);
if (process.env.ETHERFALL_PUBLIC_URL) console.log(`  Na internet:       ${process.env.ETHERFALL_PUBLIC_URL}`);
console.log(`  Contas salvas em:  ${dataFile}  (${srv.store.accountCount} conta(s))`);
if (!existsSync(resolve(clientDir, 'index.html'))) console.log('  Aviso: cliente não compilado — rode "npm run build" antes.');
console.log('  Ctrl+C para desligar (os personagens são salvos).');
console.log('');

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  console.log('\n  Salvando personagens e desligando...');
  await srv.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
