#!/usr/bin/env node
// Launches a coordinated dev pair — the .NET API and the Vite frontend on
// matching ports — so several git worktrees can run side by side without
// colliding. The frontend's /api proxy is pointed at this pair's API port, and
// the API's data file can be swapped per instance.
//
// Usage:
//   node scripts/dev.mjs                 # auto: lowest free pair (web 5173+, api 5037+)
//   node scripts/dev.mjs --instance 1    # deterministic pair: web 5174, api 5038
//   node scripts/dev.mjs --port 5200 --api-port 5200
//   node scripts/dev.mjs --data ../perovsky-family.json   # swap the API data file
//   node scripts/dev.mjs --watch         # API via `dotnet watch run` (hot reload)
//
// Ctrl-C tears down both processes. Ports/URLs are printed at startup.
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';

const WEB_BASE = 5173;
const API_BASE = 5037;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const apiProject = 'src/backend/FamilyTree.Api';
const frontendDir = fileURLToPath(new URL('../src/frontend', import.meta.url));

// ---- args ----
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);
if (hasFlag('help')) {
  console.log(readUsage());
  process.exit(0);
}
const instance = arg('instance') !== undefined ? Number(arg('instance')) : undefined;
const dataArg = arg('data');
const watch = hasFlag('watch');

// ---- port selection ----
/** Deterministic pair for an instance index. */
function pairForInstance(n, webBase = WEB_BASE, apiBase = API_BASE) {
  return { web: webBase + n, api: apiBase + n };
}
function isFree(port) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function firstFree(start) {
  for (let p = start; p < start + 100; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error(`no free port found from ${start}`);
}

async function resolvePorts() {
  const webArg = arg('port');
  const apiArg = arg('api-port');
  if (webArg || apiArg) {
    return { web: Number(webArg ?? WEB_BASE), api: Number(apiArg ?? API_BASE) };
  }
  if (instance !== undefined) return pairForInstance(instance);
  // auto: lowest free pair
  return { web: await firstFree(WEB_BASE), api: await firstFree(API_BASE) };
}

// ---- launch ----
function prefixer(tag, color) {
  return (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.length) process.stdout.write(`${color}[${tag}]\x1b[0m ${line}\n`);
    }
  };
}

const ports = await resolvePorts();
const apiUrl = `http://localhost:${ports.api}`;
const webUrl = `http://localhost:${ports.web}`;
// relative --data is resolved against the cwd (standard CLI behaviour); the API
// receives an absolute path so it doesn't depend on the dotnet process's cwd
const dataFile = dataArg ? (isAbsolute(dataArg) ? dataArg : resolve(process.cwd(), dataArg)) : undefined;

console.log('\x1b[1m── family-tree dev ──────────────────────────────\x1b[0m');
console.log(`  frontend  ${webUrl}`);
console.log(`  api       ${apiUrl}${watch ? '  (watch)' : ''}`);
if (dataFile) console.log(`  data      ${dataFile}`);
console.log('\x1b[2m  (Ctrl-C to stop both)\x1b[0m\n');

if (hasFlag('dry-run')) process.exit(0); // resolve + print the plan, launch nothing

const apiArgs = watch
  ? ['watch', 'run', '--project', apiProject, '--', '--urls', apiUrl]
  : ['run', '--project', apiProject, '--', '--urls', apiUrl];
// R2__LocalMediaDirectory points the API's LocalFileMediaStore at the repo-root
// media/ folder, which is where Vite serves /media from (vite.config.ts → ../../media).
// Note: Vite must have been started with the media/ folder already present to serve it.
const localMediaDir = fileURLToPath(new URL('../media', import.meta.url));
const api = spawn('dotnet', apiArgs, {
  cwd: repoRoot,
  shell: true,
  env: {
    ...process.env,
    ...(dataFile ? { FamilyData__Source: dataFile } : {}),
    R2__LocalMediaDirectory: localMediaDir,
  }
});
const web = spawn('npm', ['run', 'dev'], {
  cwd: frontendDir,
  shell: true,
  env: { ...process.env, PORT: String(ports.web), API_TARGET: apiUrl }
});

api.stdout.on('data', prefixer('api', '\x1b[36m'));
api.stderr.on('data', prefixer('api', '\x1b[36m'));
web.stdout.on('data', prefixer('web', '\x1b[35m'));
web.stderr.on('data', prefixer('web', '\x1b[35m'));

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of [api, web]) { try { p.kill(); } catch { /* already gone */ } }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const [name, child] of [['api', api], ['web', web]]) {
  child.on('exit', (code) => {
    if (!stopping) { console.log(`\x1b[31m[${name}] exited (${code}); stopping the pair\x1b[0m`); shutdown(); }
  });
}

function readUsage() {
  return `family-tree dev launcher — runs the API + frontend on a matching port pair.

  node scripts/dev.mjs                  auto: lowest free pair (web ${WEB_BASE}+, api ${API_BASE}+)
  node scripts/dev.mjs --instance N     deterministic pair: web ${WEB_BASE}+N, api ${API_BASE}+N
  node scripts/dev.mjs --port P --api-port A
  node scripts/dev.mjs --data <file>    swap the API data file (FamilyData__Source)
  node scripts/dev.mjs --watch          API via 'dotnet watch run'
`;
}
