// Todas as leituras/escritas na Realtime Database vivem aqui.
// O resto da app (app.js) nunca fala diretamente com o Firebase.

import {
  db, ref, onValue, get, set, update, remove,
  onDisconnect, serverTimestamp, runTransaction, serverNow,
} from "./firebase-init.js";
import {
  DEFAULT_CONFIG, pickLetters, pickCategories, catKey, catIndexFromKey, CATEGORIES,
  BALL_MIN_DELAY_MS, BALL_MAX_DELAY_MS, VOTING_TIME_SECONDS,
  pickMapCriteria, shuffleArray, normalizeCountryName, pickDrawWord, pickBoardQuip, pickBoardChaos, BOARD_CHAOS, BOARD_TOOL_KEYS,
  pickLandmark, sameWord, JOGOS_NA_OFICINA, oficinaAberta } from "./data.js";

// --- Mapa-Múndi em equipa (bónus de fim de partida, alternativa/adicional
// à Forca) ---
export const MAP_TRIVIA_ROUNDS = 4;
export const MAP_TRIVIA_ROUND_MS = 20000;
export const MAP_TRIVIA_POINTS = 8;
// Fica mais tempo nos resultados do que a Forca/o normal, para dar espaço
// à equipa votar se aceita respostas escritas com erros/variações.
export const MAP_TRIVIA_RESULT_DISPLAY_MS = 9000;

// --- Fuga da Infeção em equipa (bónus de fim de partida) — perseguição em
// tempo real: um jogador começa "infetado", quem encosta noutro jogador
// infeta-o também, sobrevive quem escapar até ao fim da ronda. Cada cliente
// controla e transmite a sua própria posição (como um jogo de ação normal);
// a deteção de contacto e a apanha de power-ups são feitas localmente por
// cada cliente e escritas de volta — não há "física" corrida no servidor,
// tal como o resto deste jogo (ver nota de confiança acima da Forca). ---
// A ARENA ENCOLHEU, e é de propósito. Era 1400x900 com a câmara a seguir o
// jogador: via-se um terço do mapa, não se sabia de onde vinha a infeção, e o
// jogo era uma perseguição às cegas. "Vê-se muito pouco enquanto se anda pelo
// mapa" foi como o dono o descreveu a jogar.
//
// Agora a arena cabe INTEIRA no ecrã de toda a gente (o ecrã ajusta a escala)
// e é mais pequena, para os jogadores continuarem grandes o suficiente para
// se distinguirem. O que dá a dificuldade deixaram de ser as paredes do
// enquadramento e passaram a ser as paredes a sério: há por onde fugir, por
// onde cortar caminho, e cantos onde ficar encurralado.
export const TAG_ARENA_W = 1200;
export const TAG_ARENA_H = 760;
export const TAG_PLAYER_RADIUS = 16;
export const TAG_ROUND_MS = 60000;
export const TAG_SURVIVOR_BONUS = 25;
export const TAG_POINTS_PER_SECOND = 1;
export const TAG_POWERUP_RADIUS = 14;
export const TAG_POWERUP_MAX_ACTIVE = 3;
export const TAG_POWERUP_SPAWN_INTERVAL_MS = 6000;
export const TAG_SHIELD_MS = 4000;
export const TAG_SPEED_MS = 4000;
export const TAG_TELEPORT_MARGEM = 0.12;
export const TAG_LENTIDAO_MS = 3500;
// Quatro apanhados, e cada um serve os dois lados — o que é o que os torna
// interessantes numa perseguição. O escudo e a velocidade ajudam a fugir; o
// teletransporte tanto tira de um beco como põe à frente de quem foge; e a
// lentidão trava toda a gente MENOS quem a apanhou, por isso vale a quem
// corre e a quem persegue.
export const TAG_POWERUP_TYPES = ["shield", "speed", "teleporte", "lentidao"];
export const TAG_RESULT_DISPLAY_MS = 6000;

// As paredes da arena da infeção. Desenhadas para NÃO fecharem becos sem
// saída completos: cada bolsa tem duas bocas, senão quem lá entra está
// apanhado sem hipótese e a perseguição deixa de ter graça.
export const TAG_WALLS = [
  { x: 200, y: 120, w: 24, h: 220 },
  { x: 200, y: 460, w: 24, h: 200 },
  { x: 420, y: 0, w: 24, h: 200 },
  { x: 420, y: 380, w: 24, h: 240 },
  { x: 620, y: 180, w: 240, h: 24 },
  { x: 620, y: 560, w: 240, h: 24 },
  { x: 840, y: 120, w: 24, h: 220 },
  { x: 840, y: 460, w: 24, h: 200 },
  { x: 1000, y: 300, w: 180, h: 24 },
  { x: 120, y: 300, w: 160, h: 24 },
  { x: 540, y: 340, w: 120, h: 24 },
];

// --- Labirinto: Batalha em equipa (bónus de fim de partida) — mesma
// arquitetura de tempo real da Fuga da Infeção (cada cliente controla e
// transmite só a sua posição, deteta contacto localmente), mas com paredes
// fixas a formar um pequeno labirinto e armas que caem no chão: sem arma
// não se consegue atacar, apanhar uma dá golpes por um tempo limitado.
// Vidas geridas com transação (só uma perde-se de cada vez, mesmo que dois
// atacantes acertem quase ao mesmo tempo); a condição de vitória (só resta
// 1 vivo) é verificada no "host loop" tal como o fim por tempo, não aqui.
export const BATTLE_ARENA_W = 1400;
export const BATTLE_ARENA_H = 900;
export const BATTLE_PLAYER_RADIUS = 16;
export const BATTLE_ROUND_MS = 90000;
export const BATTLE_LIVES = 3;
export const BATTLE_ATTACK_RADIUS = 55;
export const BATTLE_ATTACK_COOLDOWN_MS = 500;
export const BATTLE_ARMED_MS = 9000;
export const BATTLE_WEAPON_RADIUS = 14;
export const BATTLE_WEAPON_MAX_ACTIVE = 4;
export const BATTLE_WEAPON_SPAWN_INTERVAL_MS = 5000;
export const BATTLE_KILL_POINTS = 15;
export const BATTLE_SURVIVOR_BONUS = 20;
export const BATTLE_POINTS_PER_SECOND = 1;
export const BATTLE_RESULT_DISPLAY_MS = 6000;

// Paredes fixas (retângulos em coordenadas do mundo) — um labirinto simples
// com corredores e algumas salas, com margem suficiente para não prender
// jogadores nos cantos da arena.
export const BATTLE_WALLS = [
  { x: 260, y: 0, w: 24, h: 340 },
  { x: 260, y: 560, w: 24, h: 340 },
  { x: 560, y: 160, w: 24, h: 580 },
  { x: 860, y: 0, w: 24, h: 340 },
  { x: 860, y: 560, w: 24, h: 340 },
  { x: 1140, y: 160, w: 24, h: 580 },
  { x: 400, y: 260, w: 300, h: 24 },
  { x: 700, y: 616, w: 300, h: 24 },
  { x: 100, y: 430, w: 220, h: 24 },
  { x: 1080, y: 430, w: 220, h: 24 },
];

// --- Estrada Maluca em equipa (bónus de fim de partida) — corrida de
// resistência em que todos apanham EXATAMENTE os mesmos obstáculos. ---
//
// Ao contrário da Fuga/Batalha, aqui não se transmitem posições para haver
// colisões entre jogadores: cada um corre na sua própria estrada. O que tem
// de ser igual para todos é a pista. Por isso o anfitrião sorteia uma
// "semente" no início e cada cliente gera a mesma sequência de obstáculos a
// partir dela (raceObstacleLane) — ninguém tem uma estrada mais fácil, e não
// é preciso mandar um obstáculo de cada vez pela rede.
export const RACE_LANES = 3;
export const RACE_ROAD_H = 560;
export const RACE_CAR_W = 56;
export const RACE_CAR_H = 88;
export const RACE_PLAYER_Y = 430;
export const RACE_BASE_SPEED = 240; // px/s
export const RACE_MAX_SPEED = 620;
export const RACE_SPEED_RAMP = 4.5; // px/s por segundo
export const RACE_SPAWN_INTERVAL_START_MS = 950;
export const RACE_SPAWN_INTERVAL_MIN_MS = 380;
export const RACE_SPAWN_RAMP_MS_PER_S = 12;
export const RACE_MAX_MS = 150000; // teto de segurança: ninguém corre para sempre
export const RACE_POINTS_PER_SECOND = 1;
export const RACE_PODIUM_BONUS = [20, 12, 6];
export const RACE_RESULT_DISPLAY_MS = 6000;
export const RACE_BROADCAST_MS = 250;

// --- "Onde Fica Isto?" em equipa (bónus de fim de partida) ---
// "ONDE FICA ISTO?" — agora DESENHADO, não escolhido.
//
// Era escolha múltipla sobre um desenho já feito: toda a gente via o mesmo
// monumento e carregava num de quatro países. Morria à segunda partida, pelo
// motivo de sempre nos jogos de escolha múltipla — quem já viu o desenho já
// sabe a resposta, e mais depressa do que quem está a aprender.
//
// Passa a ser uma ronda do Desenha e Adivinha com o baralho dos marcos: uma
// pessoa recebe o monumento e desenha-o, os outros dizem O PAÍS em voz alta.
// O desenho da casa deixa de ser a pergunta e passa a ser a RESPOSTA — no fim
// da ronda aparece a todos, com o nome e o país, que é onde se aprende alguma
// coisa. E o desenho nunca é igual duas vezes, porque é feito à mão na hora.
export const TEMA_MARCOS = "marcos";

// A ESCALA DOS PONTOS. Os jogos bónus são o extra da partida, não a partida:
// nenhum pode valer tanto que decida sozinho quem ganhou. A regra é simples —
// um bónus vale, ao melhor jogador, entre 15 e 40 pontos.
//
//   Fuga da Infeção   1/s + 25 de sobrevivente   ~30-55 numa ronda de 30s
//   Labirinto         15/morte + 20 + 1/s
//   Mini-Golfe        25 / 16 / 10 / 6, mínimo 3
//   Conquistar o Mapa 25 / 16 / 10 / 6, mínimo 3  (pódio, ver computeMapaPayout)
//   Desenha e Adivinha 15 a quem acerta, 8 a quem desenhou
//   Quadro branco     1 por letra, 3 por palavra
//
// O mapa foi o que obrigou a escrever isto: pagava os pontos do seu próprio
// marcador ao placar da sala, e conquistar quarenta países dava seiscentos
// pontos contra os trinta da apanhada. O test-equilibrio.mjs guarda a regra.
// A FILA DE BÓNUS NUNCA LEVA UM JOGO DA OFICINA. Esconder os botões não
// chegava: uma sala com a configuração já guardada continuava a trazer o jogo
// escondido na fila, e a pessoa acabava a jogar aquilo que mandou tirar do
// site — sem sequer perceber de onde tinha vindo. Se a filtragem deixar a
// fila vazia, fica o quadro, que é o que estava lá antes de haver bónus
// nenhuns.
export function filaSemOficina(chaves, oficina = oficinaAberta()) {
  // Com a oficina aberta (?oficina=1) a fila leva tudo: é assim que se
  // continuam a jogar e a testar os que estão a ser melhorados.
  if (oficina) return (chaves || []).length > 0 ? [...chaves] : ["hangman"];
  const limpa = (chaves || []).filter((k) => !JOGOS_NA_OFICINA.includes(k));
  return limpa.length > 0 ? limpa : ["hangman"];
}

export const BONUS_GAME_KEYS = ["hangman", "mapTrivia", "tag", "battle", "draw", "race", "marcos", "golf", "mapa"];

// --- Traços partilhados (rabisco, quadro da Forca, Desenha e Adivinha) ---
//
// Os pontos são guardados NUM OBJETO com chaves sequenciais, não num array.
// Antes era um array reescrito por inteiro a cada envio (~90ms enquanto se
// desenha): com o limite cheio, cada escrita levava a lista toda — dezenas
// de KB por envio, centenas de KB por segundo, tudo para acrescentar meia
// dúzia de pontos. Assim escreve-se só o que é novo.
//
// A chave é `p` + sequência com zeros à esquerda + sufixo de quem escreveu:
// a largura fixa faz a ordem alfabética coincidir com a numérica (é assim
// que se lê de volta), e o sufixo evita que dois clientes a desenhar ao
// mesmo tempo (no rabisco) se sobreponham na mesma sequência.
const POINT_SEQ_WIDTH = 7;

export function pointsObjectToArray(pointsObj) {
  if (!pointsObj) return [];
  if (Array.isArray(pointsObj)) return pointsObj.filter(Boolean); // formato antigo
  return Object.keys(pointsObj).sort().map((k) => pointsObj[k]);
}

