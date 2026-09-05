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

function loadShared() {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (raw) rootData = JSON.parse(raw);
  } catch { /* ignora */ }
}

// Guarda o estado inteiro em localStorage (so para uma aba nova arrancar ja
// sincronizada) mas ANUNCIA as alteracoes por caminho.
//
// Antes anunciava-se a raiz inteira e o recetor substituia a sua raiz por ela.
// Com duas abas a escrever ao mesmo tempo — que e exatamente o que os testes
// multijogador fazem — a raiz de uma chegava com um instantaneo tirado antes
// da escrita da outra e desfazia-a. A Firebase real funde por caminho; passar
// a fazer o mesmo tira dos testes uma fonte de falhas que nao existe no jogo.
function publishShared(kind, path, payload) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(rootData));
    channel?.postMessage({ kind, path, payload });
  } catch { /* ignora */ }
}

if (channel) {
  channel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || !msg.kind) return;
    const segs = splitPath(msg.path);
    if (msg.kind === "set") setAt(segs, msg.payload);
    else applyUpdate(segs, msg.payload);
    // Sem "kind" nao republica: e assim que se evita o eco, e nao com um
    // sinalizador global. O sinalizador anterior calava TODAS as escritas
    // feitas enquanto se aplicava uma mensagem remota — incluindo as do
    // anfitriao, que por desenho escreve EM REACAO ao que os outros escrevem
    // (fechar uma votacao, resolver uma ronda). O resultado era o anfitriao
    // aplicar o resultado no seu lado e mais ninguem chegar a saber: codigo
    // de jogo correto a falhar por causa do duble de teste.
    notifyPath(msg.path);
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
  const last = segments[segments.length - 1];
  // Na Firebase, escrever null APAGA a chave. O stub deixava-a lá a valer
  // null, e um Object.entries passava a devolver entradas vazias que no jogo
  // real nunca existiriam — o duble tem de mentir o menos possivel.
  if (value === null || value === undefined) delete cur[last];
  else cur[last] = value;
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

function notifyPath(changedPath, kind, payload) {
  if (kind) publishShared(kind, changedPath, payload);
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
    set: (path, value) => { setAt(splitPath(path), value); notifyPath(path, "set", value); },
    update: (path, partial) => { applyUpdate(splitPath(path), partial); notifyPath(path, "update", partial); },
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
  notifyPath(r.path, "set", value);
}

export async function update(r, partial) {
  tally(r.path, partial);
  applyUpdate(splitPath(r.path), partial);
  notifyPath(r.path, "update", partial);
}

export async function remove(r) {
  setAt(splitPath(r.path), null);
  notifyPath(r.path, "set", null);
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
  notifyPath(r.path, "set", next);
  return { committed: true, snapshot: { val: () => next } };
}

export function serverNow() {
  return Date.now();
}

// O login anonimo da Firebase guarda a sessao: recarregar a pagina devolve o
// MESMO uid. O stub inventava um novo a cada chamada, e assim nenhum teste
// conseguia chegar ao caso "recarreguei e continuo a ser a mesma pessoa" — que
// e o que mais acontece num telemovel.
//
// Fica em sessionStorage e nao em localStorage de proposito: sessionStorage e
// por SEPARADOR e sobrevive ao recarregamento, que e exatamente o que se quer
// aqui. Em localStorage, os dois separadores que os testes multijogador usam
// como dois jogadores passavam a ser a mesma pessoa.
const UID_KEY = "euSei_stubUid";

export async function getUid() {
  try {
    const guardado = sessionStorage.getItem(UID_KEY);
    if (guardado) return guardado;
    const novo = "test-uid-" + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem(UID_KEY, novo);
    return novo;
  } catch {
    return "test-uid-" + Math.random().toString(36).slice(2, 8);
  }
}
