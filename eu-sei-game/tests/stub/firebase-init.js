// STUB da Realtime Database para os testes headless.
//
// Simula o suficiente (caminhos aninhados, listeners em cascata para o pai,
// updates multi-caminho tipo "a/b/c") para exercitar app.js/room.js sem rede.
//
// AVISO IMPORTANTE: isto NUNCA pode ir parar a public/. O runner monta uma
// cópia da app numa pasta temporária e só aí é que substitui o
// public/js/firebase-init.js verdadeiro por este ficheiro — public/ nunca é
// tocado, por isso o site publicado continua a falar com a Firebase a sério.
// Se algum dia alguém copiar isto para public/js/, o jogo passa a guardar
// tudo em memória e as salas deixam de funcionar entre dispositivos.

let rootData = {};
const pathListeners = new Map(); // path -> Set(callback)

// Partilha o estado entre abas para se poder testar MESMO vários clientes
// (ex.: um jogador desenha, os outros veem). Cada aba guarda em
// localStorage e avisa as outras por BroadcastChannel; ao receber, aplica o
// snapshot e dispara os listeners todos, como faria a Firebase real.
const SYNC_KEY = "__stubDbRoot";
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("stub-db") : null;
// No Node (testes de logica pura que importam room.js direto) um canal aberto
// mantem o event loop vivo e o processo nunca termina — o teste ficava a
// "correr" para sempre em vez de dar resultado. unref() so existe no Node; no
// browser nao ha nada para desfazer.
channel?.unref?.();
let applyingRemote = false;

function loadShared() {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (raw) rootData = JSON.parse(raw);
  } catch { /* ignora */ }
}

function publishShared() {
  if (applyingRemote) return;
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(rootData));
    channel?.postMessage({ root: rootData });
  } catch { /* ignora */ }
}

function notifyAllListeners() {
  pathListeners.forEach((set, path) => {
    set.forEach((cb) => cb({ val: () => getAt(splitPath(path)) }));
  });
}

if (channel) {
  channel.onmessage = (ev) => {
    if (!ev.data || !ev.data.root) return;
    applyingRemote = true;
    rootData = ev.data.root;
    notifyAllListeners();
    applyingRemote = false;
  };
}
loadShared();

function splitPath(path) {
  return (path || "").split("/").filter(Boolean);
}

function getAt(segments) {
  let node = rootData;
  for (const seg of segments) {
    if (node == null || typeof node !== "object") return null;
    node = node[seg];
  }
  return node === undefined ? null : node;
}

function setAt(segments, value) {
  if (segments.length === 0) {
    rootData = value;
    return;
  }
  let node = rootData;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof node[seg] !== "object" || node[seg] === null) node[seg] = {};
    node = node[seg];
  }
  const last = segments[segments.length - 1];
  if (value === null || value === undefined) {
    delete node[last];
  } else {
    node[last] = value;
  }
}

function deepMergeInto(node, segments, value) {
  if (segments.length === 0) return;
  let cur = node;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof cur[seg] !== "object" || cur[seg] === null) cur[seg] = {};
    cur = cur[seg];
  }
  cur[segments[segments.length - 1]] = value;
}

function applyUpdate(baseSegments, partial) {
  let node = getAt(baseSegments);
  if (typeof node !== "object" || node === null) {
    node = {};
    setAt(baseSegments, node);
  }
  Object.entries(partial).forEach(([key, val]) => {
    deepMergeInto(node, splitPath(key), val);
  });
}

function notifyPath(changedPath) {
  publishShared();
  // Uma escrita num caminho é visível para quem ouve esse caminho e
  // qualquer ancestral (tal como na Firebase real).
  const segs = splitPath(changedPath);
  for (let i = segs.length; i >= 0; i--) {
    const ancestorPath = segs.slice(0, i).join("/");
    const set = pathListeners.get(ancestorPath);
    if (set) {
      set.forEach((cb) => cb({ val: () => getAt(splitPath(ancestorPath)) }));
    }
  }
}

// Gancho só para testes: permite ao Playwright espreitar/mexer nos dados
// diretamente, para simular outros jogadores sem precisar de várias abas
// verdadeiramente ligadas (o stub não partilha estado entre páginas).
if (typeof window !== "undefined") {
  window.__testDb = {
    get: (path) => getAt(splitPath(path)),
    set: (path, value) => { setAt(splitPath(path), value); notifyPath(path); },
    update: (path, partial) => { applyUpdate(splitPath(path), partial); notifyPath(path); },
  };
}

export const app = {};
export const db = {};

export function ref(_db, path) {
  return { path: path || "" };
}

export function onValue(r, cb) {
  if (!pathListeners.has(r.path)) pathListeners.set(r.path, new Set());
  pathListeners.get(r.path).add(cb);
  cb({ val: () => getAt(splitPath(r.path)) });
  return () => { pathListeners.get(r.path)?.delete(cb); };
}

export async function get(r) {
  const val = getAt(splitPath(r.path));
  return { exists: () => val !== null && val !== undefined, val: () => val };
}

function tally(path, payload) {
  const t = typeof window !== "undefined" && window.__writeTally;
  if (t && (!t.filter || path.includes(t.filter))) {
    t.bytes += JSON.stringify(payload === undefined ? null : payload).length;
    t.calls++;
  }
}

export async function set(r, value) {
  tally(r.path, value);
  setAt(splitPath(r.path), value);
  notifyPath(r.path);
}

export async function update(r, partial) {
  tally(r.path, partial);
  applyUpdate(splitPath(r.path), partial);
  notifyPath(r.path);
}

export async function remove(r) {
  setAt(splitPath(r.path), null);
  notifyPath(r.path);
}

export function onDisconnect() {
  return { set: async () => {} };
}

export function serverTimestamp() {
  return Date.now();
}

export async function runTransaction(r, updater) {
  const segs = splitPath(r.path);
  const current = getAt(segs);
  const next = updater(current);
  if (next === undefined) {
    return { committed: false, snapshot: { val: () => current } };
  }
  setAt(segs, next);
  notifyPath(r.path);
  return { committed: true, snapshot: { val: () => next } };
}

export function serverNow() {
  return Date.now();
}

export async function getUid() {
  return "test-uid-" + Math.random().toString(36).slice(2, 8);
}