function nextPointSeq(pointsObj) {
  if (!pointsObj || Array.isArray(pointsObj)) return 0;
  let max = -1;
  Object.keys(pointsObj).forEach((k) => {
    const n = parseInt(k.slice(1, 1 + POINT_SEQ_WIDTH), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return max + 1;
}

// Acrescenta só os pontos novos e apaga os mais antigos que passem do
// limite — ambos no mesmo update multi-caminho, uma só escrita.
// O desenho NÃO se apaga sozinho. Havia aqui um limite de "tinta": ao passar
// do máximo, os pontos mais antigos iam sendo deitados fora para dar lugar aos
// novos. A ideia era bonita e o efeito era péssimo — e a borracha foi quem o
// expôs. Cada traço de borracha também é um traço, e também gasta pontos: quem
// apagasse um bocado via o resto do desenho ir encolhendo atrás, traço a traço,
// até à folha vazia. Apagar um canto apagava tudo.
//
// Agora só a "Limpar" apaga. O teto que ficou é uma trave de segurança contra
// escrita sem fim, e ao ser atingido PARA de aceitar pontos novos em vez de
// comer os antigos: um quadro que deixa de aceitar traços vê-se e percebe-se;
// um quadro que se desfaz sozinho por trás não.
export const DOODLE_BOARD_FULL = "cheio";

async function appendPoints(basePath, existingObj, newPoints, uid, maxPoints) {
  const existingKeys = existingObj && !Array.isArray(existingObj) ? Object.keys(existingObj) : [];
  if (existingKeys.length >= maxPoints) return DOODLE_BOARD_FULL;

  const suffix = String(uid || "x").slice(-4);
  let seq = nextPointSeq(existingObj);
  const updates = {};
  const espaco = maxPoints - existingKeys.length;
  newPoints.slice(0, espaco).forEach((pt) => {
    updates[`p${String(seq++).padStart(POINT_SEQ_WIDTH, "0")}_${suffix}`] = pt;
  });
  // Vinha do formato antigo (array): recomeça limpo, senão misturavam-se.
  if (Array.isArray(existingObj)) {
    await set(ref(db, basePath), null);
  }
  await update(ref(db, basePath), updates);
  return newPoints.length > espaco ? DOODLE_BOARD_FULL : null;
}

// --- Quadro branco (bónus de fim de partida) ---
// Já não é o jogo digital de adivinhar letra a letra — passou a ser um
// quadro branco em ecrã inteiro (ocupa o espaço todo do browser, fora do
// cartão/moldura normal da app) onde só o anfitrião da sala ("líder")
// escreve/desenha, e a equipa adivinha em voz alta à volta do ecrã, como
// um jogo de charadas/desenho tradicional — o nome "Forca" ficou só como
// identificador do mini-jogo. Sem pontuação própria: serve de intervalo
// social entre os outros jogos bónus.
export const HANGMAN_DOODLE_MAX_POINTS = 20000;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0/I/1 para evitar confusão

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function roomRef(code) {
  return ref(db, `rooms/${code}`);
}

export async function createRoom(uid, name, avatar) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const r = roomRef(code);
    const snap = await get(r);
    if (snap.exists()) continue; // colisão rara, tenta outro código
    await set(r, {
      createdAt: serverTimestamp(),
      hostId: uid,
      state: "lobby",
      round: 0,
      config: DEFAULT_CONFIG,
      players: {
        [uid]: { name, avatar: avatar || null, score: 0, connected: true, joinedAt: serverTimestamp() },
      },
      usedLetters: {},
      usedCategories: {},
    });
    attachPresence(code, uid);
    return code;
  }
  throw new Error("Não foi possível criar a sala. Tenta novamente.");
}

export async function joinRoom(code, uid, name, avatar) {
  code = code.trim().toUpperCase();
  const r = roomRef(code);
  const snap = await get(r);
  if (!snap.exists()) throw new Error("Essa sala não existe.");
  const room = snap.val();
  // Uma sala a meio de uma partida está fechada a estranhos: entrar a meio de
  // uma ronda pontuada distorce a classificação de quem lá está desde o
  // princípio. O QUADRO é a exceção, e por uma razão simples: não é uma
  // partida com rondas, é uma folha à volta da qual as pessoas se juntam. Numa
  // sala de verdade há sempre quem chegue atrasado, e mandá-lo embora com
  // "essa sala já começou a jogar" é o contrário do que o quadro é. Quem chega
  // escolhe a cor e entra no jogo — não apanha pontos de rondas que não jogou
  // porque no quadro não há rondas dessas.
  if (room.state !== "lobby" && room.state !== "hangman") {
    throw new Error("Essa sala já começou a jogar.");
  }
  const playerCount = Object.keys(room.players || {}).length;
  if (!room.players?.[uid] && playerCount >= 10) {
    throw new Error("Essa sala já está cheia (máx. 10 jogadores).");
  }
  await update(ref(db, `rooms/${code}/players/${uid}`), {
    name, avatar: avatar || room.players?.[uid]?.avatar || null,
    score: room.players?.[uid]?.score || 0, connected: true, joinedAt: serverTimestamp(),
  });
  attachPresence(code, uid);
  return code;
}

// Voltar a uma sala onde já se estava, depois de recarregar a página. É
// diferente de entrar: não passa pela regra "a sala já começou a jogar", que
// existe para impedir ESTRANHOS de entrar a meio — e quem já lá estava não é
// um estranho. Recusa se a sala já não existir ou se o lugar já não for dele.
export async function rejoinRoom(code, uid, name) {
  if (!code || !uid) return null;
  const snap = await get(roomRef(code));
  if (!snap.exists()) return null;
  const room = snap.val();
  if (!room.players?.[uid]) return null;
  await update(ref(db, `rooms/${code}/players/${uid}`), {
    connected: true,
    name: name || room.players[uid].name,
  });
  attachPresence(code, uid);
  return code;
}

// Permite mudar o avatar depois de já estar numa sala (ex: desenhá-lo
// enquanto se espera na lobby) — sem isto a mudança só ficava guardada
// localmente e só apareceria aos outros jogadores numa próxima entrada.
export async function updatePlayerAvatar(code, uid, avatar) {
  await update(ref(db, `rooms/${code}/players/${uid}`), { avatar: avatar || null });
}

function attachPresence(code, uid) {
  const connRef = ref(db, `rooms/${code}/players/${uid}/connected`);
  set(connRef, true);
  onDisconnect(connRef).set(false);
}

export function listenRoom(code, callback) {
  const r = roomRef(code);
  return onValue(r, (snap) => callback(snap.val()));
}

export async function updateConfig(code, partialConfig) {
  await update(ref(db, `rooms/${code}/config`), partialConfig);
}

// --- Migração de anfitrião: se o host cair, o primeiro jogador ligado assume. ---
export async function maybeReclaimHost(code, room, myUid) {
  if (!room || !room.players) return;
  const host = room.players[room.hostId];
  if (host && host.connected) return; // host ainda ativo, nada a fazer
  const connectedIds = Object.keys(room.players).filter((id) => room.players[id].connected);
  if (connectedIds.length === 0) return;
  const candidate = connectedIds.sort()[0]; // determinístico, evita duas escritas em corrida
  if (candidate !== myUid) return; // só o candidato escolhido escreve
  await runTransaction(ref(db, `rooms/${code}/hostId`), (current) => {
    if (current === room.hostId) return candidate;
    return current; // outro já tratou disto
  });
}

// --- Início do jogo / rondas ---

export async function startGame(code) {
  await update(roomRef(code), { round: 1 });
  await startBallPhase(code);
}

export async function startBallPhase(code) {
  const delay = BALL_MIN_DELAY_MS + Math.random() * (BALL_MAX_DELAY_MS - BALL_MIN_DELAY_MS);
  await update(roomRef(code), {
    state: "ball",
    ball: { appearAt: serverNow() + delay, winnerId: null },
    letterPick: null,
    categoriesRound: null,
    answers: null,
    votes: null,
    roundResults: null,
  });
}

export async function claimBallWin(code, uid) {
  const result = await runTransaction(ref(db, `rooms/${code}/ball/winnerId`), (current) => {
    if (current) return current; // já há vencedor
    return uid;
  });
  return result.committed && result.snapshot.val() === uid;
}

export async function startLetterPick(code, room) {
  const used = new Set(Object.keys(room.usedLetters || {}));
  const candidates = pickLetters(3, used, !!room.config?.excludeHardLetters);
  await update(roomRef(code), {
    state: "letterPick",
    letterPick: { candidates, votes: {}, chosen: null, startedAt: serverNow() },
  });
}

export async function voteLetter(code, uid, letter) {
  await set(ref(db, `rooms/${code}/letterPick/votes/${uid}`), letter);
}

export async function confirmLetter(code, room, letter) {
  const usedLetters = { ...(room.usedLetters || {}), [letter]: true };
  const usedCats = new Set(Object.keys(room.usedCategories || {}).map(catIndexFromKey));
  const numCategories = room.config?.numCategories || DEFAULT_CONFIG.numCategories;
  const enabledCats = room.config?.enabledCategories?.length
    ? new Set(room.config.enabledCategories)
    : undefined;
  const catIndexes = pickCategories(numCategories, usedCats, enabledCats);
  const newUsedCats = { ...(room.usedCategories || {}) };
  catIndexes.forEach((i) => { newUsedCats[catKey(i)] = true; });
  const timeLimit = room.config?.timeLimit || DEFAULT_CONFIG.timeLimit;

  await update(roomRef(code), {
    "letterPick/chosen": letter,
    usedLetters,
    usedCategories: newUsedCats,
    state: "categories",
    categoriesRound: {
      letter,
      categoryIndexes: catIndexes,
      endAt: serverNow() + timeLimit * 1000,
      finishedBy: null,
    },
  });
}

export async function submitAnswer(code, uid, catIndex, text) {
  await set(ref(db, `rooms/${code}/answers/${uid}/${catKey(catIndex)}`), text);
}

export async function finishCategoriesRound(code, uid) {
  await runTransaction(ref(db, `rooms/${code}/categoriesRound/finishedBy`), (current) => {
    if (current) return current;
    return uid;
  });
}

export async function startVoting(code) {
  await update(roomRef(code), {
    state: "voting",
    voting: { endAt: serverNow() + VOTING_TIME_SECONDS * 1000 },
  });
}

// Um único voto por (votante, resposta): votar Inválida/Glória/Engraçada
// substitui automaticamente qualquer voto anterior nessa mesma resposta —
// não fazia sentido poder marcar as três ao mesmo tempo. Clicar de novo no
// mesmo botão retira o voto.
export async function castVote(code, room, targetUid, catIndex, voterUid, kind) {
  const voteKey = `${targetUid}_${catIndex}`;
  const current = room.votes?.[voteKey]?.[voterUid] || null;
  const next = current === kind ? null : kind;
  await set(ref(db, `rooms/${code}/votes/${voteKey}/${voterUid}`), next);
}

export async function finishVoting(code, room) {
  const { results, roundPoints } = computeRoundResults(room);
  const updates = {};
  Object.entries(roundPoints).forEach(([uid, pts]) => {
    const prevScore = room.players?.[uid]?.score || 0;
    updates[`players/${uid}/score`] = prevScore + pts;
  });
  updates["roundResults"] = { byPlayer: results, roundPoints };
  updates["state"] = "roundScore";
  await update(roomRef(code), updates);
}

// Bónus fixo por uma resposta passar a válida por voto maioritário de
// Glória (substitui o antigo "+2 por cada voto de Glória", que coexistia
// de forma confusa com o voto de Inválida na mesma resposta).
export const ROUND_GLORIA_BONUS = 5;

export function computeRoundResults(room) {
  const players = Object.keys(room.players || {});
  const N = players.length;
  const catIndexes = room.categoriesRound?.categoryIndexes || [];
  const letter = (room.categoriesRound?.letter || "").toUpperCase();
  const results = {};
  const roundPoints = {};
  players.forEach((uid) => { roundPoints[uid] = 0; results[uid] = {}; });

  catIndexes.forEach((ci) => {
    const entries = players.map((uid) => {
      const text = (room.answers?.[uid]?.[catKey(ci)] || "").trim();
      return { uid, text };
    });
    const othersCount = Math.max(N - 1, 0);
    entries.forEach((e) => {
      e.startsOk = e.text.length > 0 && e.text[0].toUpperCase() === letter;
      const voteKey = `${e.uid}_${ci}`;
      // Um único voto por votante (ver castVote) — nunca se acumulam
      // Inválida/Glória/Engraçada na mesma resposta.
      const kinds = Object.values(room.votes?.[voteKey] || {});
      const invalidCount = kinds.filter((k) => k === "invalid").length;
      const gloriaCount = kinds.filter((k) => k === "gloria").length;
      const engracadaCount = kinds.filter((k) => k === "engracada").length;
      e.invalidByVote = othersCount > 0 && invalidCount > Math.floor(othersCount / 2);
      e.gloriaByVote = othersCount > 0 && gloriaCount > Math.floor(othersCount / 2);
      e.gloriaCount = gloriaCount;
      e.engracadaCount = engracadaCount;
      // A maioria em Glória torna a resposta válida mesmo que não cumprisse
      // a letra ou tivesse maioria de Inválida — o veredito da equipa vale
      // mais do que a verificação automática.
      e.isValid = e.text.length > 0 && (e.gloriaByVote || (e.startsOk && !e.invalidByVote));
    });

    const validEntries = entries.filter((e) => e.isValid);
    const counts = {};
    validEntries.forEach((e) => {
      const key = e.text.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });

    entries.forEach((e) => {
      let status, points;
      if (!e.text) {
        status = "vazia"; points = 0;
      } else if (!e.isValid) {
        if (e.engracadaCount > 0) { status = "engracada"; points = 2; }
        else { status = "invalida"; points = 0; }
      } else {
        const key = e.text.toLowerCase();
        const repeated = counts[key] > 1;
        const base = repeated ? 5 : 10;
        const bonus = e.gloriaByVote ? ROUND_GLORIA_BONUS : 0;
        status = repeated ? "valida-repetida" : "valida-unica";
        points = base + bonus;
      }
      results[e.uid][catKey(ci)] = {
        text: e.text, status, points,
        gloriaVotes: e.gloriaCount, engracadaVotes: e.engracadaCount,
      };
      roundPoints[e.uid] += points;
    });
  });

  return { results, roundPoints };
}

export async function nextRoundOrFinal(code, room) {
  const numRounds = room.config?.numRounds || DEFAULT_CONFIG.numRounds;
  if (room.round >= numRounds) {
    const players = Object.keys(room.players || {});
    if (players.length >= 3) {
      // Forca/Mapa-Múndi em equipa precisam de pelo menos 1 "autor"/tempo +
      // 2 jogadores a jogar. Escolhe a ordem dos jogos bónus ativados na
      // configuração da sala (por omissão, só a Forca, como antes).
      const enabledBonus = (room.config?.bonusGames && room.config.bonusGames.length > 0)
        ? room.config.bonusGames
        : ["hangman"];
      const queue = shuffleArray(filaSemOficina(enabledBonus));
      await update(roomRef(code), { bonusQueue: queue, bonusQueueTotal: queue.length });
      await startNextBonusGame(code, { ...room, bonusQueue: queue, bonusQueueTotal: queue.length });
    } else {
      await update(roomRef(code), { state: "final" });
    }
  } else {
    await update(roomRef(code), { round: room.round + 1 });
    await startBallPhase(code);
  }
}

// Avança para o próximo jogo bónus da fila (fila é sorteada uma vez em
// nextRoundOrFinal), ou termina a partida quando a fila esvazia.
export async function startNextBonusGame(code, room) {
  const queue = room.bonusQueue || [];
  if (queue.length === 0) {
    await update(roomRef(code), { state: "final" });
    return;
  }
  const [key, ...rest] = queue;
  const total = room.bonusQueueTotal || queue.length;
  const index = total - rest.length;
  await update(roomRef(code), { bonusQueue: rest, bonusProgress: { index, total } });
  const nextRoom = { ...room, bonusQueue: rest };
  if (key === "mapTrivia") {
    await startMapTriviaTeam(code, nextRoom);
  } else if (key === "tag") {
    await startTagTeam(code, nextRoom);
  } else if (key === "battle") {
    await startBattleTeam(code, nextRoom);
  } else if (key === "draw") {
    await startDrawGame(code, nextRoom);
  } else if (key === "race") {
    await startRaceGame(code, nextRoom);
  } else if (key === "marcos") {
    await startDrawGame(code, nextRoom, TEMA_MARCOS);
  } else if (key === "golf") {
    await startGolfTeam(code, nextRoom);
  } else if (key === "mapa") {
    await startMapaTeam(code, nextRoom);
  } else {
    await startHangman(code, nextRoom);
  }
}

// Salta direto para UM mini-jogo bónus específico, sem passar pelas rondas
// clássicas do Stop — tal como escolher um jogo avulso no modo sozinho.
// Marca a fila de bónus como "só este, já consumido" para que, no fim,
// startNextBonusGame (chamado por cada finishXxx) veja a fila vazia e
// avance naturalmente para o ecrã final, sem duplicar essa lógica aqui.
export async function startQuickBonusGame(code, room, key) {
  await update(roomRef(code), { bonusQueue: [], bonusQueueTotal: 1, bonusProgress: { index: 1, total: 1 } });
  const nextRoom = { ...room, bonusQueue: [] };
  if (key === "mapTrivia") {
    await startMapTriviaTeam(code, nextRoom);
  } else if (key === "tag") {
    await startTagTeam(code, nextRoom);
  } else if (key === "battle") {
    await startBattleTeam(code, nextRoom);
  } else if (key === "draw") {
    await startDrawGame(code, nextRoom);
  } else if (key === "race") {
    await startRaceGame(code, nextRoom);
  } else if (key === "marcos") {
    await startDrawGame(code, nextRoom, TEMA_MARCOS);
  } else if (key === "golf") {
    await startGolfTeam(code, nextRoom);
  } else if (key === "mapa") {
    await startMapaTeam(code, nextRoom);
  } else {
    await startHangman(code, nextRoom);
  }
}

export async function resetForRematch(code, room) {
  const updates = {
    state: "lobby",
    round: 0,
    usedLetters: {},
    usedCategories: {},
    ball: null,
    letterPick: null,
    categoriesRound: null,
    answers: null,
    votes: null,
    roundResults: null,
    bonusQueue: null,
    bonusQueueTotal: null,
    bonusProgress: null,
    // A MESMA LISTA do backToLobby, e por bom motivo: são as duas voltas ao
    // lobby, e uma lista escrita à mão em dois sítios separa-se. Separou —
    // quem acrescentou a corrida, o golfe e o mapa pôs-nos só numa, e a
    // desforra ficava a arrastar o mapa da partida anterior. O passo 8 do
    // mp-options-test compara as duas contra os jogos que existem.
    hangman: null,
    mapTrivia: null,
    tag: null,
    battle: null,
    draw: null,
    race: null,
    golf: null,
    mapa: null,
  };
  Object.keys(room.players || {}).forEach((uid) => {
    updates[`players/${uid}/score`] = 0;
  });
  await update(roomRef(code), updates);
}

// VOLTAR AO LOBBY sem desfazer a sala. Faltava, e a falta era grave: de
// dentro de um jogo — o quadro em especial, que não tem fim próprio — a única
// saída era deixar a sala, e a seguir toda a gente tinha de escrever o código
// outra vez. Na prática, sair de um jogo desfazia o grupo.
//
// Limpa o estado do jogo que estava a decorrer, para o lobby não abrir com os
// restos dele, mas NÃO toca nos pontos: o que se ganhou, ganhou-se.
export async function backToLobby(code, room) {
  await update(roomRef(code), {
    state: "lobby",
    stateChangedAt: serverNow(),
    bonusQueue: null,
    bonusQueueTotal: null,
    bonusProgress: null,
    hangman: null,
    mapa: null,
    mapTrivia: null,
    tag: null,
    battle: null,
    draw: null,
    race: null,
    golf: null,
  });
}

export async function leaveRoom(code, uid) {
  await remove(ref(db, `rooms/${code}/players/${uid}`));
}

// --- Quadro branco ---
// Quadro branco em ecrã inteiro: só o anfitrião da sala escreve/desenha,
// o resto da equipa vê e adivinha em voz alta (fora da app). Sem mais
// estado do que isto — nenhuma pontuação, nenhuma palavra guardada.

// Modos do quadro. O quadro é a mesma folha para todos; o MODO só muda o que
// aparece à volta dela — que botões, que papéis, que regras a app garante. É
// o grupo que escolhe, por votação: ninguém manda sozinho no que se joga.
// "tools: null" quer dizer todas. Um modo pode TIRAR ferramentas do ecrã, e
// isso não é decoração: na Forca o texto sairia caro, porque quem desenha
// podia escrever a palavra na folha e acabar o jogo por engano no primeiro
// clique. Retirar a ferramenta é mais honesto do que pedir que não se use.
export const BOARD_MODES = {
  livre: {
    label: "Desenho livre",
    hint: "A folha é de todos, escreve um de cada vez. As regras combinam-se por voz.",
    tools: null,
  },
  forca: {
    label: "Forca",
    hint: "Um desenha a forca e a palavra escondida; os outros pedem a palavra para arriscar letras em voz alta.",
    tools: ["pen", "marker", "highlighter", "eraser", "line", "arrow", "rect", "ellipse"],
  },
  // Desenhar em vez de soletrar. Por baixo é a mesma maquinaria da Forca — a
  // palavra que só existe no browser de quem tem a caneta, a vez, as equipas,
  // o histórico, o fim da partida — e o que muda é que não há espaços nem
  // letras: ou se reconhece o desenho, ou não. Por isso é que este modo saiu
  // barato: o que ele precisava já cá estava quase todo.
  adivinha: {
    label: "Desenha e adivinha",
    hint: "Um desenha a palavra (sem escrever letras!); os outros escrevem o palpite. Quem acertar primeiro leva a ronda.",
    tools: ["pen", "marker", "highlighter", "eraser", "line", "arrow", "rect", "ellipse"],
  },
};

// Os modos em que há uma PALAVRA em jogo, que só o browser de quem tem a
// caneta conhece. A Forca e o Desenha e Adivinha partilham quase tudo; o que
// os separa é como se arrisca (letra a letra, ou a palavra de uma vez).
export function isWordMode(modeKey) {
  return modeKey === "forca" || modeKey === "adivinha";
}

// Onde se arrisca LETRAS. No Desenha e Adivinha não há letras nenhumas: dizer
// "tem um a" sobre um desenho não quer dizer nada.
export function lettersMode(room) {
  return (room?.hangman?.mode || DEFAULT_BOARD_MODE) === "forca";
}

export function modeAllowsTool(modeKey, tool) {
  const mode = BOARD_MODES[modeKey] || BOARD_MODES.livre;
  return !mode.tools || mode.tools.includes(tool);
}
export const DEFAULT_BOARD_MODE = "livre";

export async function startHangman(code, room) {
  await update(roomRef(code), {
    state: "hangman",
    hangman: {
      leaderId: room.hostId,
      mode: DEFAULT_BOARD_MODE,
      modeVotes: null,
      penVotes: null,
        doodle: { points: null },
    },
  });
}

export async function finishHangman(code, room) {
  await startNextBonusGame(code, room);
}

// Limpar é de quem tem a caneta (ou do anfitrião, para destravar). O botão já
// só aparecia a esses, mas a função não verificava nada: num jogo sem
// servidor, esta verificação é a única que existe, e todas as outras escritas
// deste módulo já a faziam. Ficava aqui um buraco por distração.
export async function clearHangmanDoodle(code, room, uid) {
  // Quem pode escrever pode limpar: numa folha coletiva, obrigar a pedir ao
  // anfitrião para apagar um risco não faz sentido nenhum.
  if (room && uid && !canDrawOnBoard(room, uid) && !canSetBoardMode(room, uid)) return;
  await set(ref(db, `rooms/${code}/hangman/doodle/points`), null);
}

// Passar a caneta: o quadro é uma folha coletiva, mas escreve UM DE CADA VEZ
// — as regras do que se está a jogar combinam-se por voz, e o que a app tem
// de garantir é só de quem é a vez. Pode passar quem tem a caneta agora ou o
// anfitrião (para destravar se quem estava a desenhar sair ou se esquecer).
export async function passHangmanPen(code, room, uid, targetUid) {
  const hangman = room.hangman;
  if (!hangman) return;
  if (hangman.leaderId !== uid && room.hostId !== uid) return;
  if (!room.players?.[targetUid]) return;
  await update(ref(db, `rooms/${code}/hangman`), { leaderId: targetUid });
}

// Sorteia entre os OUTROS jogadores ligados: passar a caneta a si próprio
// não é passar nada, e a um jogador que já saiu deixava o quadro trancado.
export function pickRandomPenHolder(room, currentUid) {
  const candidates = Object.keys(room.players || {}).filter(
    (uid) => uid !== currentUid && room.players[uid].connected
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export async function passHangmanPenRandom(code, room, uid) {
  const target = pickRandomPenHolder(room, room.hangman?.leaderId);
  if (!target) return null;
  await passHangmanPen(code, room, uid, target);
  return target;
}

// Só o líder (anfitrião da sala) pode escrever (verificação por confiança,
// como o resto do jogo). Recebe os pontos novos (já em coordenadas 0–1,
// para funcionar em qualquer tamanho de ecrã) e escreve a lista completa
// resultante, cortada ao limite — os traços mais antigos vão desaparecendo
// para dar lugar aos novos, como tinta limitada.
// --- Modo Forca: a palavra e os espaços ---
//
// A PALAVRA NUNCA VAI PARA A SALA. Só viaja a sua FORMA: os espaços por
// preencher, com os brancos e os hífens no sítio. Isto não é preciosismo —
// este jogo não tem servidor, cada cliente lê a base de dados toda, e uma
// palavra guardada na sala seria legível por qualquer jogador que abrisse as
// ferramentas do browser. Como se adivinha em voz alta e é quem tem a caneta
// que arbitra, guardar só a forma não tira nada ao jogo e tira a tentação.
export const HANGMAN_MAX_MISSES = 6;

// --- Definições do jogo ---
// Definem-se ANTES de começar e ficam guardadas na sala: quem manda no quadro
// escolhe uma vez e vale para todas as palavras seguintes, em vez de as ter de
// reescolher a cada ronda.
// No Desenha e Adivinha não há letras nem erros: ou se reconhece o desenho, ou
// não. Tudo o que conta letras ou erros fica sem efeito, e o painel di-lo em
// vez de deixar escolher para nada.
const SEM_LETRAS = (room) => (lettersMode(room) ? null : "sem efeito no Desenha e Adivinha");

export const BOARD_SETTINGS_SPEC = {
  forca: [
    {
      key: "maxMisses",
      label: "Erros permitidos",
      // 0 é "sem limite" de propósito: é o modo de jogar com crianças, ou
      // quando a palavra é difícil e ninguém quer perder por causa disso.
      options: [
        { value: 3, label: "3 (difícil)" },
        { value: 6, label: "6 (normal)" },
        { value: 10, label: "10 (fácil)" },
        { value: 0, label: "Sem limite" },
      ],
      default: 6,
      // Com erros de cada um não há teto que enforque ninguém (ver o
      // missPatch): este número deixa de querer dizer o que diz, e um número
      // que não quer dizer nada num painel de definições é uma promessa falsa.
      naoSeAplica: (room) => SEM_LETRAS(room)
        || (individualMisses(room) ? "sem efeito com erros de cada um" : null),
    },
    {
      key: "guessMode",
      label: "Quem arrisca",
      options: [
        { value: "turnos", label: "À vez, um de cada vez" },
        { value: "livre", label: "Qualquer um, quando quiser" },
      ],
      default: "turnos",
      naoSeAplica: SEM_LETRAS,
    },
    {
      key: "matchWords",
      label: "A partida dura",
      options: [
        { value: 3, label: "3 palavras" },
        { value: 5, label: "5 palavras" },
        { value: 8, label: "8 palavras" },
        { value: 0, label: "Sem fim (joga-se até se querer parar)" },
      ],
      // 5 por omissão: as equipas contavam letras e ninguém ganhava nunca. Um
      // jogo que não acaba não tem vencedor, e sem vencedor as equipas são só
      // uma lista de nomes. Quem preferir jogar sem fim escolhe-o.
      default: 5,
    },
    {
      key: "missMode",
      label: "Erros",
      options: [
        { value: "partilhados", label: "Da sala (o teto enforca todos)" },
        { value: "individuais", label: "De cada um" },
      ],
      // Por omissão fica o de sempre: é a forca clássica, e é o que já está
      // testado. Quem quiser o outro escolhe-o.
      default: "partilhados",
      naoSeAplica: SEM_LETRAS,
    },
    {
      key: "penaltyEvery",
      label: "Penalização por erros",
      options: [
        { value: 0, label: "Sem penalização" },
        { value: 2, label: "A cada 2 erros, perde a vez seguinte" },
        { value: 3, label: "A cada 3 erros, perde a vez seguinte" },
        { value: 5, label: "A cada 5 erros, perde a vez seguinte" },
      ],
      default: 0,
      naoSeAplica: (room) => SEM_LETRAS(room)
        || (individualMisses(room) ? null : "sem efeito com erros da sala"),
    },
    {
      key: "autoPen",
      label: "Caneta entre palavras",
      options: [
        { value: 1, label: "Passa sozinha a quem ainda não desenhou" },
        { value: 0, label: "Vota-se sempre" },
      ],
      // Por omissão desligada: votar é o que já existia e o que já foi
      // testado. Quem quiser menos cerimónia liga isto e fica assim para a
      // sala toda — mudar o comportamento por baixo de quem não pediu nada
      // era pior do que deixá-lo à mão de quem quer.
      default: 0,
    },
    {
      key: "chaos",
      label: "A Dona Manga interfere",
      options: [
        { value: 1, label: "Sim, de vez em quando" },
        { value: 0, label: "Não, deixem-me jogar" },
      ],
      // Desligado por omissão: interferir no jogo dos outros é coisa que se
      // escolhe, não coisa que aconteça a quem não pediu nada.
      default: 0,
    },
    {
      key: "revealGuesses",
      label: "Tentativas",
      options: [
        { value: 1, label: "À vista: vê-se quem tentou o quê" },
        { value: 0, label: "Anónimas: ninguém sabe de quem foi" },
      ],
      default: 1,
      naoSeAplica: SEM_LETRAS,
    },
    {
      key: "help",
      label: "Ajuda do Brasa",
      options: [
        { value: "custa", label: "Sim, mas custa" },
        { value: "gratis", label: "Sim, à borla" },
        { value: "nao", label: "Não há ajuda" },
      ],
      // "Custa" por omissão: uma ajuda de graça tira o sentido de arriscar, e
      // nenhuma ajuda deixa quem está encravado sem nada para fazer a não ser
      // ver os outros jogar. O meio-termo é o que faz a ajuda ser uma decisão.
      default: "custa",
      naoSeAplica: SEM_LETRAS,
    },
    {
      key: "showHintAlways",
      label: "Pista",
      options: [
        { value: 1, label: "Sempre à vista" },
        { value: 0, label: "Só depois do primeiro erro" },
      ],
      default: 1,
    },
  ],
  livre: [],
};

// O Desenha e Adivinha usa as mesmas definições da Forca — é a mesma partida,
// com outra maneira de arriscar. As que não lhe dizem respeito (letras, erros)
// aparecem apagadas, como qualquer outra que não faça nada.
BOARD_SETTINGS_SPEC.adivinha = BOARD_SETTINGS_SPEC.forca;

export function boardSetting(room, modeKey, key) {
  const spec = (BOARD_SETTINGS_SPEC[modeKey] || []).find((d) => d.key === key);
  if (!spec) return null;
  const guardado = room?.hangman?.settings?.[key];
  const valido = spec.options.some((o) => o.value === guardado);
  return valido ? guardado : spec.default;
}

export function maxMissesOf(room) {
  const v = boardSetting(room, "forca", "maxMisses");
  return v === null ? HANGMAN_MAX_MISSES : v;
}

export async function setBoardSetting(code, room, uid, key, value) {
  if (!canSetBoardMode(room, uid)) return false;
  const modo = room?.hangman?.mode || DEFAULT_BOARD_MODE;
  const spec = (BOARD_SETTINGS_SPEC[modo] || []).find((d) => d.key === key);
  if (!spec || !spec.options.some((o) => o.value === value)) return false;
  await set(ref(db, `rooms/${code}/hangman/settings/${key}`), value);
  return true;
}

// Ao comparar letras, os acentos não contam. Quem arrisca "c" está a arriscar
// o "ç" de "coração", e quem arrisca "e" está a arriscar o "é" de "café" —
// obrigar a acertar o acento seria adivinhar ortografia, não a palavra. O que
// APARECE no quadro continua a ser a letra como está escrita, com acento.
export function normalizeLetter(ch) {
  return String(ch || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt");
}

// Letras viram "_"; brancos, hífens e pontuação ficam à vista, porque é isso
// que diz se são duas palavras ou uma palavra composta.
export function maskWord(word) {
  return String(word || "")
    .split("")
    .map((ch) => (/[\p{L}\p{N}]/u.test(ch) ? "_" : ch))
    .join("");
}

// Revela todas as posições de uma letra. Recebe a palavra (que só existe no
// browser de quem tem a caneta) e a máscara atual, e devolve a máscara nova.
export function revealLetter(word, mask, letter) {
  const w = String(word || "");
  const m = String(mask || "");
  const alvo = normalizeLetter(letter);
  if (!alvo) return m;
  return w
    .split("")
    .map((ch, i) => (normalizeLetter(ch) === alvo ? ch : m[i] ?? maskWord(ch)))
    .join("");
}

export function maskIsSolved(mask) {
  return !!mask && !mask.includes("_");
}

// --- Várias palavras do mesmo tema ao mesmo tempo ---
//
// A decisão que faz isto ser barato: várias palavras são UMA máscara só,
// separadas por um caráter que não é letra. Como o revealLetter já percorre a
// máscara inteira, "uma letra certa revela em TODAS as palavras" sai de
// graça, sem uma linha de lógica nova na resolução — que era exatamente a
// regra pedida. O separador não é letra, por isso maskWord deixa-o à vista e
// as palavras leem-se separadas.
export const WORD_SEP = " · ";

export function joinWords(palavras) {
  return palavras
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(WORD_SEP);
}

// Aceita vírgulas, barras ou o próprio separador: quem escreve não tem de
// saber qual é o caráter interno.
export function splitWordsInput(texto) {
  return String(texto || "")
    .split(/[,/·]|\s\|\s/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function wordsOfMask(mask) {
  return String(mask || "").split(WORD_SEP);
}

// Uma tentativa de palavra inteira, com várias palavras em jogo, só pode
// revelar A PALAVRA acertada — não o quadro todo. Devolve a máscara nova, ou
// null se não acertou nenhuma.
export function revealWholeWord(secret, mask, tentativa) {
  const partes = wordsOfMask(secret);
  const atuais = wordsOfMask(mask);
  if (partes.length !== atuais.length) return sameWord(tentativa, secret) ? secret : null;
  let acertou = false;
  const novas = partes.map((parte, i) => {
    if (!acertou && sameWord(tentativa, parte) && atuais[i] !== parte) {
      acertou = true;
      return parte;
    }
    return atuais[i];
  });
  return acertou ? novas.join(WORD_SEP) : null;
}

// --- Solo ou equipas ---
//
// O quadro pode jogar-se cada um por si ou em equipas. As equipas montam-se
// ANTES de a palavra ser definida e ficam trancadas a partir daí: trocar de
// equipa a meio da palavra deixava o resultado sem significado nenhum.
export const MAX_TEAMS = 4;
export const TEAM_DEFAULT_NAMES = ["Equipa A", "Equipa B", "Equipa C", "Equipa D"];
export const TEAM_COLORS = ["#b24b38", "#5c7e91", "#5b7442", "#7a4fb5"];

export function teamsOn(room) {
  return room?.hangman?.play === "equipas";
}

// Trancado assim que há palavra: é esse o momento em que o jogo começa.
export function teamsLocked(room) {
  return !!room?.hangman?.mask;
}

export function teamList(room) {
  const teams = room?.hangman?.teams || {};
  return Object.keys(teams)
    .sort()
    .map((id) => ({
      id,
      name: teams[id]?.name || id,
      color: TEAM_COLORS[Number(String(id).replace("t", "")) - 1] || "#3a3126",
      members: connectedPlayerIds(room).filter((uid) => room.hangman.teamOf?.[uid] === id),
      score: room.hangman.teamScore?.[id] || 0,
    }));
}

export async function setPlayMode(code, room, uid, play) {
  if (!canSetBoardMode(room, uid)) return false;
  if (play !== "solo" && play !== "equipas") return false;
  const patch = { play };
  if (play === "equipas" && !room.hangman?.teams) {
    patch.teams = { t1: { name: TEAM_DEFAULT_NAMES[0] }, t2: { name: TEAM_DEFAULT_NAMES[1] } };
  }
  await update(ref(db, `rooms/${code}/hangman`), patch);
  return true;
}

export async function setTeamCount(code, room, uid, n) {
  if (!canSetBoardMode(room, uid)) return false;
  if (teamsLocked(room)) return false;
  const quantas = Math.max(2, Math.min(MAX_TEAMS, Math.floor(n) || 2));
  const teams = {};
  for (let i = 0; i < quantas; i += 1) {
    const id = `t${i + 1}`;
    // Um nome já mudado pela equipa não se perde ao acrescentar outra equipa.
    teams[id] = { name: room.hangman?.teams?.[id]?.name || TEAM_DEFAULT_NAMES[i] };
  }
  const patch = { teams };
  // Quem estava numa equipa que deixou de existir sai para fora, em vez de
  // ficar numa equipa fantasma que não aparece em lado nenhum.
  const teamOf = { ...(room.hangman?.teamOf || {}) };
  let mexeu = false;
  Object.keys(teamOf).forEach((uidJog) => {
    if (!teams[teamOf[uidJog]]) { teamOf[uidJog] = null; mexeu = true; }
  });
  if (mexeu) patch.teamOf = teamOf;
  await update(ref(db, `rooms/${code}/hangman`), patch);
  return true;
}

export async function joinTeam(code, room, uid, teamId) {
  if (!teamsOn(room) || teamsLocked(room)) return false;
  if (teamId !== null && !room.hangman?.teams?.[teamId]) return false;
  await set(ref(db, `rooms/${code}/hangman/teamOf/${uid}`), teamId);
  return true;
}

// Só quem está DENTRO da equipa lhe muda o nome: renomear a equipa dos outros
// não é uma coisa que faça falta e é uma que chateia.
export async function renameTeam(code, room, uid, teamId, name) {
  if (!teamsOn(room) || !room.hangman?.teams?.[teamId]) return false;
  if (room.hangman.teamOf?.[uid] !== teamId) return false;
  const limpo = String(name || "").trim().slice(0, 24);
  if (!limpo) return false;
  await set(ref(db, `rooms/${code}/hangman/teams/${teamId}/name`), limpo);
  return true;
}

export function teamOfPlayer(room, uid) {
  return room?.hangman?.teamOf?.[uid] || null;
}

// De quem é a palavra pessoal, quando as tentativas são anónimas.
//
// Sem equipas é de cada um. COM equipas é da equipa: os colegas veem o mesmo
// progresso, que é a única coisa que faz de uma equipa uma equipa — antes
// disto, ligar as duas opções ao mesmo tempo dava a cada jogador a sua
// palavra e a equipa passava a ser uma lista de nomes sem nada em comum.
// O anonimato mantém-se: continua a não se saber QUEM acertou nem que letra
// cada um tentou, só que a equipa avançou.
export function maskKey(room, uid) {
  const equipa = teamOfPlayer(room, uid);
  return equipa ? `equipa:${equipa}` : uid;
}

// --- Cores dos jogadores ---
// Cada jogador escolhe a sua ao entrar no modo. Serve para as tentativas
// erradas no topo do quadro dizerem QUEM as disse sem ter de escrever o nome
// ao lado de cada letra.
export const HANGMAN_PLAYER_COLORS = [
  "#b24b38", "#5c7e91", "#5b7442", "#e3a53d", "#7a4fb5",
  "#2f7d6e", "#d1691f", "#c2569b", "#3a3126", "#8a8a8a",
];

export function takenHangmanColors(room, exceptUid) {
  const cores = room?.hangman?.colors || {};
  const ligados = connectedPlayerIds(room);
  return Object.entries(cores)
    .filter(([uid]) => uid !== exceptUid && ligados.includes(uid))
    .map(([, cor]) => cor);
}

export async function pickHangmanColor(code, room, uid, color) {
  if (!HANGMAN_PLAYER_COLORS.includes(color)) return false;
  // Duas pessoas com a mesma cor tornavam as letras erradas ilegíveis: não se
  // saberia de quem era qual, que é a única coisa que a cor está aqui a fazer.
  if (takenHangmanColors(room, uid).includes(color)) return false;
  await set(ref(db, `rooms/${code}/hangman/colors/${uid}`), color);
  return true;
}

export function playerColor(room, uid) {
  return room?.hangman?.colors?.[uid] || "#3a3126";
}

// --- Tentativas de letra ---
//
// Quem arrisca é qualquer jogador que não tenha a caneta, uma letra de cada
// vez. Quem JULGA é sempre o cliente de quem tem a caneta, porque só esse
// browser conhece a palavra (ver maskWord). Não há aqui um servidor a
// arbitrar: há uma pessoa, e é a mesma que já arbitrava por voz.
// A fila de quem arrisca. A ordem deixou de ser a ordem dos uid (que não quer
// dizer nada a ninguém) e passa a ser uma ordem GUARDADA, para poder ser
// reordenada por mérito no fim de cada ronda. Quem sai da sala sai da fila;
// quem entra a meio vai para o fim, em vez de furar.
export function hangmanGuessers(room) {
  const ligados = connectedPlayerIds(room).filter((uid) => uid !== room?.hangman?.leaderId);
  const ordem = room?.hangman?.turnOrder;
  if (!Array.isArray(ordem)) return ligados;
  const naOrdem = ordem.filter((uid) => ligados.includes(uid));
  const novos = ligados.filter((uid) => !naOrdem.includes(uid));
  return [...naOrdem, ...novos];
}

// Reordena por quem mais acertou nesta ronda. O sort do JavaScript é estável,
// por isso quem empata mantém a ordem que já tinha — dois jogadores com o
// mesmo número de acertos não trocam de lugar por acaso.
export function orderByCorrect(room, contagens) {
  const certas = contagens || room?.hangman?.correctCount || {};
  return [...hangmanGuessers(room)].sort((a, b) => (certas[b] || 0) - (certas[a] || 0));
}

export function correctCountOf(room, uid) {
  return room?.hangman?.correctCount?.[uid] || 0;
}

// O que muda quando uma ronda ACABA (a palavra saiu, ou os erros esgotaram-se):
// a fila é reordenada por quem mais acertou, e quem mais acertou fica em
// primeiro na ronda seguinte. É a recompensa por jogar bem — e como a ordem
// fica guardada, vê-se logo no ecrã em vez de só aparecer na próxima palavra.
// Um erro de alguém. Dois modelos, à escolha nas definições:
//
// PARTILHADOS (o de sempre, e o por omissão): há um contador da sala e chegar
// ao teto enforca toda a gente. É a forca clássica.
//
// INDIVIDUAIS: cada um acumula os seus, e a cada X erros SEUS perde a vez
// seguinte. Ninguém acaba a ronda dos outros por ser distraído — o que muda o
// jogo de "não estragues isto para todos" para "olha o que te vai custar".
function missPatch(room, guesserUid, word) {
  const patch = {};
  const meus = (room.hangman?.missesBy?.[guesserUid] || 0) + 1;
  patch[`missesBy/${guesserUid}`] = meus;

  // A fala é escolhida por QUEM JULGA e escrita na sala, não sorteada em cada
  // cliente: sorteada em cada um, cada pessoa via uma frase diferente sobre o
  // mesmo erro, e uma sala em que cada um lê uma coisa não é uma sala.
  patch.quip = { i: pickBoardQuip(room.hangman?.quip?.i), at: serverNow(), uid: guesserUid };

  if (individualMisses(room)) {
    const aCada = boardSetting(room, "forca", "penaltyEvery") || 0;
    if (aCada > 0 && meus % aCada === 0) patch[`skipNext/${guesserUid}`] = true;
    // O total da ronda conta na mesma. Não serve para enforcar ninguém — com
    // erros de cada um não há enforcado — mas é por ele que a Dona Manga sabe
    // quando entrar. Sem isto, ligar "erros de cada um" desligava o caos sem
    // o dizer a ninguém: o contador que ele vigia ficava em zero para sempre.
    patch.misses = (room.hangman?.misses || 0) + 1;
    return patch;
  }

  const teto = maxMissesOf(room);
  const proximos = (room.hangman?.misses || 0) + 1;
  patch.misses = teto > 0 ? Math.min(teto, proximos) : proximos;
  // Esgotar os erros da sala acaba a ronda, e acabar a ronda reordena.
  if (teto > 0 && proximos >= teto) Object.assign(patch, roundEndPatch(room, null, word));
  return patch;
}

// Uma ronda acabou: a palavra saiu, ou os erros esgotaram-se. É o único sítio
// onde isso acontece, por isso é aqui que se conta a palavra e se vê se a
// partida chegou ao fim.
function roundEndPatch(room, contagens, word, vencedorUid) {
  const patch = {};
  const feitas = (room?.hangman?.wordsDone || 0) + 1;
  patch.wordsDone = feitas;

  // A palavra entra no histórico da sessão. É aqui, e só aqui, que ela pode
  // sair do browser de quem a escreveu: a ronda acabou, portanto já não há
  // nada para esconder. Guardada com a pista e com quem a pôs, para no fim se
  // poder olhar para trás e dizer "essa é que foi difícil".
  if (word) {
    patch[`history/h${String(feitas).padStart(4, "0")}`] = {
      word,
      hint: room?.hangman?.hint || null,
      by: room?.hangman?.leaderId || null,
      // Quem ganhou vem de fora quando é esta mesma escrita que o decide: ler
      // do room dava o valor ANTERIOR (nulo), e a palavra ficava no histórico
      // sem dono mesmo tendo sido adivinhada.
      winnerUid: vencedorUid || room?.hangman?.winnerUid || null,
      misses: room?.hangman?.misses || 0,
      at: serverNow(),
    };
  }
  const total = boardSetting(room, "forca", "matchWords") || 0;
  if (total > 0 && feitas >= total) patch.matchOver = true;

  const novaOrdem = orderByCorrect(room, contagens);
  if (novaOrdem.length > 0) {
    patch.turnOrder = novaOrdem;
    patch.turnUid = novaOrdem[0];
  }
  return patch;
}

// --- O caos da Dona Manga no quadro ---
//
// Corre no cliente de quem tem a caneta, como tudo o que precisa de conhecer a
// palavra. Dispara a cada N erros da ronda: assim aparece quando o jogo está a
// correr mal, que é quando faz falta, em vez de aparecer ao acaso e atrapalhar
// quem estava a ir bem.
export const BOARD_CHAOS_EVERY = 3;

export function boardChaosOn(room) {
  return boardSetting(room, "forca", "chaos") === 1;
}

// A letra dada de graça é a MAIS COMUM das que faltam. Dar uma letra rara não
// ajuda quase nada e faz o presente parecer uma troça; e nunca se dá a última
// que falta, porque isso era a gata a ganhar o jogo pelas pessoas.
export function chaosLetterToReveal(word, mask) {
  const w = String(word || "");
  const m = String(mask || "");
  const contagem = new Map();
  [...w].forEach((ch, i) => {
    if (m[i] !== "_") return;
    if (!/[\p{L}\p{N}]/u.test(ch)) return;
    const k = normalizeLetter(ch);
    contagem.set(k, (contagem.get(k) || 0) + 1);
  });
  if (contagem.size <= 1) return null;
  let melhor = null;
  let maior = 0;
  contagem.forEach((n, k) => { if (n > maior) { maior = n; melhor = k; } });
  return melhor;
}

// Uma letra errada perdoada: tira-se a mais recente, que é a que ainda dói.
export function chaosMissToForgive(room) {
  const lista = wrongLetters(room);
  return lista.length > 0 ? lista[lista.length - 1].letter : null;
}

export async function fireBoardChaos(code, room, uid, word) {
  if (room?.hangman?.leaderId !== uid) return null;
  if (!boardChaosOn(room)) return null;
  if (!room.hangman.mask || room.hangman.solved) return null;

  // Escolhe só entre o que pode MESMO acontecer agora. Escolher às cegas e
  // desistir se não desse deitava fora a oportunidade toda em silêncio: a
  // gata não aparecia, e só voltaria a tentar muitos erros depois.
  const letraPossivel = chaosLetterToReveal(word, room.hangman.mask);
  const erroPossivel = chaosMissToForgive(room);
  const tracoPossivel = lastStrokeKeys(room.hangman.doodle?.points).length > 0;
  const vezPossivel = hangmanGuessers(room).length > 1;
  const possiveis = BOARD_CHAOS.filter((e) => {
    if (e.kind === "revealLetter") return !!letraPossivel;
    if (e.kind === "forgiveMiss") return !!erroPossivel;
    if (e.kind === "eraseBit") return tracoPossivel;
    if (e.kind === "skipTurn") return vezPossivel;
    return false;
  });
  if (possiveis.length === 0) return null;
  const anterior = room.hangman.chaos?.id;
  const semRepetir = possiveis.filter((e) => e.id !== anterior);
  const lista = semRepetir.length > 0 ? semRepetir : possiveis;
  const evento = lista[Math.floor(Math.random() * lista.length)];
  const patch = { chaos: { id: evento.id, at: serverNow() } };

  if (evento.kind === "revealLetter") {
    const letra = letraPossivel;
    patch.mask = revealLetter(word, room.hangman.mask, letra);
    if (guessesAreAnonymous(room)) {
      // Com palavras pessoais, a prenda é para todos: dar a um só seria a gata
      // a escolher o vencedor.
      // Uma escrita por MÁSCARA, não por jogador: com equipas, os colegas
      // partilham a mesma e escrevê-la duas vezes seria escrever o mesmo.
      const jaFeitas = new Set();
      hangmanGuessers(room).forEach((g) => {
        const chave = maskKey(room, g);
        if (jaFeitas.has(chave)) return;
        jaFeitas.add(chave);
        patch[`masks/${chave}`] = revealLetter(word, playerMask(room, g), letra);
      });
    }
  } else if (evento.kind === "skipTurn") {
    patch.turnUid = nextGuesser(room, currentGuesser(room));
  } else if (evento.kind === "forgiveMiss") {
    patch[`wrong/${erroPossivel}`] = null;
    patch.misses = Math.max(0, (room.hangman.misses || 0) - 1);
  } else if (evento.kind === "eraseBit") {
    // Apaga o último traço do desenho, não a folha: a diferença entre uma
    // partida e um estrago.
    lastStrokeKeys(room.hangman.doodle?.points).forEach((k) => { patch[`doodle/points/${k}`] = null; });
  }

  await update(ref(db, `rooms/${code}/hangman`), patch);
  return evento.id;
}

export function wordHistory(room) {
  const h = room?.hangman?.history || {};
  return Object.keys(h).sort().map((k) => h[k]).filter(Boolean);
}

export function matchIsOver(room) {
  return !!room?.hangman?.matchOver;
}

// OS PONTOS DO QUADRO SOBEM AO PLACAR DA SALA quando a partida acaba.
//
// Uma letra certa vale 1 e a palavra inteira vale 3 — não são números novos:
// é exatamente o que o matchScore já conta cá dentro para decidir quem ganhou
// a partida do quadro. O que faltava era somá-lo ao placar da sala. Sem isso,
// ganhar no quadro não valia nada fora dele, e um mini-jogo que não conta é um
// mini-jogo a menos.
//
// Com equipas, quem recebe continua a ser a PESSOA: a equipa decide quem ganha
// a partida do quadro, mas o placar da sala é de cada um, e dividir pontos de
// equipa por gente que entrou e saiu a meio não daria contas honestas.
//
// Paga o anfitrião, porque o placar é da sala e não do quadro, e paga UMA vez:
// o matchPaid vai na mesma escrita, para dois clientes a desenhar o ecrã ao
// mesmo tempo não pagarem a dobrar.
export async function payBoardMatchScore(code, room, uid) {
  const hangman = room?.hangman;
  if (!hangman?.matchOver || hangman.matchPaid) return false;
  if (room.hostId !== uid) return false;
  const pontos = boardMatchPayout(room);
  const updates = { "hangman/matchPaid": true };
  Object.entries(pontos).forEach(([jogador, n]) => {
    if (!n || !room.players?.[jogador]) return;
    updates[`players/${jogador}/score`] = (room.players[jogador].score || 0) + n;
  });
  await update(roomRef(code), updates);
  return true;
}

// O QUADRO NÃO PODE CORRER ATRÁS DO PLACAR. Lá dentro conta-se 1 por letra e
// 3 pela palavra inteira, e está bem assim: é o número que se vê a subir
// enquanto se joga, e é o que faz sentido para quem está a jogar.
//
// Só que esse número cresce com o TAMANHO DA PARTIDA, que a sala escolhe. Uma
// partida de cinco palavras dá uns vinte ao melhor jogador — em cheio na
// banda dos outros bónus. Uma de quinze dá sessenta, e uma de trinta dá cento
// e vinte: o mesmo defeito do mapa, mais devagar.
//
// Em vez de mexer nas letras (que são o jogo) ou de pôr um pódio (que apaga o
// "fiz isto e vale isto" que o ecrã de fim mostra), amortece-se: até 25 vale
// tudo, daí para cima vale metade, com o teto em 50.
//
//   12 -> 12    25 -> 25    40 -> 33    60 -> 43    120 -> 50
//
// A ordem nunca se inverte: quem fez mais leva mais, até ao teto. E numa
// partida normal isto não muda absolutamente nada — que é o ponto.
export const BOARD_SALA_LINEAR_ATE = 25;
export const BOARD_SALA_TETO = 50;

export function boardRoomPayout(pontos) {
  const n = Math.max(0, Math.round(Number(pontos) || 0));
  if (n <= BOARD_SALA_LINEAR_ATE) return n;
  const extra = Math.round((n - BOARD_SALA_LINEAR_ATE) / 2);
  return Math.min(BOARD_SALA_TETO, BOARD_SALA_LINEAR_ATE + extra);
}

// Quanto é que esta partida do quadro vale a cada um no placar da sala.
export function boardMatchPayout(room) {
  const bruto = room?.hangman?.matchScore || {};
  return Object.fromEntries(
    Object.entries(bruto).map(([uid, n]) => [uid, boardRoomPayout(n)]),
  );
}

export function boardMatchPaid(room) {
  return !!room?.hangman?.matchPaid;
}

export function wordsDone(room) {
  return room?.hangman?.wordsDone || 0;
}

export function matchWordsTotal(room) {
  return boardSetting(room, "forca", "matchWords") || 0;
}

// A classificação final da partida. Em equipas conta a equipa; cada um por si,
// conta a pessoa. É a mesma pergunta ("quem ganhou?") com dois sujeitos.
export function matchRanking(room) {
  if (teamsOn(room)) {
    return teamList(room)
      .map((eq) => ({ id: eq.id, nome: eq.name, cor: eq.color, pontos: eq.score, membros: eq.members }))
      .sort((a, b) => b.pontos - a.pontos);
  }
  const pontos = room?.hangman?.matchScore || {};
  return connectedPlayerIds(room)
    .map((uid) => ({
      id: uid,
      nome: room.players?.[uid]?.name || "?",
      cor: playerColor(room, uid),
      pontos: pontos[uid] || 0,
      membros: [uid],
    }))
    .sort((a, b) => b.pontos - a.pontos);
}

// Tudo o que é DA PALAVRA, e não da sala.
//
// Esta lista estava copiada em cinco sítios, com cinco versões ligeiramente
// diferentes — e a diferença não era intenção, era esquecimento. As folhas
// pessoais faltavam em dois, os erros de cada um e os castigos faltavam em
// todos menos um. Castigos que não se apagam acumulam-se de palavra para
// palavra: à terceira, metade da sala está de castigo por erros de rondas que
// já ninguém se lembra.
//
// O que NÃO está aqui é de propósito: a ordem da vez (ganha-se na ronda
// anterior), as equipas, as cores, quem tem a caneta e quem já desenhou são da
// sala e sobrevivem à palavra.
function puzzleResetPatch() {
  return {
    mask: null, hint: null, misses: 0, missesBy: null, solved: false,
    wrong: null, wrongWords: null, guesses: null, wordGuesses: null,
    turnUid: null, masks: null, winnerUid: null, skipNext: null,
    // A ajuda também é da palavra: um pedido por servir e um castigo de não
    // arriscar a palavra inteira não podem atravessar para a palavra seguinte.
    helpAsks: null, noWordGuess: null, help: null,
  };
}

// Recomeçar a partida: zera o que é da partida (palavras feitas, pontos) e
// deixa em paz o que é da sala (equipas, cores, quem tem a caneta).
export async function startNewMatch(code, room, uid) {
  if (!canSetBoardMode(room, uid)) return false;
  await update(ref(db, `rooms/${code}/hangman`), {
    ...puzzleResetPatch(),
    matchOver: null, matchPaid: null, wordsDone: 0, matchScore: null,
    teamScore: null, history: null, correctCount: null,
  });
  return true;
}

// A vez roda entre quem arrisca. Se quem estava na vez sair, passa ao
// seguinte em vez de o jogo ficar à espera de alguém que já não está.
export function nextGuesser(room, afterUid) {
  const fila = hangmanGuessers(room);
  if (fila.length === 0) return null;
  const i = fila.indexOf(afterUid);
  return fila[(i + 1) % fila.length];
}

export function individualMisses(room) {
  return boardSetting(room, "forca", "missMode") === "individuais";
}

export function missesOfPlayer(room, uid) {
  return room?.hangman?.missesBy?.[uid] || 0;
}

// A vez seguinte, saltando quem está de castigo. Quem é saltado GASTA o
// castigo ao ser saltado — senão ficava preso a saltar para sempre, que não
// era uma penalização, era uma expulsão.
function advanceTurn(room, afterUid, patch) {
  const fila = hangmanGuessers(room);
  if (fila.length === 0) return null;
  let atual = afterUid;
  // No máximo uma volta completa: se estiverem todos de castigo, alguém tem
  // de jogar na mesma, ou o jogo parava.
  for (let i = 0; i < fila.length; i += 1) {
    const seguinte = nextGuesser({ ...room, hangman: { ...room.hangman, turnOrder: fila } }, atual);
    if (!seguinte) return null;
    if (!room.hangman?.skipNext?.[seguinte]) return seguinte;
    patch[`skipNext/${seguinte}`] = null;
    atual = seguinte;
  }
  return nextGuesser(room, afterUid);
}

// Com tentativas anónimas, as letras erradas CONTINUAM à vista — só se
// esconde de quem foram. Esconder as letras também faria toda a gente repetir
// as mesmas e o jogo passava a ser só frustração; o que se quer esconder é
// quem falhou, não o que já foi tentado.
// A AJUDA DO BRASA.
//
// Quem está a adivinhar pede; quem tem a caneta é que serve, porque é o único
// que conhece a palavra — o mesmo caminho das tentativas, e pela mesma razão.
//
// O custo foi decidido assim: pedir custa um erro. Se não houver erros para
// gastar — porque o teto já foi atingido, ou porque se está a jogar sem teto e
// aí um erro a mais não custa nada — em vez disso fica-se sem poder arriscar a
// PALAVRA INTEIRA até à palavra seguinte. É uma desvantagem a sério sem ser
// uma expulsão: continua-se a arriscar letras.
export function helpLevel(room) {
  return boardSetting(room, "forca", "help");
}

export function helpCosts(room) {
  return helpLevel(room) === "custa";
}

export function canAskHelp(room, uid) {
  if (helpLevel(room) === "nao") return false;
  // Só onde há letras. No Desenha e Adivinha, revelar uma letra mudava a
  // palavra escondida sem mudar nada no ecrã: uma ajuda que se paga e não se
  // vê é pior do que não haver ajuda nenhuma.
  if (!lettersMode(room)) return false;
  if (!room?.hangman?.mask || room.hangman.solved) return false;
  // Quem tem a caneta sabe a palavra: não há ajuda que lhe faça falta.
  if (room.hangman.leaderId === uid) return false;
  if (!hangmanGuessers(room).includes(uid)) return false;
  if (room.hangman.helpAsks?.[uid]) return false;
  return true;
}

export async function askBrasaHelp(code, room, uid) {
  if (!canAskHelp(room, uid)) return false;
  await set(ref(db, `rooms/${code}/hangman/helpAsks/${uid}`), { at: serverNow() });
  return true;
}

// Quem está proibido de arriscar a palavra inteira até à próxima palavra.
export function blockedFromWordGuess(room, uid) {
  return !!room?.hangman?.noWordGuess?.[uid];
}

// Serve o pedido: revela uma letra a quem pediu e cobra o preço.
// Corre só no cliente de quem tem a caneta, que passa a palavra como
// argumento — ela nunca entra na base de dados.
export async function serveBrasaHelp(code, room, uid, pedinteUid, word) {
  if (room?.hangman?.leaderId !== uid) return null;
  if (helpLevel(room) === "nao") return null;
  const patch = { [`helpAsks/${pedinteUid}`]: null };
  const base = guessesAreAnonymous(room) ? playerMask(room, pedinteUid) : (room.hangman.mask || "");
  const letra = chaosLetterToReveal(word, base);
  if (!letra) return null;

  const revelada = revealLetter(word, base, letra);
  if (guessesAreAnonymous(room)) {
    patch[`masks/${maskKey(room, pedinteUid)}`] = revelada;
    // A partilhada continua a somar, para quem tem a caneta ver o andamento.
    patch.mask = revealLetter(word, room.hangman.mask || "", letra);
  } else {
    patch.mask = revelada;
  }

  if (helpCosts(room)) {
    const teto = maxMissesOf(room);
    const meus = individualMisses(room)
      ? (room.hangman.missesBy?.[pedinteUid] || 0)
      : (room.hangman.misses || 0);
    // Só há erro para gastar se houver teto E ainda houver folga nele.
    const daParaGastar = teto > 0 && meus + 1 < teto;
    if (daParaGastar) {
      if (individualMisses(room)) patch[`missesBy/${pedinteUid}`] = meus + 1;
      patch.misses = (room.hangman.misses || 0) + 1;
    } else {
      patch[`noWordGuess/${pedinteUid}`] = true;
    }
  }
  patch.help = { uid: pedinteUid, letra, at: serverNow(), custou: helpCosts(room) };
  await update(ref(db, `rooms/${code}/hangman`), patch);
  return letra;
}

export function guessesAreAnonymous(room) {
  return boardSetting(room, "forca", "revealGuesses") === 0;
}

// Com tentativas anónimas a palavra passa a ser PESSOAL: cada um vê revelado
// só o que ELE acertou. As letras erradas continuam de todos (senão toda a
// gente repetia as mesmas), mas o progresso é de cada um — o que transforma a
// forca de um esforço coletivo numa corrida a ver quem monta a palavra
// primeiro.
//
// Quem ainda não acertou nada vê a forma toda por preencher. Essa forma
// tira-se da máscara partilhada, voltando a tapar o que lá esteja revelado —
// assim ninguém precisa da palavra para saber quantas letras ela tem.
export function playerMask(room, uid) {
  const hangman = room?.hangman;
  if (!hangman?.mask) return "";
  if (!guessesAreAnonymous(room)) return hangman.mask;
  return hangman.masks?.[maskKey(room, uid)] || maskWord(hangman.mask);
}

// Quem já montou a palavra toda. Serve para o ecrã de quem joga e para saber
// quem ganhou a ronda.
export function playerSolved(room, uid) {
  return maskIsSolved(playerMask(room, uid));
}

export function freeGuessing(room) {
  return boardSetting(room, "forca", "guessMode") === "livre";
}

export function currentGuesser(room) {
  const fila = hangmanGuessers(room);
  if (fila.length === 0) return null;
  const turno = room?.hangman?.turnUid;
  return fila.includes(turno) ? turno : fila[0];
}

// De castigo AGORA. Em modo de turnos a penalização já se via na fila (o
// advanceTurn salta quem está de castigo), mas em modo livre não há vez para
// perder: sem isto, ligar "penalização a cada X erros" com "arrisca quem
// quiser" dava uma penalização que não penalizava nada. Em modo livre, ficar
// de castigo é ficar de fora até alguém arriscar.
//
// Se estiverem TODOS de castigo, ninguém fica: uma penalização que tranca o
// jogo deixa de ser uma penalização e passa a ser o fim do jogo.
export function skippedNow(room, uid) {
  if (!room?.hangman?.skipNext?.[uid]) return false;
  const fila = hangmanGuessers(room);
  const todosDeCastigo = fila.length > 0 && fila.every((u) => room.hangman.skipNext?.[u]);
  return !todosDeCastigo;
}

export function canGuessNow(room, uid) {
  if (!room?.hangman?.mask || room.hangman.solved) return false;
  if (!hangmanGuessers(room).includes(uid)) return false;
  if (room.hangman.guesses?.[uid]) return false;
  if (skippedNow(room, uid)) return false;
  return freeGuessing(room) || currentGuesser(room) === uid;
}

export async function submitLetterGuess(code, room, uid, letter) {
  const letra = String(letter || "").trim().slice(0, 1);
  if (!letra) return false;
  if (!canGuessNow(room, uid)) return false;
  await set(ref(db, `rooms/${code}/hangman/guesses/${uid}`), { letter: letra, at: serverNow() });
  return true;
}

export async function passGuessTurn(code, room, uid) {
  if (room?.hangman?.leaderId !== uid) return;
  await set(ref(db, `rooms/${code}/hangman/turnUid`), nextGuesser(room, currentGuesser(room)));
}

export function letterAlreadyTried(room, letter) {
  const letra = normalizeLetter(letter);
  if (!letra) return false;
  const erradas = room?.hangman?.wrong || {};
  if (Object.keys(erradas).some((l) => !!erradas[l] && normalizeLetter(l) === letra)) return true;
  return [...String(room?.hangman?.mask || "")].some((ch) => ch !== "_" && normalizeLetter(ch) === letra);
}

// Resolve UMA tentativa. Corre só no cliente de quem tem a caneta, que passa
// a palavra como argumento — ela nunca entra na base de dados.
export async function resolveGuess(code, room, uid, guesserUid, letter, word) {
  if (room?.hangman?.leaderId !== uid) return null;
  const mask = room.hangman.mask || "";
  const nova = revealLetter(word, mask, letter);
  // Acertar é a letra ESTAR NA PALAVRA, e não "a máscara mudou". Com duas
  // pessoas a arriscar ao mesmo tempo (modo "qualquer um"), a segunda a dizer
  // a mesma letra encontrava-a já revelada, a máscara não mudava, e uma letra
  // certa era contada como erro — com direito a subir para as erradas.
  const alvo = normalizeLetter(letter);
  const acertou = !!alvo && [...String(word || "")].some((ch) => normalizeLetter(ch) === alvo);
  const patch = { [`guesses/${guesserUid}`]: null };
  if (acertou) {
    patch.mask = nova;
    if (guessesAreAnonymous(room)) {
      // Anónimas: a letra certa revela-se só na palavra DELE. A máscara
      // partilhada continua a somar tudo, mas serve só a quem tem a caneta —
      // é o que lhe deixa ver o andamento da ronda.
      const minha = revealLetter(word, playerMask(room, guesserUid), letter);
      patch[`masks/${maskKey(room, guesserUid)}`] = minha;
      patch.solved = maskIsSolved(minha);
    } else {
      patch.solved = maskIsSolved(nova);
    }
    // Quem fechou a palavra fica registado, com as tentativas à vista ou não.
    // Estava só no ramo anónimo, e como as tentativas à vista são o normal, o
    // fim da ronda dizia "Acertaram!" sem dizer a quem, e o histórico da
    // sessão nunca dava a palavra a ninguém.
    if (patch.solved) patch.winnerUid = guesserUid;
    // Uma letra certa conta para a equipa de quem a disse: é o que dá às
    // equipas um propósito para lá de serem uma lista de nomes.
    const equipa = teamOfPlayer(room, guesserUid);
    if (equipa) {
      patch[`teamScore/${equipa}`] = (room.hangman.teamScore?.[equipa] || 0) + 1;
    }
    // O da partida conta sempre, com ou sem equipas: é o que responde a "quem
    // ganhou" quando se joga cada um por si.
    patch[`matchScore/${guesserUid}`] = (room.hangman.matchScore?.[guesserUid] || 0) + 1;
    // ACERTAR DÁ OUTRA TENTATIVA: a vez NÃO passa. Só se perde a vez ao
    // errar. Repara que turnUid não é tocado aqui de propósito — quem
    // acertou continua a ser quem está na vez.
    const contagens = { ...(room.hangman.correctCount || {}) };
    contagens[guesserUid] = (contagens[guesserUid] || 0) + 1;
    patch[`correctCount/${guesserUid}`] = contagens[guesserUid];
    if (patch.solved) Object.assign(patch, roundEndPatch(room, contagens, word, guesserUid));
  } else {
    // A letra errada guarda quem a disse, para aparecer no topo na cor dessa
    // pessoa. Repetida não conta como erro novo — errar duas vezes a mesma
    // letra é distração, não é uma tentativa a mais.
    //
    // E é AQUI que a vez passa — só a quem erra. Calculada dentro deste ramo
    // de propósito: fora dele, corria também no acerto e desfazia o "acertar
    // dá outra tentativa".
    patch.turnUid = advanceTurn(room, guesserUid, patch);
    const jaEsteve = !!room.hangman.wrong?.[letter];
    patch[`wrong/${letter}`] = { uid: guesserUid, at: serverNow() };
    if (!jaEsteve) Object.assign(patch, missPatch(room, guesserUid, word));
  }
  // Em modo livre, quem estava de castigo fica livre assim que OUTRA pessoa
  // arrisca — é isso que faz "perde a vez seguinte" significar alguma coisa
  // onde não há vez a perder. Quem acabou de errar e levou castigo nesta mesma
  // jogada não é libertado: foi este lance que lho deu.
  if (freeGuessing(room)) {
    Object.keys(room.hangman?.skipNext || {}).forEach((u) => {
      if (u !== guesserUid) patch[`skipNext/${u}`] = null;
    });
  }
  await update(ref(db, `rooms/${code}/hangman`), patch);
  return acertou;
}

export function wrongLetters(room) {
  const wrong = room?.hangman?.wrong || {};
  return Object.entries(wrong)
    .filter(([, info]) => !!info)
    .sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))
    .map(([letter, info]) => ({ letter, uid: info?.uid || null }));
}

export async function setHangmanPuzzle(code, room, uid, mask, hint) {
  if (room?.hangman?.leaderId !== uid) return;
  const fila = hangmanGuessers(room);
  await update(ref(db, `rooms/${code}/hangman`), {
    ...puzzleResetPatch(),
    [`drawnBy/${uid}`]: true,
    // A contagem é POR RONDA: zera-se com a palavra nova. A ordem, essa, fica
    // — foi ganha na ronda anterior e é para valer nesta.
    correctCount: null,
    // Quem começa é o primeiro da fila. Estava aqui e voltava a ser escrito
    // como null mais abaixo, na mesma chamada: a segunda escrita ganhava e
    // esta linha não fazia nada. Dava no mesmo por acaso (o currentGuesser
    // recua para o primeiro da fila quando não há vez marcada), mas o estado
    // guardado dizia uma coisa e o ecrã mostrava outra.
    turnUid: fila[0] || null,
    // A pista é o contrário da palavra: é para ser vista por todos. Vai para a
    // sala tal e qual, sem máscara nenhuma.
    hint: (hint || "").trim() || null,
    mask: mask || null,
  });
}

export async function updateHangmanMask(code, room, uid, mask) {
  if (room?.hangman?.leaderId !== uid) return;
  await update(ref(db, `rooms/${code}/hangman`), {
    mask,
    solved: maskIsSolved(mask),
  });
}

// Quanto vale acertar a palavra inteira. É o mesmo número do modo em que os
// palpites são escritos — quem diz a palavra em voz alta não pode valer menos
// do que quem a escreve.
export const PONTOS_PELA_PALAVRA = 3;

// DIZER QUEM ACERTOU. Na Forca os palpites são em voz alta, por isso a app
// não pode saber quem foi: só quem tem a caneta é que ouviu. Faltava dizê-lo,
// e a falta era grande — a ronda acabava sem vencedor, ninguém levava pontos,
// o histórico ficava sem dono e a caneta não tinha a quem passar. Carregava-se
// em "Acertaram" e não acontecia nada a ninguém.
//
// `vencedorUid` a null é uma resposta legítima: o grupo desistiu e a palavra
// revela-se sem ser de ninguém.
export async function solveHangmanWithWinner(code, room, uid, palavra, vencedorUid) {
  if (room?.hangman?.leaderId !== uid) return false;
  // A caneta não se dá pontos a si própria: quem sabe a palavra não a adivinha.
  if (vencedorUid && (vencedorUid === uid || !room.players?.[vencedorUid])) return false;
  const patch = { mask: palavra, solved: true, winnerUid: vencedorUid || null };
  if (vencedorUid) {
    patch[`matchScore/${vencedorUid}`] = (room.hangman.matchScore?.[vencedorUid] || 0) + PONTOS_PELA_PALAVRA;
    const equipa = teamOfPlayer(room, vencedorUid);
    if (equipa) {
      patch[`teamScore/${equipa}`] = (room.hangman.teamScore?.[equipa] || 0) + PONTOS_PELA_PALAVRA;
    }
  }
  await update(ref(db, `rooms/${code}/hangman`), patch);
  return true;
}

export async function addHangmanMiss(code, room, uid) {
  if (room?.hangman?.leaderId !== uid) return;
  const teto = maxMissesOf(room);
  const proximos = (room.hangman.misses || 0) + 1;
  // Sem limite (teto 0) os erros continuam a contar-se: contam-se para se
  // saber quantos foram, só não acabam o jogo.
  await update(ref(db, `rooms/${code}/hangman`), {
    misses: teto > 0 ? Math.min(teto, proximos) : proximos,
  });
}

// A volta da caneta: a seguir vem quem ainda não desenhou nesta sessão. Quando
// já todos desenharam, a volta recomeça — senão, a partir de certa altura não
// havia "seguinte" e o jogo prendia-se a quem lá estivesse.
export function nextPenByRotation(room) {
  const ligados = connectedPlayerIds(room);
  if (ligados.length === 0) return null;
  const jaDesenharam = room?.hangman?.drawnBy || {};
  const porDesenhar = ligados.filter((uid) => !jaDesenharam[uid]);
  const candidatos = porDesenhar.length > 0 ? porDesenhar : ligados;
  // Nunca a mesma pessoa outra vez se houver mais alguém: "passar a caneta"
  // que a deixa na mesma mão não passa nada.
  const semOAtual = candidatos.filter((uid) => uid !== room?.hangman?.leaderId);
  const fila = semOAtual.length > 0 ? semOAtual : candidatos;
  // QUEM ACERTOU VAI À FRENTE, mas só entre os que ainda não desenharam: o
  // mérito decide a ordem, a justiça decide o conjunto. Passar a caneta
  // sempre a quem acerta deixava os outros a ver, e é justamente o contrário
  // do que uma volta serve para fazer.
  const vencedor = room?.hangman?.winnerUid;
  if (vencedor && fila.includes(vencedor)) {
    return vencedor;
  }
  return fila[0];
}

export function autoPenOn(room) {
  return boardSetting(room, "forca", "autoPen") === 1;
}

export async function clearHangmanPuzzle(code, room, uid) {
  if (room?.hangman?.leaderId !== uid) return;
  const patch = puzzleResetPatch();
  if (autoPenOn(room)) {
    const seguinte = nextPenByRotation(room);
    if (seguinte && seguinte !== uid) {
      patch.leaderId = seguinte;
      patch.penVotes = null;
      // Se a volta já deu a volta toda, recomeça-se limpo.
      const ligados = connectedPlayerIds(room);
      const jaDesenharam = room?.hangman?.drawnBy || {};
      const todosJa = ligados.every((u) => jaDesenharam[u]);
      patch.drawnBy = todosJa ? { [seguinte]: true } : { ...jaDesenharam, [seguinte]: true };
    }
  }
  await update(ref(db, `rooms/${code}/hangman`), patch);
}

// --- Votações do quadro ---
// A regra é sempre a mesma: MAIORIA DOS LIGADOS, não maioria de quem votou.
// Com "maioria de quem votou", um só jogador a votar depressa decidia por
// todos antes de os outros terem tempo de abrir o menu.
export function connectedPlayerIds(room) {
  return Object.keys(room?.players || {}).filter((uid) => room.players[uid].connected);
}

export function tallyVotes(votes, connectedIds) {
  const counts = {};
  Object.entries(votes || {}).forEach(([uid, choice]) => {
    // Votos de quem já saiu não contam, senão uma sala que esvaziou ficava
    // presa num resultado que já ninguém quer.
    if (!connectedIds.includes(uid) || !choice) return;
    counts[choice] = (counts[choice] || 0) + 1;
  });
  return counts;
}

// METADE ARREDONDADA PARA CIMA, e não "mais de metade". A diferença aparece
// nas salas pequenas: com "mais de metade", uma sala de dois precisava dos
// dois votos, ou seja, esperava por toda a gente — que é justamente o que não
// se quer numa votação. Assim: 2 pessoas -> 1 voto, 3 -> 2, 4 -> 2, 5 -> 3.
// Em caso de empate ganha quem chegar primeiro ao número; e como a caneta se
// passa a qualquer momento, um engano custa um clique.
export function votesNeeded(connectedIds) {
  return Math.max(1, Math.ceil(connectedIds.length / 2));
}

export function voteWinner(votes, connectedIds) {
  const counts = tallyVotes(votes, connectedIds);
  const needed = votesNeeded(connectedIds);
  const winner = Object.keys(counts).find((k) => counts[k] >= needed);
  return winner || null;
}

// O modo do quadro NÃO se vota. Quem tem a caneta (ou o anfitrião da sala,
// para destravar) escolhe e muda para todos, e muda outra vez se mudarem de
// ideias. Chegou a ser votado; era cerimónia a mais para uma decisão que se
// desfaz num clique — votar faz sentido para escolher QUEM desenha, não para
// escolher o que se está a jogar.
export function canSetBoardMode(room, uid) {
  return room?.hangman?.leaderId === uid || room?.hostId === uid;
}

export async function setBoardMode(code, room, uid, modeKey) {
  if (!BOARD_MODES[modeKey] || !room?.hangman) return false;
  if (!canSetBoardMode(room, uid)) return false;
  if (room.hangman.mode === modeKey) return false;
  const patch = { ...puzzleResetPatch(), mode: modeKey, modeVotes: null };
  if (isWordMode(modeKey)) {
    // Entrar na Forca abre a votação da caneta: enquanto ninguém for
    // escolhido, a folha fica sem dono — é isso que faz a votação acontecer
    // em vez de ficar um botão à espera de ser carregado.
    patch.leaderId = null;
    patch.penVotes = null;
  } else {
    // Sair da Forca tem de devolver a caneta a alguém: sem dono, o desenho
    // livre ficava uma folha em que ninguém consegue escrever.
    patch.leaderId = room.hangman.leaderId || uid || room.hostId;
    patch.penVotes = null;
  }
  await update(ref(db, `rooms/${code}/hangman`), patch);
  return true;
}

export async function votePenHolder(code, room, uid, targetUid) {
  if (!room?.hangman || !room.players?.[targetUid]) return;
  await set(ref(db, `rooms/${code}/hangman/penVotes/${uid}`), targetUid);
}

// Arriscar a PALAVRA INTEIRA. Substituiu o "pedir a palavra", que só levantava
// o braço para falar: uma fila de quem quer falar não é jogo nenhum quando a
// app já sabe julgar. Acertar a palavra acaba o jogo; errar custa um erro,
// como uma letra errada — é a regra clássica da forca, e usa a moeda que já
// existe em vez de inventar outra.
export async function submitWordGuess(code, room, uid, text) {
  const tentativa = String(text || "").trim();
  if (!tentativa) return false;
  if (!room?.hangman?.mask || room.hangman.solved) return false;
  if (!hangmanGuessers(room).includes(uid)) return false;
  if (room.hangman.wordGuesses?.[uid]) return false;
  await set(ref(db, `rooms/${code}/hangman/wordGuesses/${uid}`), { text: tentativa, at: serverNow() });
  return true;
}

// Comparação de palavras inteiras: ignora acentos e maiúsculas, e trata
// vários espaços como um só. Quem diz a palavra certa não pode perder por
// causa de um acento ou de um espaço a mais.
// Mudou-se para o data.js, para os jogos que não falam com a rede também lhe
// chegarem. Continua a sair daqui para não partir quem já a importava.
export { sameWord };

export function wrongWordList(room) {
  const wrong = room?.hangman?.wrongWords || {};
  return Object.values(wrong)
    .filter(Boolean)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

// Resolve UMA tentativa de palavra inteira. Como as letras, só corre no
// cliente de quem tem a caneta — o único que conhece a palavra.
export async function resolveWordGuess(code, room, uid, guesserUid, tentativa, word) {
  if (room?.hangman?.leaderId !== uid) return null;
  // Com várias palavras em jogo, acertar UMA revela essa e só essa: o quadro
  // esvazia-se aos poucos em vez de acabar de repente. Com uma palavra só,
  // revela-a e acaba, como sempre.
  const anonimo = guessesAreAnonymous(room);
  const baseDele = anonimo ? playerMask(room, guesserUid) : (room.hangman.mask || "");
  const novaMascara = revealWholeWord(word, baseDele, tentativa);
  const acertou = !!novaMascara;
  const patch = { [`wordGuesses/${guesserUid}`]: null };
  if (acertou) {
    if (anonimo) {
      patch[`masks/${maskKey(room, guesserUid)}`] = novaMascara;
      // A máscara partilhada continua a somar, para quem tem a caneta ver o
      // andamento; o que se mostra a cada um é a dele.
      patch.mask = revealWholeWord(word, room.hangman.mask || "", tentativa) || room.hangman.mask;
      patch.solved = maskIsSolved(novaMascara);
    } else {
      patch.mask = novaMascara;
      patch.solved = maskIsSolved(novaMascara);
    }
    if (patch.solved) patch.winnerUid = guesserUid;
    const equipa = teamOfPlayer(room, guesserUid);
    if (equipa) {
      // A palavra inteira vale mais do que uma letra: foi um salto, não um
      // passo.
      patch[`teamScore/${equipa}`] = (room.hangman.teamScore?.[equipa] || 0) + 3;
    }
    patch[`matchScore/${guesserUid}`] = (room.hangman.matchScore?.[guesserUid] || 0) + 3;
    // Acertar uma palavra inteira conta como três acertos para a reordenação:
    // quem a viu inteira jogou melhor do que quem foi tirando letras.
    const contagens = { ...(room.hangman.correctCount || {}) };
    contagens[guesserUid] = (contagens[guesserUid] || 0) + 3;
    patch[`correctCount/${guesserUid}`] = contagens[guesserUid];
    // A ronda só acaba quando o quadro TODO está resolvido. Com várias
    // palavras, acertar uma não pode reordenar a fila a meio da ronda.
    if (patch.solved) Object.assign(patch, roundEndPatch(room, contagens, word, guesserUid));
  } else {
    Object.assign(patch, missPatch(room, guesserUid, word));
    patch[`wrongWords/w${Date.now().toString(36)}`] = {
      text: String(tentativa).slice(0, 40), uid: guesserUid, at: serverNow(),
    };
    patch.turnUid = nextGuesser(room, guesserUid);
  }
  await update(ref(db, `rooms/${code}/hangman`), patch);
  return acertou;
}

// Só o anfitrião fecha as votações, pelo mesmo motivo que resolve as rondas:
// dois clientes a aplicarem o mesmo resultado ao mesmo tempo escreveriam
// duas vezes, e a segunda escrita apagaria os votos que já iam a caminho da
// votação seguinte. Quem verifica isso é quem chama (app.js), como em
// resolveRaceRound — este módulo não sabe quem é o utilizador local.
export async function applyBoardVotes(code, room) {
  const hangman = room?.hangman;
  if (!hangman) return;
  const connected = connectedPlayerIds(room);
  if (connected.length === 0) return;

  // Só a caneta se vota. O modo é escolha de quem manda no quadro
  // (ver setBoardMode).
  const penWinner = voteWinner(hangman.penVotes, connected);
  if (penWinner && penWinner !== hangman.leaderId) {
    // A caneta mudou de mão a meio: a palavra que estava em jogo só existia no
    // browser de quem a escreveu, por isso vai-se embora com ela.
    await update(ref(db, `rooms/${code}/hangman`), {
      ...puzzleResetPatch(),
      leaderId: penWinner,
      penVotes: null,
    });
  }
}

// QUEM PODE ESCREVER NO QUADRO. Deixou de ser "só quem tem a caneta": isso
// fazia sentido quando o quadro era só a Forca, e transformava o desenho livre
// numa folha em que uma pessoa desenha e as outras olham. A regra passa a
// depender do modo E do momento:
//
//   - desenho livre: toda a gente, sempre. É uma folha coletiva.
//   - Forca com palavra em jogo: só quem tem a caneta, senão qualquer um podia
//     escrever a resposta no quadro e acabar o jogo.
//   - Forca à espera de palavra, ou já acertada: toda a gente outra vez —
//     nesses momentos não há nada a estragar, e ficar à espara parado é o
//     contrário de um quadro.
export function canDrawOnBoard(room, uid) {
  const hangman = room?.hangman;
  if (!hangman) return false;
  if (!connectedPlayerIds(room).includes(uid)) return false;
  const modo = BOARD_MODES[hangman.mode] ? hangman.mode : DEFAULT_BOARD_MODE;
  // No Desenha e Adivinha vale a mesma regra: com desenho por adivinhar, só
  // quem desenha lhe mexe — senão qualquer um escrevia a resposta na folha.
  if (!isWordMode(modo)) return true;
  const emJogo = !!hangman.mask && !hangman.solved;
  if (!emJogo) return true;
  return hangman.leaderId === uid;
}

// Pontos vindos de um ficheiro. Filtra o que não se reconhece: um ponto sem
// coordenadas, ou com uma ferramenta que não existe, rebentava o redesenho da
// sala INTEIRA — e um ficheiro estragado não pode partir o quadro de toda a
// gente.
export function sanitizeBoardPoints(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter((p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (p.x2 !== undefined && !Number.isFinite(p.x2)) return false;
    if (p.y2 !== undefined && !Number.isFinite(p.y2)) return false;
    if (p.tool && !BOARD_TOOL_KEYS.includes(p.tool)) return false;
    if (p.text !== undefined && typeof p.text !== "string") return false;
    return true;
  }).slice(0, 4000);
}

// Os nomes vêm do data.js, onde as ferramentas vivem. Estiveram repetidos
// aqui durante uma versão, e uma lista repetida diverge à primeira ferramenta
// nova: a nova passava a ser recusada na importação sem ninguém perceber
// porquê.

export async function pushHangmanDoodlePoints(code, room, uid, newPoints) {
  const hangman = room.hangman;
  if (!hangman || !canDrawOnBoard(room, uid)) return;
  return appendPoints(`rooms/${code}/hangman/doodle/points`, hangman.doodle?.points, newPoints, uid, HANGMAN_DOODLE_MAX_POINTS);
}

// Anular o último traço do quadro de sala. Não há aqui uma lista de traços
// como no quadro solo — há uma lista de PONTOS, e um traço é "do início de
// traço até ao próximo". Anular é apagar do último início-de-traço para a
// frente. Sem isto, um risco enganado só se desfazia limpando a folha toda,
// que é uma diferença enorme quando se está a meio de um desenho.
export function lastStrokeKeys(pointsObj) {
  if (!pointsObj || Array.isArray(pointsObj)) return [];
  const chaves = Object.keys(pointsObj).sort();
  let inicio = -1;
  for (let i = chaves.length - 1; i >= 0; i -= 1) {
    const pt = pointsObj[chaves[i]];
    // Formas e textos são UMA entrada, e cada uma é um traço por si.
    if (pt && (pt.newStroke || pt.shape || pt.text)) { inicio = i; break; }
  }
  if (inicio === -1) return chaves;
  return chaves.slice(inicio);
}

export async function undoLastHangmanStroke(code, room, uid) {
  const hangman = room?.hangman;
  if (!hangman || !canDrawOnBoard(room, uid)) return false;
  const chaves = lastStrokeKeys(hangman.doodle?.points);
  if (chaves.length === 0) return false;
  const updates = {};
  chaves.forEach((k) => { updates[k] = null; });
  await update(ref(db, `rooms/${code}/hangman/doodle/points`), updates);
  return true;
}

// --- Desenha e Adivinha em equipa (bónus de fim de partida) ---
// Quadro branco em ecrã inteiro, tal como a Forca, mas com pontuação e
// rondas: a vez de desenhar roda por todos os jogadores ligados, um por
// ronda. Os outros veem o traço em tempo real e adivinham em voz alta
// (fora da app); quem desenha faz também de juiz — quando alguém acerta,
// clica para escolher quem foi, o que atribui pontos e fecha a ronda
// (ou pode saltar, se ninguém acertar). Continua até todos terem
// desenhado uma vez.
// Teto de segurança, não limite de uso — ver appendPoints.
export const DRAW_MAX_POINTS = 20000;
export const DRAW_WINNER_POINTS = 15;
export const DRAW_DRAWER_BONUS = 8;

// Sorteia o que se vai desenhar. Dois baralhos, o mesmo jogo: no tema livre
// sai uma palavra desenhável ("Girafa"), no tema dos marcos sai um monumento
// ("Torre Eiffel") e guarda-se também o id, para no fim se poder mostrar o
// desenho de referência e dizer o país.
export function sortearRondaDeDesenho(tema, usados) {
  if (tema === TEMA_MARCOS) {
    const marco = pickLandmark(usados);
    return { secretWord: marco.name, landmarkId: marco.id, usedKey: marco.id };
  }
  const palavra = pickDrawWord(usados);
  return { secretWord: palavra, landmarkId: null, usedKey: palavra };
}

export async function startDrawGame(code, room, tema = "livre") {
  const turnOrder = shuffleArray(Object.keys(room.players || {}).filter((uid) => room.players[uid].connected));
  const ronda = sortearRondaDeDesenho(tema, []);
  await update(roomRef(code), {
    state: "draw",
    draw: {
      tema,
      turnOrder,
      turnIndex: 0,
      drawerId: turnOrder[0],
      // A palavra secreta fica em texto simples na sala, como o resto do
      // jogo ("por confiança" — ver nota no topo): quem espreitar a
      // consola estraga o jogo a si próprio. O cliente só a mostra a quem
      // desenha, e revela-a a todos quando a ronda fecha.
      secretWord: ronda.secretWord,
      landmarkId: ronda.landmarkId,
      usedWords: [],
      doodle: { points: null },
      resolved: false,
      roundWinnerId: null,
      resolvedAt: null,
    },
  });
}

// Só quem desenha nesta ronda pode escrever (verificação por confiança,
// como o resto do jogo) — mesmo padrão de tinta limitada da Forca.
export async function pushDrawDoodlePoints(code, room, uid, newPoints) {
  const draw = room.draw;
  if (!draw || draw.drawerId !== uid || draw.resolved) return;
  await appendPoints(`rooms/${code}/draw/doodle/points`, draw.doodle?.points, newPoints, uid, DRAW_MAX_POINTS);
}

export async function clearDrawDoodle(code, room, uid) {
  if (!room.draw || room.draw.drawerId !== uid) return;
  await set(ref(db, `rooms/${code}/draw/doodle/points`), null);
}

// Quem desenha escolhe quem acertou primeiro (é o único que sabe a
// resposta) — atribui pontos ao vencedor e um bónus a quem desenhou.
export async function selectDrawWinner(code, room, judgeUid, winnerUid) {
  const draw = room.draw;
  if (!draw || draw.resolved || draw.drawerId !== judgeUid || winnerUid === judgeUid) return;
  if (!room.players?.[winnerUid]) return;
  const prevWinnerScore = room.players?.[winnerUid]?.score || 0;
  const prevDrawerScore = room.players?.[judgeUid]?.score || 0;
  await update(roomRef(code), {
    "draw/resolved": true,
    "draw/roundWinnerId": winnerUid,
    "draw/resolvedAt": serverNow(),
    [`players/${winnerUid}/score`]: prevWinnerScore + DRAW_WINNER_POINTS,
    [`players/${judgeUid}/score`]: prevDrawerScore + DRAW_DRAWER_BONUS,
  });
}

// Ninguém acertou desta vez — fecha a ronda sem atribuir pontos.
export async function skipDrawRound(code, room, uid) {
  const draw = room.draw;
  if (!draw || draw.resolved || draw.drawerId !== uid) return;
  await update(roomRef(code), {
    "draw/resolved": true,
    "draw/roundWinnerId": null,
    "draw/resolvedAt": serverNow(),
  });
}

export async function advanceDrawRound(code, room) {
  const draw = room.draw;
  if (!draw) return;
  const nextIndex = draw.turnIndex + 1;
  if (nextIndex >= draw.turnOrder.length) {
    await startNextBonusGame(code, room);
    return;
  }
  // No tema dos marcos o que não se repete é o MARCO, não o nome: é o id que
  // entra na lista dos usados, porque é por id que o baralho se filtra.
  const jaSaiu = draw.tema === TEMA_MARCOS ? (draw.landmarkId ? [draw.landmarkId] : []) : [draw.secretWord];
  const usedWords = [...(draw.usedWords || []), ...jaSaiu].filter(Boolean);
  const ronda = sortearRondaDeDesenho(draw.tema, usedWords);
  await update(ref(db, `rooms/${code}/draw`), {
    turnIndex: nextIndex,
    drawerId: draw.turnOrder[nextIndex],
    secretWord: ronda.secretWord,
    landmarkId: ronda.landmarkId,
    usedWords,
    doodle: { points: null },
    resolved: false,
    roundWinnerId: null,
    resolvedAt: null,
  });
}

// --- Mapa-Múndi em equipa ---

function buildMapTriviaRound() {
  const criteria = pickMapCriteria();
  return {
    criteria,
    startedAt: serverNow(),
    endAt: serverNow() + MAP_TRIVIA_ROUND_MS,
    answers: {},
    votes: {},
    resolved: false,
    resolvedAt: null,
    roundResults: null,
  };
}

export async function startMapTriviaTeam(code, room) {
  await update(roomRef(code), {
    state: "mapTrivia",
    mapTrivia: { roundIndex: 1, roundsTotal: MAP_TRIVIA_ROUNDS, ...buildMapTriviaRound() },
  });
}

export async function submitMapTriviaAnswer(code, uid, countryName) {
  await set(ref(db, `rooms/${code}/mapTrivia/answers/${uid}`), countryName);
}

// Função pura — fácil de testar sem Firebase. A comparação ignora
// maiúsculas/acentos, para não penalizar pequenas variações de escrita.
export function computeMapTriviaRoundResults(room) {
  const mt = room.mapTrivia || {};
  const matchNamesNormalized = (mt.criteria?.matchNames || []).map(normalizeCountryName);
  const players = Object.keys(room.players || {});
  const roundResults = {};
  const roundPoints = {};
  players.forEach((uid) => {
    const answer = mt.answers?.[uid] || null;
    const correct = !!answer && matchNamesNormalized.includes(normalizeCountryName(answer));
    roundResults[uid] = { answer, correct };
    roundPoints[uid] = correct ? MAP_TRIVIA_POINTS : 0;
  });
  return { roundResults, roundPoints };
}

export async function resolveMapTriviaRound(code, room) {
  const mt = room.mapTrivia;
  if (!mt || mt.resolved) return;
  const { roundResults, roundPoints } = computeMapTriviaRoundResults(room);
  const updates = {
    "mapTrivia/resolved": true,
    "mapTrivia/resolvedAt": serverNow(),
    "mapTrivia/roundResults": roundResults,
  };
  Object.entries(roundPoints).forEach(([uid, pts]) => {
    if (pts > 0) {
      const prevScore = room.players?.[uid]?.score || 0;
      updates[`players/${uid}/score`] = prevScore + pts;
    }
  });
  await update(roomRef(code), updates);
}

// Depois de resolvida a ronda, uma resposta escrita que não bateu certo
// automaticamente (erro de escrita, variação de nome, etc.) pode ainda
// ser aceite se a maioria dos OUTROS jogadores ligados votar que sim —
// tal como a votação de "inválida"/"engraçada" nas categorias clássicas.
// Sem transação: uma corrida rara entre dois votos que cruzam a maioria
// ao mesmo tempo podia, no pior caso, contar pontos a mais — aceitável
// dado o resto do jogo já ser "por confiança" (ver nota acima da Forca).
export async function voteAcceptMapTriviaAnswer(code, room, targetUid, voterUid) {
  const mt = room.mapTrivia;
  if (!mt || !mt.resolved || targetUid === voterUid) return;
  const existing = mt.roundResults?.[targetUid];
  if (!existing || existing.correct) return; // já certo, não precisa de voto
  await set(ref(db, `rooms/${code}/mapTrivia/votes/${targetUid}/${voterUid}`), true);
  const votes = { ...(mt.votes?.[targetUid] || {}), [voterUid]: true };
  const connectedOthers = Object.keys(room.players || {}).filter(
    (uid) => uid !== targetUid && room.players[uid].connected
  );
  const acceptCount = connectedOthers.filter((uid) => votes[uid]).length;
  const needed = Math.floor(connectedOthers.length / 2) + 1;
  if (connectedOthers.length > 0 && acceptCount >= needed) {
    const prevScore = room.players?.[targetUid]?.score || 0;
    await update(roomRef(code), {
      [`mapTrivia/roundResults/${targetUid}/correct`]: true,
      [`mapTrivia/roundResults/${targetUid}/votedIn`]: true,
      [`players/${targetUid}/score`]: prevScore + MAP_TRIVIA_POINTS,
    });
  }
}

export async function advanceMapTriviaRoundOrFinish(code, room) {
  const mt = room.mapTrivia;
  if (!mt) return;
  if (mt.roundIndex >= mt.roundsTotal) {
    await startNextBonusGame(code, room);
    return;
  }
  await update(roomRef(code), {
    mapTrivia: { roundIndex: mt.roundIndex + 1, roundsTotal: mt.roundsTotal, ...buildMapTriviaRound() },
  });
}

// --- Fuga da Infeção em equipa ---

// Posições de partida espalhadas pelos cantos/meios da arena, para nunca
// começarem encostados uns aos outros.
const TAG_SPAWN_POINTS = [
  { x: 0.15, y: 0.15 }, { x: 0.85, y: 0.15 }, { x: 0.15, y: 0.85 }, { x: 0.85, y: 0.85 },
  { x: 0.5, y: 0.15 }, { x: 0.5, y: 0.85 }, { x: 0.15, y: 0.5 }, { x: 0.85, y: 0.5 },
  { x: 0.5, y: 0.5 }, { x: 0.3, y: 0.3 },
];

export async function startTagTeam(code, room) {
  const playerIds = Object.keys(room.players || {});
  const shuffled = shuffleArray(playerIds);
  const startInfected = shuffled[0];
  const positions = {};
  playerIds.forEach((uid, i) => {
    const spot = TAG_SPAWN_POINTS[i % TAG_SPAWN_POINTS.length];
    // Fora das paredes: com a arena a ter paredes, um ponto de partida podia
    // cair dentro de uma e o jogador começava entalado.
    const livre = clampToWalls(
      Math.round(spot.x * TAG_ARENA_W), Math.round(spot.y * TAG_ARENA_H),
      TAG_PLAYER_RADIUS, TAG_WALLS,
    );
    positions[uid] = { x: livre.x, y: livre.y, updatedAt: serverNow() };
  });
  await update(roomRef(code), {
    state: "tag",
    tag: {
      arenaW: TAG_ARENA_W, arenaH: TAG_ARENA_H,
      infected: { [startInfected]: true },
      infectedAt: { [startInfected]: serverNow() },
      positions,
      powerups: {},
      effects: {},
      startedAt: serverNow(),
      endAt: serverNow() + TAG_ROUND_MS,
      lastPowerupSpawnAt: serverNow(),
      resolved: false,
    },
  });
}

export async function updateTagPosition(code, uid, x, y) {
  await update(ref(db, `rooms/${code}/tag/positions/${uid}`), { x, y, updatedAt: serverNow() });
}

// Idempotente por natureza (marcar "infetado" duas vezes não perde dados),
// por isso não precisa de transação mesmo que dois infetados apanhem o
// mesmo alvo quase ao mesmo tempo.
export async function claimTagInfection(code, targetUid) {
  await update(roomRef(code), {
    [`tag/infected/${targetUid}`]: true,
    [`tag/infectedAt/${targetUid}`]: serverNow(),
  });
}

// Um sítio livre para largar um apanhado. Agora que há paredes, o sorteio às
// cegas punha-os DENTRO delas de vez em quando — visíveis mas impossíveis de
// apanhar, o que faz o jogo parecer avariado. Tenta-se um punhado de vezes e,
// não havendo sorte, empurra-se para fora da parede mais próxima.
export function livreNaArenaDaInfecao(aleatorio = Math.random) {
  const margem = 0.12;
  const sorteia = () => ({
    x: Math.round((margem + aleatorio() * (1 - margem * 2)) * TAG_ARENA_W),
    y: Math.round((margem + aleatorio() * (1 - margem * 2)) * TAG_ARENA_H),
  });
  for (let i = 0; i < 24; i += 1) {
    const p = sorteia();
    const fora = clampToWalls(p.x, p.y, TAG_POWERUP_RADIUS, TAG_WALLS);
    if (fora.x === p.x && fora.y === p.y) return p;
  }
  const ultimo = sorteia();
  return clampToWalls(ultimo.x, ultimo.y, TAG_POWERUP_RADIUS, TAG_WALLS);
}

function randomTagPowerupSpot() {
  return livreNaArenaDaInfecao();
}

export async function spawnTagPowerup(code, room) {
  const tag = room.tag;
  if (!tag || tag.resolved) return;
  const activeCount = Object.keys(tag.powerups || {}).length;
  if (activeCount >= TAG_POWERUP_MAX_ACTIVE) return;
  const id = `p${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const type = TAG_POWERUP_TYPES[Math.floor(Math.random() * TAG_POWERUP_TYPES.length)];
  const spot = randomTagPowerupSpot();
  await update(roomRef(code), {
    [`tag/powerups/${id}`]: { type, x: spot.x, y: spot.y },
    "tag/lastPowerupSpawnAt": serverNow(),
  });
}

// Uma transação garante que, se dois jogadores chegarem ao mesmo power-up
// quase ao mesmo tempo, só um o "gasta" — o outro recebe committed:false.
export async function claimTagPowerup(code, uid, powerupId, type) {
  const result = await runTransaction(ref(db, `rooms/${code}/tag/powerups/${powerupId}`), (current) => {
    if (!current) return current; // já foi apanhado por outro
    return null;
  });
  if (!result.committed || result.snapshot.val() !== null) return false;
  const agora = serverNow();
  if (type === "teleporte") {
    // Salta para outro sítio da arena. Tira de um beco a quem foge e põe do
    // outro lado do mapa a quem persegue — é o único apanhado que muda a
    // posição em vez de mudar a velocidade, e por isso o mais surpreendente.
    const destino = livreNaArenaDaInfecao();
    await update(ref(db, `rooms/${code}/tag/positions/${uid}`), {
      x: destino.x, y: destino.y, updatedAt: agora, saltouEm: agora,
    });
    return true;
  }
  if (type === "lentidao") {
    // Trava toda a gente MENOS quem o apanhou. Vale aos dois lados: a quem
    // foge dá distância, a quem persegue dá alcance.
    await update(ref(db, `rooms/${code}/tag`), {
      lentidao: { ate: agora + TAG_LENTIDAO_MS, de: uid },
    });
    return true;
  }
  const effectField = type === "speed" ? "speedUntil" : "shieldUntil";
  const duration = type === "speed" ? TAG_SPEED_MS : TAG_SHIELD_MS;
  await update(ref(db, `rooms/${code}/tag/effects/${uid}`), { [effectField]: agora + duration });
  return true;
}

// Estou travado pela lentidão de outro? Pura, para o ecrã não ter de repetir
// a conta e para se poder testar sem browser.
export function tagTravadoPor(tag, uid, agora = Date.now()) {
  const l = tag?.lentidao;
  if (!l || !l.ate || agora >= l.ate) return false;
  return l.de !== uid;
}

// Função pura — fácil de testar sem Firebase. Pontos = segundos
// sobrevividos (até ao fim da ronda), com bónus extra para quem nunca foi
// infetado.
export function computeTagResults(room, now) {
  const tag = room.tag || {};
  const players = Object.keys(room.players || {});
  const startedAt = tag.startedAt || now;
  const endAt = tag.endAt || now;
  const roundMs = Math.max(endAt - startedAt, 1);
  const roundPoints = {};
  const survived = {};
  players.forEach((uid) => {
    const infectedAt = tag.infectedAt?.[uid];
    const survivedMs = infectedAt ? Math.max(0, infectedAt - startedAt) : roundMs;
    const seconds = Math.round(Math.min(survivedMs, roundMs) / 1000);
    const neverInfected = !infectedAt;
    survived[uid] = neverInfected;
    roundPoints[uid] = seconds * TAG_POINTS_PER_SECOND + (neverInfected ? TAG_SURVIVOR_BONUS : 0);
  });
  return { roundPoints, survived };
}

export async function resolveTagRound(code, room) {
  const tag = room.tag;
  if (!tag || tag.resolved) return;
  const now = serverNow();
  const { roundPoints, survived } = computeTagResults(room, now);
  const updates = { "tag/resolved": true, "tag/resolvedAt": now, "tag/survived": survived, "tag/roundPoints": roundPoints };
  Object.entries(roundPoints).forEach(([uid, pts]) => {
    if (pts > 0) {
      const prevScore = room.players?.[uid]?.score || 0;
      updates[`players/${uid}/score`] = prevScore + pts;
    }
  });
  await update(roomRef(code), updates);
}

export async function finishTagRound(code, room) {
  await startNextBonusGame(code, room);
}

// --- Labirinto: Batalha em equipa ---

// Função pura (sem Firebase) — dado um ponto e um raio, empurra-o para fora
// de qualquer parede em que esteja metido, ao longo do eixo com menor
// sobreposição. Usada tanto para validar pontos de surgimento de armas como
// para resolver colisões de movimento no cliente (ver app.js).
// Empurra um ponto para fora das paredes. Serve os dois jogos de arena — o
// Labirinto e a Fuga da Infeção — porque a regra é a mesma e duplicá-la era
// arranjar maneira de as duas divergirem à primeira correção.
export function clampToWalls(x, y, radius, walls) {
  let px = x;
  let py = y;
  for (const wall of walls) {
    const left = wall.x - radius;
    const right = wall.x + wall.w + radius;
    const top = wall.y - radius;
    const bottom = wall.y + wall.h + radius;
    if (px > left && px < right && py > top && py < bottom) {
      const overlapLeft = px - left;
      const overlapRight = right - px;
      const overlapTop = py - top;
      const overlapBottom = bottom - py;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft) px = left;
      else if (minOverlap === overlapRight) px = right;
      else if (minOverlap === overlapTop) py = top;
      else py = bottom;
    }
  }
  return { x: px, y: py };
}

export function battleClampToWalls(x, y, radius) {
  return clampToWalls(x, y, radius, BATTLE_WALLS);
}

export function tagClampToWalls(x, y, radius) {
  return clampToWalls(x, y, radius, TAG_WALLS);
}


const BATTLE_SPAWN_POINTS = [
  { x: 0.071, y: 0.111 }, { x: 0.929, y: 0.111 }, { x: 0.071, y: 0.889 }, { x: 0.929, y: 0.889 },
  { x: 0.5, y: 0.111 }, { x: 0.5, y: 0.889 }, { x: 0.5, y: 0.5 },
  { x: 0.286, y: 0.5 }, { x: 0.714, y: 0.5 }, { x: 0.286, y: 0.778 },
];

export async function startBattleTeam(code, room) {
  const playerIds = Object.keys(room.players || {});
  const shuffled = shuffleArray(playerIds);
  const positions = {};
  const lives = {};
  shuffled.forEach((uid, i) => {
    const spot = BATTLE_SPAWN_POINTS[i % BATTLE_SPAWN_POINTS.length];
    positions[uid] = { x: Math.round(spot.x * BATTLE_ARENA_W), y: Math.round(spot.y * BATTLE_ARENA_H), updatedAt: serverNow() };
    lives[uid] = BATTLE_LIVES;
  });
  await update(roomRef(code), {
    state: "battle",
    battle: {
      arenaW: BATTLE_ARENA_W, arenaH: BATTLE_ARENA_H,
      positions, lives,
      armed: {}, eliminated: {}, eliminatedAt: {}, kills: {},
      // Os golpes e os baques da ronda anterior não podem aparecer na
      // primeira imagem da nova: começam limpos.
      golpes: {}, baques: {},
      weapons: {},
      startedAt: serverNow(),
      endAt: serverNow() + BATTLE_ROUND_MS,
      lastWeaponSpawnAt: serverNow(),
      resolved: false,
    },
  });
}

export async function updateBattlePosition(code, uid, x, y) {
  await update(ref(db, `rooms/${code}/battle/positions/${uid}`), { x, y, updatedAt: serverNow() });
}

function randomBattleWeaponSpot() {
  const margin = 0.06;
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = Math.round((margin + Math.random() * (1 - margin * 2)) * BATTLE_ARENA_W);
    const y = Math.round((margin + Math.random() * (1 - margin * 2)) * BATTLE_ARENA_H);
    const resolved = battleClampToWalls(x, y, BATTLE_WEAPON_RADIUS + 6);
    if (resolved.x === x && resolved.y === y) return { x, y };
  }
  return { x: Math.round(BATTLE_ARENA_W / 2), y: Math.round(BATTLE_ARENA_H / 2) };
}

export async function spawnBattleWeapon(code, room) {
  const battle = room.battle;
  if (!battle || battle.resolved) return;
  const activeCount = Object.keys(battle.weapons || {}).length;
  if (activeCount >= BATTLE_WEAPON_MAX_ACTIVE) return;
  const id = `w${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const spot = randomBattleWeaponSpot();
  await update(roomRef(code), {
    [`battle/weapons/${id}`]: { x: spot.x, y: spot.y },
    "battle/lastWeaponSpawnAt": serverNow(),
  });
}

// Uma transação garante que, se dois jogadores chegarem à mesma arma quase
// ao mesmo tempo, só um a apanha.
export async function claimBattleWeapon(code, uid, weaponId) {
  const result = await runTransaction(ref(db, `rooms/${code}/battle/weapons/${weaponId}`), (current) => {
    if (!current) return current; // já foi apanhada por outro
    return null;
  });
  if (!result.committed || result.snapshot.val() !== null) return false;
  await update(ref(db, `rooms/${code}/battle/armed`), { [uid]: serverNow() + BATTLE_ARMED_MS });
  return true;
}

// Uma transação sobre as vidas do alvo garante que, se dois atacantes
// acertarem golpes quase ao mesmo tempo, só uma vida se perde de cada vez
// (em vez de possivelmente contar os dois golpes em simultâneo).
// Quanto tempo dura, no ecrã, o golpe e o baque. Curtos de propósito: são
// para se ver que aconteceu alguma coisa, não para atrapalhar o que vem a
// seguir num jogo em que se está sempre a fugir.
export const BATTLE_GOLPE_MS = 220;
export const BATTLE_BAQUE_MS = 320;

// O GOLPE VIAJA. Antes o ataque era invisível: quem batia via o seu próprio
// contador interno a mexer e mais nada, e quem levava só via as vidas a
// descer sem perceber de onde tinha vindo. Um jogo de pancada em que não se
// vê a pancada.
export async function registarGolpe(code, uid) {
  await update(ref(db, `rooms/${code}/battle/golpes`), { [uid]: serverNow() });
}

export async function claimBattleHit(code, room, attackerUid, targetUid) {
  if (attackerUid === targetUid) return;
  const battle = room.battle;
  if (!battle || battle.resolved) return;
  if (battle.eliminated?.[targetUid]) return;
  if (!battle.armed?.[attackerUid] || battle.armed[attackerUid] < serverNow()) return;
  const result = await runTransaction(ref(db, `rooms/${code}/battle/lives/${targetUid}`), (current) => {
    const lives = typeof current === "number" ? current : BATTLE_LIVES;
    if (lives <= 0) return current;
    return lives - 1;
  });
  if (!result.committed) return;
  const newLives = result.snapshot.val();
  // O baque marca-se SEMPRE que se acerta, mesmo que a pessoa sobreviva: é o
  // que diz a quem levou que levou, e a quem bateu que acertou.
  await update(ref(db, `rooms/${code}/battle/baques`), {
    [targetUid]: { em: serverNow(), de: attackerUid },
  });
  if (newLives === null || newLives > 0) return; // ainda vivo, nada mais a fazer
  const prevKills = room.battle?.kills?.[attackerUid] || 0;
  await update(roomRef(code), {
    [`battle/eliminated/${targetUid}`]: true,
    [`battle/eliminatedAt/${targetUid}`]: serverNow(),
    [`battle/kills/${attackerUid}`]: prevKills + 1,
  });
}

// Função pura — fácil de testar sem Firebase. Pontos = segundos
// sobrevividos + bónus por abate + bónus extra para quem sobrevive à ronda
// toda (nunca eliminado).
export function computeBattleResults(room, now) {
  const battle = room.battle || {};
  const players = Object.keys(room.players || {});
  const startedAt = battle.startedAt || now;
  const endAt = battle.endAt || now;
  const roundMs = Math.max(endAt - startedAt, 1);
  const roundPoints = {};
  const alive = {};
  players.forEach((uid) => {
    const eliminatedAt = battle.eliminatedAt?.[uid];
    const survivedMs = eliminatedAt ? Math.max(0, eliminatedAt - startedAt) : roundMs;
    const seconds = Math.round(Math.min(survivedMs, roundMs) / 1000);
    const isAlive = !eliminatedAt;
    const kills = battle.kills?.[uid] || 0;
    alive[uid] = isAlive;
    roundPoints[uid] = seconds * BATTLE_POINTS_PER_SECOND + kills * BATTLE_KILL_POINTS + (isAlive ? BATTLE_SURVIVOR_BONUS : 0);
  });
  return { roundPoints, alive };
}

export async function resolveBattleRound(code, room) {
  const battle = room.battle;
  if (!battle || battle.resolved) return;
  const now = serverNow();
  const { roundPoints, alive } = computeBattleResults(room, now);
  const updates = {
    "battle/resolved": true, "battle/resolvedAt": now,
    "battle/alive": alive, "battle/roundPoints": roundPoints,
  };
  Object.entries(roundPoints).forEach(([uid, pts]) => {
    if (pts > 0) {
      const prevScore = room.players?.[uid]?.score || 0;
      updates[`players/${uid}/score`] = prevScore + pts;
    }
  });
  await update(roomRef(code), updates);
}

export async function finishBattleRound(code, room) {
  await startNextBonusGame(code, room);
}

// --- Estrada Maluca em equipa ---

// Gerador determinístico: dada a mesma semente e o mesmo índice de
// obstáculo, todos os clientes têm de chegar à MESMA faixa. Um xorshift
// simples chega — não é criptografia, é só ruído reprodutível.
export function raceObstacleLane(seed, index) {
  let x = ((seed >>> 0) ^ Math.imul(index + 1, 2654435761)) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x % RACE_LANES;
}

// Intervalo entre obstáculos no instante t (ms de corrida). Aperta com o
// tempo, tal como no modo sozinho.
export function raceSpawnIntervalAt(elapsedMs) {
  return Math.max(
    RACE_SPAWN_INTERVAL_MIN_MS,
    RACE_SPAWN_INTERVAL_START_MS - (elapsedMs / 1000) * RACE_SPAWN_RAMP_MS_PER_S
  );
}

export function raceSpeedAt(elapsedMs) {
  return Math.min(RACE_MAX_SPEED, RACE_BASE_SPEED + (elapsedMs / 1000) * RACE_SPEED_RAMP);
}

export async function startRaceGame(code, room) {
  const playerIds = Object.keys(room.players || {});
  const racers = {};
  playerIds.forEach((uid) => {
    racers[uid] = { lane: 1, alive: true, timeMs: 0, updatedAt: serverNow() };
  });
  await update(roomRef(code), {
    state: "race",
    race: {
      seed: Math.floor(Math.random() * 2147483647),
      startedAt: serverNow(),
      endAt: serverNow() + RACE_MAX_MS,
      racers,
      resolved: false,
    },
  });
}

// Cada cliente só escreve a SUA linha (posição/tempo), nunca a dos outros.
export async function updateRacer(code, uid, lane, timeMs) {
  await update(ref(db, `rooms/${code}/race/racers/${uid}`), {
    lane, timeMs: Math.round(timeMs), updatedAt: serverNow(),
  });
}

// A batida é detetada localmente (é a estrada de quem joga) e só depois
// registada. Idempotente: bater duas vezes não muda nada.
//
// O tempo da batida vai para um campo SÓ SEU (crashTimeMs), que o
// updateRacer nunca toca. Sem isso, um envio de posição já a caminho podia
// aterrar depois da batida e reescrever um tempo menor por cima — o jogador
// perdia segundos que tinha mesmo aguentado.
// Bater duas vezes não é bater mais longe. Quem já está fora fica com o tempo
// do embate que teve — sem esta guarda, um segundo embate (o do jogo a
// detetar a colisão e o de um pedido atrasado, por exemplo) reescrevia o
// tempo DEPOIS de a classificação já ter sido calculada com o primeiro, e a
// tabela final deixava de bater certo com os tempos guardados.
export async function crashRacer(code, uid, timeMs, room) {
  if (room && room.race?.racers?.[uid]?.alive === false) return;
  return crashRacerNow(code, uid, timeMs);
}

async function crashRacerNow(code, uid, timeMs) {
  // A PRIMEIRA BATIDA É A BATIDA. Vai por transação e não por escrita directa
  // porque só a leitura-e-escrita atómica garante que uma segunda batida não
  // reescreve o tempo da primeira. Sem isto, uma chamada atrasada aterrava
  // depois da ronda já contada e trocava o tempo com que a classificação
  // tinha sido feita — os resultados no ecrã deixavam de bater certo com os
  // números guardados, e quem olhasse para os dois via o jogo a mentir.
  await runTransaction(ref(db, `rooms/${code}/race/racers/${uid}`), (atual) => {
    if (!atual || atual.alive === false) return undefined; // já bateu: fica como está
    return { ...atual, alive: false, crashTimeMs: Math.round(timeMs), crashedAt: serverNow() };
  });
}

// O tempo que conta: o da batida, se já bateu; senão o último transmitido.
export function racerTimeMs(racer) {
  if (!racer) return 0;
  return racer.crashTimeMs ?? racer.timeMs ?? 0;
}

// Função pura — pontos = segundos aguentados, mais um bónus de pódio para
// os três que foram mais longe. Empates ficam com a mesma classificação.
export function computeRaceResults(room) {
  const race = room.race || {};
  const players = Object.keys(room.players || {});
  const ranked = players
    .map((uid) => ({ uid, timeMs: racerTimeMs(race.racers?.[uid]) }))
    .sort((a, b) => b.timeMs - a.timeMs);
  const roundPoints = {};
  const standings = {};
  let place = 0;
  let lastTime = null;
  ranked.forEach((entry, i) => {
    if (entry.timeMs !== lastTime) { place = i; lastTime = entry.timeMs; }
    const seconds = Math.floor(entry.timeMs / 1000);
    const podium = entry.timeMs > 0 ? (RACE_PODIUM_BONUS[place] || 0) : 0;
    roundPoints[entry.uid] = seconds * RACE_POINTS_PER_SECOND + podium;
    standings[entry.uid] = { place: place + 1, timeMs: entry.timeMs, podium };
  });
  return { roundPoints, standings };
}

export async function resolveRaceRound(code, room) {
  if (!room.race || room.race.resolved) return;
  // Relê a sala antes de contar. O instantâneo em memória do anfitrião pode
  // estar meio passo atrás da escrita que acabou de terminar a corrida — e
  // nesse caso o tempo com que o último jogador bateu ainda lá não está, o
  // que dava uma classificação final errada (e injusta com quem ganhou).
  const snap = await get(roomRef(code));
  const fresh = snap.exists() ? snap.val() : room;
  const race = fresh.race;
  if (!race || race.resolved) return;
  const { roundPoints, standings } = computeRaceResults(fresh);
  const updates = {
    "race/resolved": true,
    "race/resolvedAt": serverNow(),
    "race/roundPoints": roundPoints,
    "race/standings": standings,
  };
  Object.entries(roundPoints).forEach(([uid, pts]) => {
    if (pts > 0) {
      const prevScore = fresh.players?.[uid]?.score || 0;
      updates[`players/${uid}/score`] = prevScore + pts;
    }
  });
  await update(roomRef(code), updates);
}

export async function finishRaceRound(code, room) {
  await startNextBonusGame(code, room);
}

// --- Mini-Golfe em equipa ---
//
// Todos jogam o MESMO buraco ao mesmo tempo, cada um com a sua bola, todas
// visíveis. As bolas não colidem entre si — o que os jogadores usam uns
// contra os outros são os dois power-ups espalhados pelo campo:
//   • barreira: larga uma parede temporária onde estás, a cortar o caminho
//     a quem vem atrás;
//   • interruptor: desliga os comandos de toda a gente menos os teus,
//     durante uns segundos.
// Cada cliente simula a SUA bola e transmite só a posição, como na Fuga e
// na Batalha; as barreiras e os congelamentos são estado partilhado, por
// isso valem para todos.

// O CAMPO CRESCEU E GANHOU TERRENO. Era um corredor de 1600x900 a direito,
// da esquerda para a direita, com seis paredes pelo meio: chegava-se ao
// buraco em linha reta e o jogo acabava antes de começar. "Demasiado simples,
// monótono e curto", nas palavras de quem o jogou.
//
// Agora é um percurso com voltas, e sobretudo com TERRENO — que é o que
// separa um campo de um corredor. Cada tipo de chão faz uma coisa à bola, e
// é a soma deles que dá caminhos diferentes para o mesmo buraco: pelo meio,
// depressa e arriscado; por fora, devagar e seguro.
export const GOLF_MP_COURSE_W = 2400;
export const GOLF_MP_COURSE_H = 1200;
export const GOLF_MP_BALL_RADIUS = 9;
export const GOLF_MP_HOLE_RADIUS = 16;
export const GOLF_MP_START = { x: 90, y: 1090 };
export const GOLF_MP_HOLE = { x: 2300, y: 110 };
export const GOLF_MP_ROUND_MS = 90000;
export const GOLF_MP_RESULT_DISPLAY_MS = 6000;
export const GOLF_MP_FINISH_POINTS = [25, 16, 10, 6];
export const GOLF_MP_FINISH_POINTS_MIN = 3;
export const GOLF_MP_POWERUP_RADIUS = 16;
export const GOLF_MP_POWERUP_MAX_ACTIVE = 4;
export const GOLF_MP_POWERUP_SPAWN_INTERVAL_MS = 5000;
export const GOLF_MP_POWERUP_TYPES = ["barrier", "offswitch"];
export const GOLF_MP_BARRIER_MS = 7000;
export const GOLF_MP_BARRIER_W = 24;
export const GOLF_MP_BARRIER_H = 190;
export const GOLF_MP_OFFSWITCH_MS = 2600;
export const GOLF_MP_BROADCAST_MS = 120;

// Paredes fixas do campo, iguais para todos. Desenhadas como um caminho em S:
// sobe-se pela esquerda, atravessa-se o meio e desce-se pela direita, com
// atalhos por dentro para quem se atrever.
export const GOLF_MP_WALLS = [
  { x: 320, y: 620, w: 24, h: 580 },
  { x: 320, y: 240, w: 24, h: 260 },
  { x: 640, y: 0, w: 24, h: 620 },
  { x: 640, y: 800, w: 24, h: 400 },
  { x: 960, y: 300, w: 24, h: 900 },
  { x: 1280, y: 0, w: 24, h: 700 },
  { x: 1280, y: 880, w: 24, h: 320 },
  { x: 1600, y: 200, w: 24, h: 800 },
  { x: 1920, y: 0, w: 24, h: 520 },
  { x: 1920, y: 700, w: 24, h: 500 },
  { x: 340, y: 240, w: 300, h: 24 },
  { x: 980, y: 880, w: 300, h: 24 },
  { x: 1620, y: 200, w: 300, h: 24 },
];

// O TERRENO. Cada tipo faz uma coisa só, e faz-se notar:
//
//   acelerador — o chão empurra na direção da seta. É o que dá a sensação de
//                velocidade que faltava, e o que permite atravessar o campo
//                num lance em vez de cinco.
//   saltitao   — bate e devolve, com mais força do que levou. Um obstáculo
//                que castiga sem prender: nunca deixa a bola encravada.
//   areia      — trava a sério. É o preço do atalho: o caminho curto passa
//                aqui, o comprido não.
//
// São dados e não código para se poderem desenhar novos campos sem tocar na
// física — e para os testes poderem medir o campo em vez de o adivinhar.
export const GOLF_MP_ACELERADORES = [
  { x: 120, y: 700, w: 170, h: 120, dx: 0, dy: -1 },
  { x: 700, y: 120, w: 220, h: 120, dx: 1, dy: 0 },
  { x: 1020, y: 980, w: 220, h: 120, dx: 1, dy: 0 },
  { x: 1360, y: 300, w: 200, h: 120, dx: 0, dy: -1 },
  { x: 1990, y: 560, w: 200, h: 120, dx: 1, dy: 0 },
  { x: 380, y: 980, w: 220, h: 110, dx: 1, dy: 0 },
];
export const GOLF_MP_SALTITOES = [
  { x: 480, y: 480, r: 42 },
  { x: 820, y: 760, r: 42 },
  { x: 1130, y: 240, r: 46 },
  { x: 1450, y: 820, r: 42 },
  { x: 1780, y: 420, r: 46 },
  { x: 2120, y: 900, r: 42 },
];
export const GOLF_MP_AREIAS = [
  { x: 700, y: 380, w: 220, h: 200 },
  { x: 1340, y: 620, w: 220, h: 200 },
  { x: 1660, y: 900, w: 240, h: 220 },
  { x: 2000, y: 180, w: 260, h: 200 },
];
// Quanto cada terreno mexe com a bola.
export const GOLF_MP_EMPURRAO = 1500;   // aceleração do chão, por segundo
export const GOLF_MP_SALTO = 1.15;      // devolve com 15% mais do que levou
export const GOLF_MP_AREIA_TRAVAO = 0.965; // por quadro de imagem, composto

// O que o TERRENO faz à bola num quadro de imagem. Pura de propósito: a
// física do golfe corre no browser de cada um, mas a regra é uma só, e uma
// regra que se pode medir sem browser é uma regra que se pode confiar.
//
// Devolve a velocidade nova. Não mexe na posição — disso trata quem chama,
// que é quem sabe do choque com as paredes.
export function golfTerreno(x, y, vx, vy, dt) {
  let nvx = vx;
  let nvy = vy;
  // Aceleradores: o chão empurra, e empurra mesmo que a bola esteja parada —
  // é o que os torna um caminho e não só um bónus.
  for (const a of GOLF_MP_ACELERADORES) {
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
      nvx += a.dx * GOLF_MP_EMPURRAO * dt;
      nvy += a.dy * GOLF_MP_EMPURRAO * dt;
    }
  }
  // Areia: trava a sério, mas nunca prende. Um travão que chegasse a zero
  // deixava a bola morta no meio do campo sem nada a fazer.
  for (const s of GOLF_MP_AREIAS) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
      const travao = GOLF_MP_AREIA_TRAVAO ** (dt * 60);
      nvx *= travao;
      nvy *= travao;
    }
  }
  return { vx: nvx, vy: nvy };
}

// Os saltitões devolvem a bola. Separado do resto porque muda a POSIÇÃO além
// da velocidade: a bola tem de sair de dentro do saltitão, senão ficava lá a
// bater para sempre.
export function golfSaltitao(x, y, vx, vy, raioDaBola) {
  for (const b of GOLF_MP_SALTITOES) {
    const dx = x - b.x;
    const dy = y - b.y;
    const dist = Math.hypot(dx, dy);
    const limite = b.r + raioDaBola;
    if (dist === 0 || dist >= limite) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    // Reflete a velocidade na normal e devolve com um pouco mais do que levou.
    const projecao = vx * nx + vy * ny;
    const rvx = (vx - 2 * projecao * nx) * GOLF_MP_SALTO;
    const rvy = (vy - 2 * projecao * ny) * GOLF_MP_SALTO;
    return { x: b.x + nx * limite, y: b.y + ny * limite, vx: rvx, vy: rvy, bateu: true };
  }
  return { x, y, vx, vy, bateu: false };
}

export async function startGolfTeam(code, room) {
  const balls = {};
  Object.keys(room.players || {}).forEach((uid) => {
    balls[uid] = { x: GOLF_MP_START.x, y: GOLF_MP_START.y, updatedAt: serverNow() };
  });
  await update(roomRef(code), {
    state: "golf",
    golf: {
      courseW: GOLF_MP_COURSE_W, courseH: GOLF_MP_COURSE_H,
      balls,
      finished: {},
      powerups: {},
      barriers: {},
      charges: {},
      frozenUntil: {},
      startedAt: serverNow(),
      endAt: serverNow() + GOLF_MP_ROUND_MS,
      lastPowerupSpawnAt: serverNow(),
      resolved: false,
    },
  });
}

export async function updateGolfBall(code, uid, x, y) {
  await update(ref(db, `rooms/${code}/golf/balls/${uid}`), { x, y, updatedAt: serverNow() });
}

// Quem chega ao buraco fica com o tempo registado; a ordem de chegada é o
// que decide os pontos. Idempotente: só grava a primeira vez.
export async function claimGolfFinish(code, room, uid) {
  if (room.golf?.finished?.[uid]) return;
  await set(ref(db, `rooms/${code}/golf/finished/${uid}`), serverNow() - (room.golf?.startedAt || 0));
}

function randomGolfPowerupSpot() {
  const margin = 0.15;
  return {
    x: Math.round((margin + Math.random() * (1 - margin * 2)) * GOLF_MP_COURSE_W),
    y: Math.round((margin + Math.random() * (1 - margin * 2)) * GOLF_MP_COURSE_H),
  };
}

export async function spawnGolfPowerup(code, room) {
  const golf = room.golf;
  if (!golf || golf.resolved) return;
  if (Object.keys(golf.powerups || {}).length >= GOLF_MP_POWERUP_MAX_ACTIVE) return;
  const id = `g${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const type = GOLF_MP_POWERUP_TYPES[Math.floor(Math.random() * GOLF_MP_POWERUP_TYPES.length)];
  const spot = randomGolfPowerupSpot();
  await update(roomRef(code), {
    [`golf/powerups/${id}`]: { type, x: spot.x, y: spot.y },
    "golf/lastPowerupSpawnAt": serverNow(),
  });
}

// Transação: se duas bolas passarem pelo mesmo power-up quase ao mesmo
// tempo, só uma o leva. Guarda-se como "carga" — quem apanha decide quando
// usar, o que é metade da graça.
export async function claimGolfPowerup(code, uid, powerupId, type) {
  const result = await runTransaction(ref(db, `rooms/${code}/golf/powerups/${powerupId}`), (current) => {
    if (!current) return current; // já apanhado
    return null;
  });
  if (!result.committed || result.snapshot.val() !== null) return false;
  await set(ref(db, `rooms/${code}/golf/charges/${uid}`), type);
  return true;
}

// Usar a carga. A barreira nasce onde estás (a cortar o caminho a quem vem
// atrás); o interruptor congela toda a gente MENOS quem o usou.
export async function useGolfCharge(code, room, uid, x, y) {
  const golf = room.golf;
  const type = golf?.charges?.[uid];
  if (!golf || golf.resolved || !type) return null;
  const updates = { [`golf/charges/${uid}`]: null };
  if (type === "barrier") {
    const id = `b${Date.now()}${Math.floor(Math.random() * 1000)}`;
    updates[`golf/barriers/${id}`] = {
      x: Math.round(Math.max(0, Math.min(GOLF_MP_COURSE_W - GOLF_MP_BARRIER_W, x - GOLF_MP_BARRIER_W / 2))),
      y: Math.round(Math.max(0, Math.min(GOLF_MP_COURSE_H - GOLF_MP_BARRIER_H, y - GOLF_MP_BARRIER_H / 2))),
      w: GOLF_MP_BARRIER_W,
      h: GOLF_MP_BARRIER_H,
      until: serverNow() + GOLF_MP_BARRIER_MS,
      byId: uid,
    };
  } else {
    const until = serverNow() + GOLF_MP_OFFSWITCH_MS;
    Object.keys(room.players || {}).forEach((other) => {
      if (other !== uid && !golf.finished?.[other]) updates[`golf/frozenUntil/${other}`] = until;
    });
  }
  await update(roomRef(code), updates);
  return type;
}

// Limpa barreiras cujo tempo passou. Chamado pelo anfitrião, como o resto
// da manutenção da ronda.
export async function pruneGolfBarriers(code, room) {
  const barriers = room.golf?.barriers || {};
  const now = serverNow();
  const updates = {};
  Object.entries(barriers).forEach(([id, b]) => {
    if ((b.until || 0) <= now) updates[`golf/barriers/${id}`] = null;
  });
  if (Object.keys(updates).length > 0) await update(roomRef(code), updates);
}

// As paredes que valem AGORA: as fixas do campo mais as barreiras que ainda
// não expiraram. Função pura — a mesma que o cliente usa para as colisões.
export function golfActiveWalls(golf, now) {
  const barriers = Object.values(golf?.barriers || {})
    .filter((b) => (b.until || 0) > now)
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  return [...GOLF_MP_WALLS, ...barriers];
}

// Função pura. Quem acaba leva pontos pela ordem de chegada; quem não acaba
// leva pontos pela distância a que ficou do buraco, para não sair de mãos a
// abanar por ter apanhado uma barreira mesmo no fim.
export function computeGolfResults(room) {
  const golf = room.golf || {};
  const players = Object.keys(room.players || {});
  const finishers = players
    .filter((uid) => golf.finished?.[uid] !== undefined)
    .sort((a, b) => golf.finished[a] - golf.finished[b]);
  const roundPoints = {};
  const standings = {};
  finishers.forEach((uid, i) => {
    const pts = GOLF_MP_FINISH_POINTS[i] ?? GOLF_MP_FINISH_POINTS_MIN;
    roundPoints[uid] = pts;
    standings[uid] = { place: i + 1, timeMs: golf.finished[uid], finished: true };
  });
  players
    .filter((uid) => golf.finished?.[uid] === undefined)
    .map((uid) => {
      const ball = golf.balls?.[uid] || GOLF_MP_START;
      const dx = GOLF_MP_HOLE.x - ball.x;
      const dy = GOLF_MP_HOLE.y - ball.y;
      return { uid, dist: Math.sqrt(dx * dx + dy * dy) };
    })
    .sort((a, b) => a.dist - b.dist)
    .forEach((entry, i) => {
      roundPoints[entry.uid] = i === 0 ? 2 : 1;
      standings[entry.uid] = {
        place: finishers.length + i + 1,
        finished: false,
        distance: Math.round(entry.dist),
      };
    });
  return { roundPoints, standings };
}

export async function resolveGolfRound(code, room) {
  if (!room.golf || room.golf.resolved) return;
  // Relê antes de contar, pelo mesmo motivo da corrida: a bola que entrou a
  // fechar a ronda pode ainda não estar no instantâneo em memória.
  const snap = await get(roomRef(code));
  const fresh = snap.exists() ? snap.val() : room;
  if (!fresh.golf || fresh.golf.resolved) return;
  const { roundPoints, standings } = computeGolfResults(fresh);
  const updates = {
    "golf/resolved": true,
    "golf/resolvedAt": serverNow(),
    "golf/roundPoints": roundPoints,
    "golf/standings": standings,
  };
  Object.entries(roundPoints).forEach(([uid, pts]) => {
    if (pts > 0) {
      const prevScore = fresh.players?.[uid]?.score || 0;
      updates[`players/${uid}/score`] = prevScore + pts;
    }
  });
  await update(roomRef(code), updates);
}

export async function finishGolfRound(code, room) {
  await startNextBonusGame(code, room);
}

// --- O MAPA-MÚNDI PARTILHADO ---
//
// O mesmo mapa do modo sozinho, mas com toda a gente a conquistar ao mesmo
// tempo. Cada país só pode ser de um, e quem chega primeiro fica com ele.
//
// O que está aqui é a REGRA, e é de propósito que não sabe nada de ecrãs: as
// contas do roubo, dos pontos e da classificação testam-se sem browser
// nenhum, e o mapa-ecra.js só chama e desenha.
//
// A escrita segue o modelo do resto da sala — cada um escreve o seu — com uma
// diferença: um país conquistado NUNCA é reescrito por outro jogador. Quem
// tenta escrever por cima perde a escrita, e o mapa fica como estava.

// Errar em cima de um país deixa-o em causa por uns segundos: quem o nomear
// nessa janela leva o dobro. É o que faz valer a pena estar atento ao que os
// outros estão a errar, em vez de cada um jogar sozinho ao lado dos outros.
// Os nomes dos países são a chave no Firebase. Hoje nenhum dos 177 tem um
// caractere proibido (. $ # [ ] /) e há um teste que o confirma — mas os
// dados são gerados, e o dia em que entrar um "R.D. Congo" não pode ser o dia
// em que a sala deixa de guardar conquistas em silêncio.
export function chaveDePais(nome) {
  return String(nome).replace(/[.$#[\]/]/g, "_");
}

// De quanto em quanto tempo é que a Dona Manga rouba um país. Noventa
// segundos: pouco de mais e o mapa nunca fica feito, muito de mais e ninguém
// dá por ela.
export const MAPA_MANGA_CADA_MS = 90000;
export const MAPA_ROUBO_MS = 8000;
export const MAPA_ROUBO_FATOR = 2;

export function mapaEstadoInicial(modo = "mundo", dificuldade = "livre") {
  return { modo, dificuldade, donos: {}, pistas: [], abertos: {}, marcadores: {}, comecouEm: Date.now() };
}

export function mapaDono(room, nomePais) {
  return room?.mapa?.donos?.[chaveDePais(nomePais)] || null;
}

// Está em causa? Só se alguém errou nele há pouco E ainda não tem dono.
export function mapaEmCausa(room, nomePais, agora = Date.now()) {
  const aberto = room?.mapa?.abertos?.[chaveDePais(nomePais)];
  if (!aberto || mapaDono(room, nomePais)) return false;
  return agora < (aberto.ate || 0);
}

// Quem pode ficar com o país. Sem dono, qualquer um; com dono, ninguém — nem
// o próprio, que já o tem.
export function mapaPodeConquistar(room, nomePais) {
  return !mapaDono(room, nomePais);
}

// Quanto vale AQUI, na sala: os pontos que o motor calculou, a dobrar se o
// país estava em causa por alguém ter falhado nele. Quem falhou não leva o
// dobro do seu próprio erro.
export function mapaPontosNaSala(room, nomePais, uid, pontosBase, agora = Date.now()) {
  const aberto = room?.mapa?.abertos?.[chaveDePais(nomePais)];
  const roubo = mapaEmCausa(room, nomePais, agora) && aberto.porCausaDe !== uid;
  return { pontos: roubo ? pontosBase * MAPA_ROUBO_FATOR : pontosBase, roubo };
}

// A classificação da sala: quem tem mais países, com os pontos a desempatar
// ao contrário do que se espera — quem sabe mais países ganha a quem fez mais
// pontos com poucos, porque o jogo é sobre saber o mapa.
export function mapaClassificacao(room) {
  const marcadores = room?.mapa?.marcadores || {};
  const contagem = {};
  Object.values(room?.mapa?.donos || {}).forEach((uid) => {
    contagem[uid] = (contagem[uid] || 0) + 1;
  });
  const uids = new Set([...Object.keys(marcadores), ...Object.keys(contagem)]);
  return [...uids]
    .map((uid) => ({
      uid,
      nome: room?.players?.[uid]?.name || "?",
      paises: contagem[uid] || 0,
      pontos: marcadores[uid]?.pontos || 0,
      erros: marcadores[uid]?.erros || 0,
      melhorCadeia: marcadores[uid]?.melhorCadeia || 0,
    }))
    .sort((a, b) => b.paises - a.paises || b.pontos - a.pontos || a.erros - b.erros);
}

export async function startMapaTeam(code, room, modo = "mundo", dificuldade = "livre") {
  await update(roomRef(code), {
    state: "mapa",
    mapa: mapaEstadoInicial(modo, dificuldade),
    stateChangedAt: serverNow(),
  });
}

// Conquistar. Vai por transação porque é o ÚNICO sítio do jogo onde dois
// jogadores podem escrever a mesma coisa ao mesmo tempo e um tem de perder:
// dois a escrever "Brasil" no mesmo segundo não podem ficar os dois com ele.
export async function mapaConquistar(code, uid, nomePais, pontosBase, agora = Date.now()) {
  // A sala LÊ-SE ANTES de se escrever o dono. Depois da transação o país já
  // tem dono — o deste jogador — e "está em causa?" respondia sempre que não,
  // que é o mesmo que dizer que o roubo nunca valia o dobro. O que interessa é
  // como estava o país no momento em que a resposta foi dada.
  const antes = await get(roomRef(code));
  const room = antes.exists() ? antes.val() : null;
  const { pontos, roubo } = mapaPontosNaSala(room, nomePais, uid, pontosBase, agora);
  const donoRef = ref(db, `rooms/${code}/mapa/donos/${chaveDePais(nomePais)}`);
  const res = await runTransaction(donoRef, (atual) => (atual ? undefined : uid));
  if (!res.committed || res.snapshot.val() !== uid) return { ganhou: false, pontos: 0, roubo: false };
  const marcador = room?.mapa?.marcadores?.[uid] || {};
  const cadeia = (marcador.cadeia || 0) + 1;
  await update(roomRef(code), {
    [`mapa/abertos/${chaveDePais(nomePais)}`]: null,
    [`mapa/marcadores/${uid}/pontos`]: (marcador.pontos || 0) + pontos,
    [`mapa/marcadores/${uid}/certos`]: (marcador.certos || 0) + 1,
    [`mapa/marcadores/${uid}/cadeia`]: cadeia,
    [`mapa/marcadores/${uid}/melhorCadeia`]: Math.max(marcador.melhorCadeia || 0, cadeia),
  });
  return { ganhou: true, pontos, roubo };
}

// Errar. Além de partir a sequência de quem errou, põe o país em causa — e é
// aqui que a sala fica interessante, porque o erro de um é a oportunidade de
// outro.
export async function mapaErrar(code, uid, nomePais, agora = Date.now()) {
  const snap = await get(roomRef(code));
  const room = snap.exists() ? snap.val() : null;
  const marcador = room?.mapa?.marcadores?.[uid] || {};
  const updates = {
    [`mapa/marcadores/${uid}/erros`]: (marcador.erros || 0) + 1,
    [`mapa/marcadores/${uid}/cadeia`]: 0,
  };
  if (nomePais && !mapaDono(room, nomePais)) {
    updates[`mapa/abertos/${chaveDePais(nomePais)}`] = { ate: agora + MAPA_ROUBO_MS, porCausaDe: uid };
  }
  await update(roomRef(code), updates);
}

// A pista aparece no mapa DE TODA A GENTE. Uma ajuda que só um vê não é uma
// ajuda numa sala: é uma vantagem, e quem pediu ajuda não devia ficar à
// frente por ter pedido ajuda.
export async function mapaRevelarPista(code, nomePais) {
  const snap = await get(ref(db, `rooms/${code}/mapa/pistas`));
  const pistas = snap.exists() ? snap.val() || [] : [];
  if (pistas.includes(nomePais)) return pistas;
  const novas = [...pistas, nomePais];
  await set(ref(db, `rooms/${code}/mapa/pistas`), novas);
  return novas;
}

// A Dona Manga rouba um país. Escolhe entre os que TÊM dono — roubar um país
// que ninguém conquistou não tirava nada a ninguém — e devolve-o ao mapa,
// para quem o quiser outra vez.
export function mapaEscolhaDaManga(room, aleatorio = Math.random) {
  const comDono = Object.keys(room?.mapa?.donos || {});
  if (comDono.length < 3) return null; // sem mapa feito não há graça em roubar
  return comDono[Math.floor(aleatorio() * comDono.length)];
}

export async function mapaMangaRouba(code, room, aleatorio = Math.random) {
  const alvo = mapaEscolhaDaManga(room, aleatorio);
  if (!alvo) return null;
  const dono = mapaDono(room, alvo);
  const marcador = room?.mapa?.marcadores?.[dono] || {};
  await update(roomRef(code), {
    [`mapa/donos/${alvo}`]: null,
    [`mapa/manga`]: { pais: alvo, de: dono, quando: serverNow() },
    [`mapa/marcadores/${dono}/cadeia`]: 0,
    // Os pontos ficam: o país foi conquistado a sério, e tirar pontos por uma
    // travessura da gata era castigar quem sabia a resposta.
    [`mapa/marcadores/${dono}/roubados`]: (marcador.roubados || 0) + 1,
  });
  return alvo;
}

// Acabar a partida do mapa e seguir para o que vem a seguir na fila de bónus.
// Só quem manda é que acaba: o mapa não tem cronómetro, e sem isto bastava
// alguém carregar em "voltar" para tirar o jogo debaixo dos pés dos outros.
// O PLACAR DA SALA NÃO É O MARCADOR DO MAPA. Conquistar 40 países dava 600
// pontos, quando a Fuga da Infeção inteira dá 30 e o Mini-Golfe 25: um jogo
// decidia a partida sozinho e os outros passavam a não contar. O mapa fica com
// a sua economia por dentro — os pontos por seguidos, por continente, pelos
// roubos, que é o que dá gosto a jogá-lo — e paga ao placar da sala um pódio
// da mesma grandeza dos outros bónus.
export const MAPA_PODIO = [25, 16, 10, 6];
export const MAPA_PODIO_MIN = 3;

// Função pura: quanto é que a partida do mapa vale a cada um no placar.
export function computeMapaPayout(room) {
  const tabela = mapaClassificacao(room);
  const pagamento = {};
  tabela.forEach((linha, i) => {
    // Quem não conquistou nada não leva nada — nem o mínimo. O mínimo é para
    // quem jogou, não para quem esteve na sala.
    if (linha.paises === 0) return;
    pagamento[linha.uid] = MAPA_PODIO[i] ?? MAPA_PODIO_MIN;
  });
  return pagamento;
}

export async function finishMapaRound(code, room) {
  if (!room?.mapa?.pago) {
    const pagamento = computeMapaPayout(room);
    const updates = { "mapa/pago": true, "mapa/pagamento": pagamento };
    Object.entries(pagamento).forEach(([uid, n]) => {
      updates[`players/${uid}/score`] = (room.players?.[uid]?.score || 0) + n;
    });
    await update(roomRef(code), updates);
  }
  await startNextBonusGame(code, room);
}
