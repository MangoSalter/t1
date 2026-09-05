// Todas as leituras/escritas na Realtime Database vivem aqui.
// O resto da app (app.js) nunca fala diretamente com o Firebase.

import {
  db, ref, onValue, get, set, update, remove,
  onDisconnect, serverTimestamp, runTransaction, serverNow,
} from "./firebase-init.js";
import {
  DEFAULT_CONFIG, pickLetters, pickCategories, catKey, catIndexFromKey, CATEGORIES,
  BALL_MIN_DELAY_MS, BALL_MAX_DELAY_MS, VOTING_TIME_SECONDS,
  pickMapCriteria, shuffleArray, normalizeCountryName, pickDrawWord,
  LANDMARKS, pickLandmarkRound,
} from "./data.js";

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
export const TAG_ARENA_W = 1400;
export const TAG_ARENA_H = 900;
export const TAG_PLAYER_RADIUS = 16;
export const TAG_ROUND_MS = 60000;
export const TAG_SURVIVOR_BONUS = 25;
export const TAG_POINTS_PER_SECOND = 1;
export const TAG_POWERUP_RADIUS = 14;
export const TAG_POWERUP_MAX_ACTIVE = 3;
export const TAG_POWERUP_SPAWN_INTERVAL_MS = 6000;
export const TAG_SHIELD_MS = 4000;
export const TAG_SPEED_MS = 4000;
export const TAG_POWERUP_TYPES = ["shield", "speed"];
export const TAG_RESULT_DISPLAY_MS = 6000;

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
// Toda a gente vê o mesmo desenho e as mesmas opções ao mesmo tempo; quem
// acerta leva pontos, e quem acerta depressa leva mais. É o único jogo bónus
// que dá para jogar com o telemóvel na mão sem correr atrás de ninguém.
export const LANDMARK_TEAM_ROUNDS = 5;
export const LANDMARK_TEAM_ROUND_MS = 15000;
export const LANDMARK_TEAM_POINTS = 8;
export const LANDMARK_TEAM_SPEED_BONUS_MAX = 6;
export const LANDMARK_TEAM_RESULT_DISPLAY_MS = 5000;

export const BONUS_GAME_KEYS = ["hangman", "mapTrivia", "tag", "battle", "draw", "race", "landmark", "golf"];

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

// --- Rabisco coletivo (menu de Opções, disponível em qualquer ecrã da
// sala) — ao contrário do quadro da Forca (só o anfitrião, um jogo de
// charadas), este é só por diversão: qualquer jogador pode desenhar a
// qualquer momento, cada um na sua cor. Sem "dono"/vez — se dois
// desenharem ao mesmo tempo, os traços intercalam-se na lista (por
// confiança, como o resto do jogo). Os pontos mais antigos vão saindo à
// medida que se desenham novos, tal como o quadro da Forca.
// Teto de segurança, não limite de uso — ver appendPoints.
export const SCRATCHPAD_MAX_POINTS = 5000;

export async function pushScratchpadPoints(code, room, newPoints) {
  const uid = newPoints[0]?.uid;
  await appendPoints(`rooms/${code}/scratchpad/points`, room.scratchpad?.points, newPoints, uid, SCRATCHPAD_MAX_POINTS);
}

export async function clearScratchpad(code) {
  await set(ref(db, `rooms/${code}/scratchpad/points`), null);
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
  if (room.state !== "lobby") throw new Error("Essa sala já começou a jogar.");
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
      const queue = shuffleArray(enabledBonus);
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
  } else if (key === "landmark") {
    await startLandmarkTeam(code, nextRoom);
  } else if (key === "golf") {
    await startGolfTeam(code, nextRoom);
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
  } else if (key === "landmark") {
    await startLandmarkTeam(code, nextRoom);
  } else if (key === "golf") {
    await startGolfTeam(code, nextRoom);
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
    hangman: null,
    mapTrivia: null,
    tag: null,
    battle: null,
    draw: null,
    scratchpad: null,
  };
  Object.keys(room.players || {}).forEach((uid) => {
    updates[`players/${uid}/score`] = 0;
  });
  await update(roomRef(code), updates);
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
};

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
    },
    {
      key: "guessMode",
      label: "Quem arrisca",
      options: [
        { value: "turnos", label: "À vez, um de cada vez" },
        { value: "livre", label: "Qualquer um, quando quiser" },
      ],
      default: "turnos",
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
export function hangmanGuessers(room) {
  return connectedPlayerIds(room).filter((uid) => uid !== room?.hangman?.leaderId);
}

// A vez roda entre quem arrisca. Se quem estava na vez sair, passa ao
// seguinte em vez de o jogo ficar à espera de alguém que já não está.
export function nextGuesser(room, afterUid) {
  const fila = hangmanGuessers(room);
  if (fila.length === 0) return null;
  const i = fila.indexOf(afterUid);
  return fila[(i + 1) % fila.length];
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

export function canGuessNow(room, uid) {
  if (!room?.hangman?.mask || room.hangman.solved) return false;
  if (!hangmanGuessers(room).includes(uid)) return false;
  if (room.hangman.guesses?.[uid]) return false;
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
  const patch = {
    [`guesses/${guesserUid}`]: null,
    turnUid: nextGuesser(room, guesserUid),
  };
  if (acertou) {
    patch.mask = nova;
    patch.solved = maskIsSolved(nova);
    // Uma letra certa conta para a equipa de quem a disse: é o que dá às
    // equipas um propósito para lá de serem uma lista de nomes.
    const equipa = teamOfPlayer(room, guesserUid);
    if (equipa) {
      patch[`teamScore/${equipa}`] = (room.hangman.teamScore?.[equipa] || 0) + 1;
    }
  } else {
    // A letra errada guarda quem a disse, para aparecer no topo na cor dessa
    // pessoa. Repetida não conta como erro novo — errar duas vezes a mesma
    // letra é distração, não é uma tentativa a mais.
    const jaEsteve = !!room.hangman.wrong?.[letter];
    patch[`wrong/${letter}`] = { uid: guesserUid, at: serverNow() };
    if (!jaEsteve) {
      const teto = maxMissesOf(room);
      const proximos = (room.hangman.misses || 0) + 1;
      patch.misses = teto > 0 ? Math.min(teto, proximos) : proximos;
    }
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
  await update(ref(db, `rooms/${code}/hangman`), {
    [`drawnBy/${uid}`]: true,
    // A pista é o contrário da palavra: é para ser vista por todos. Vai para a
    // sala tal e qual, sem máscara nenhuma.
    hint: (hint || "").trim() || null,
    mask: mask || null,
    misses: 0,
    solved: false,
    wrong: null,
    wrongWords: null,
    guesses: null,
    wordGuesses: null,
    turnUid: null,
  });
}

export async function updateHangmanMask(code, room, uid, mask) {
  if (room?.hangman?.leaderId !== uid) return;
  await update(ref(db, `rooms/${code}/hangman`), {
    mask,
    solved: maskIsSolved(mask),
  });
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
  return fila[0];
}

export function autoPenOn(room) {
  return boardSetting(room, "forca", "autoPen") === 1;
}

export async function clearHangmanPuzzle(code, room, uid) {
  if (room?.hangman?.leaderId !== uid) return;
  const patch = {
    mask: null, hint: null, misses: 0, solved: false,
    wrong: null, wrongWords: null, guesses: null, wordGuesses: null, turnUid: null,
  };
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
  const patch = {
    mode: modeKey,
    modeVotes: null,
    mask: null, hint: null, misses: 0, solved: false,
    wrong: null, wrongWords: null, guesses: null, wordGuesses: null, turnUid: null,
  };
  if (modeKey === "forca") {
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
export function sameWord(a, b) {
  const limpa = (t) => String(t || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt").trim().replace(/\s+/g, " ");
  return !!limpa(a) && limpa(a) === limpa(b);
}

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
  const acertou = sameWord(tentativa, word);
  const patch = { [`wordGuesses/${guesserUid}`]: null };
  if (acertou) {
    patch.mask = word;
    patch.solved = true;
    const equipa = teamOfPlayer(room, guesserUid);
    if (equipa) {
      // A palavra inteira vale mais do que uma letra: foi um salto, não um
      // passo.
      patch[`teamScore/${equipa}`] = (room.hangman.teamScore?.[equipa] || 0) + 3;
    }
  } else {
    const teto = maxMissesOf(room);
    const proximos = (room.hangman.misses || 0) + 1;
    patch.misses = teto > 0 ? Math.min(teto, proximos) : proximos;
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
    await update(ref(db, `rooms/${code}/hangman`), {
      leaderId: penWinner,
      penVotes: null,
        mask: null,
      hint: null,
      misses: 0,
      solved: false,
      wrong: null,
      wrongWords: null,
      guesses: null,
      wordGuesses: null,
      turnUid: null,
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
  if (modo !== "forca") return true;
  const emJogo = !!hangman.mask && !hangman.solved;
  if (!emJogo) return true;
  return hangman.leaderId === uid;
}

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

export async function startDrawGame(code, room) {
  const turnOrder = shuffleArray(Object.keys(room.players || {}).filter((uid) => room.players[uid].connected));
  await update(roomRef(code), {
    state: "draw",
    draw: {
      turnOrder,
      turnIndex: 0,
      drawerId: turnOrder[0],
      // A palavra secreta fica em texto simples na sala, como o resto do
      // jogo ("por confiança" — ver nota no topo): quem espreitar a
      // consola estraga o jogo a si próprio. O cliente só a mostra a quem
      // desenha, e revela-a a todos quando a ronda fecha.
      secretWord: pickDrawWord([]),
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
  const usedWords = [...(draw.usedWords || []), draw.secretWord].filter(Boolean);
  await update(ref(db, `rooms/${code}/draw`), {
    turnIndex: nextIndex,
    drawerId: draw.turnOrder[nextIndex],
    secretWord: pickDrawWord(usedWords),
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
    positions[uid] = { x: Math.round(spot.x * TAG_ARENA_W), y: Math.round(spot.y * TAG_ARENA_H), updatedAt: serverNow() };
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

function randomTagPowerupSpot() {
  const margin = 0.12;
  return {
    x: Math.round((margin + Math.random() * (1 - margin * 2)) * TAG_ARENA_W),
    y: Math.round((margin + Math.random() * (1 - margin * 2)) * TAG_ARENA_H),
  };
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
  const effectField = type === "speed" ? "speedUntil" : "shieldUntil";
  const duration = type === "speed" ? TAG_SPEED_MS : TAG_SHIELD_MS;
  await update(ref(db, `rooms/${code}/tag/effects/${uid}`), { [effectField]: serverNow() + duration });
  return true;
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
export function battleClampToWalls(x, y, radius) {
  let px = x;
  let py = y;
  for (const wall of BATTLE_WALLS) {
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
export async function crashRacer(code, uid, timeMs) {
  await update(ref(db, `rooms/${code}/race/racers/${uid}`), {
    alive: false, crashTimeMs: Math.round(timeMs), crashedAt: serverNow(),
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

// --- "Onde Fica Isto?" em equipa ---

// Guarda-se só o ID do marco, não o SVG: o desenho já vive no data.js de cada
// cliente, e mandá-lo pela rede seriam vários KB por ronda sem ganho nenhum.
function buildLandmarkRound(usedIds) {
  const { landmark, options } = pickLandmarkRound(new Set(usedIds || []));
  return {
    landmarkId: landmark.id,
    options,
    startedAt: serverNow(),
    endAt: serverNow() + LANDMARK_TEAM_ROUND_MS,
    answers: {},
    resolved: false,
    resolvedAt: null,
    roundResults: null,
  };
}

export async function startLandmarkTeam(code, room) {
  const round = buildLandmarkRound([]);
  await update(roomRef(code), {
    state: "landmark",
    landmark: { roundIndex: 1, roundsTotal: LANDMARK_TEAM_ROUNDS, usedIds: [round.landmarkId], ...round },
  });
}

// A primeira resposta é a que conta: sem isto, dava para experimentar as
// quatro opções até acertar e ainda levar o bónus de rapidez.
export async function submitLandmarkAnswer(code, room, uid, option) {
  const lm = room.landmark;
  if (!lm || lm.resolved || lm.answers?.[uid]) return;
  await set(ref(db, `rooms/${code}/landmark/answers/${uid}`), {
    option, at: serverNow(),
  });
}

// Função pura. O bónus de rapidez decresce com o tempo gasto na ronda: quem
// acerta no primeiro segundo leva o bónus quase todo, quem acerta no fim
// leva só os pontos base.
export function computeLandmarkRoundResults(room) {
  const lm = room.landmark || {};
  const correctAnswer = LANDMARKS.find((l) => l.id === lm.landmarkId)?.answer || null;
  const startedAt = lm.startedAt || 0;
  const roundMs = Math.max((lm.endAt || 0) - startedAt, 1);
  const roundResults = {};
  const roundPoints = {};
  Object.keys(room.players || {}).forEach((uid) => {
    const entry = lm.answers?.[uid] || null;
    const correct = !!entry && entry.option === correctAnswer;
    const elapsed = entry ? Math.max(0, Math.min(entry.at - startedAt, roundMs)) : roundMs;
    const speedBonus = correct
      ? Math.round(LANDMARK_TEAM_SPEED_BONUS_MAX * (1 - elapsed / roundMs))
      : 0;
    roundResults[uid] = { answer: entry?.option || null, correct, elapsedMs: entry ? elapsed : null, speedBonus };
    roundPoints[uid] = correct ? LANDMARK_TEAM_POINTS + speedBonus : 0;
  });
  return { roundResults, roundPoints, correctAnswer };
}

export async function resolveLandmarkRound(code, room) {
  if (!room.landmark || room.landmark.resolved) return;
  // Mesma razão da corrida: a resposta que fechou a ronda pode ainda não
  // estar no instantâneo em memória, e quem respondeu à tangente ficaria
  // sem pontos.
  const snap = await get(roomRef(code));
  const fresh = snap.exists() ? snap.val() : room;
  const lm = fresh.landmark;
  if (!lm || lm.resolved) return;
  const { roundResults, roundPoints, correctAnswer } = computeLandmarkRoundResults(fresh);
  const updates = {
    "landmark/resolved": true,
    "landmark/resolvedAt": serverNow(),
    "landmark/roundResults": roundResults,
    "landmark/correctAnswer": correctAnswer,
  };
  Object.entries(roundPoints).forEach(([uid, pts]) => {
    if (pts > 0) {
      const prevScore = fresh.players?.[uid]?.score || 0;
      updates[`players/${uid}/score`] = prevScore + pts;
    }
  });
  await update(roomRef(code), updates);
}

export async function advanceLandmarkRoundOrFinish(code, room) {
  const lm = room.landmark;
  if (!lm) return;
  if (lm.roundIndex >= lm.roundsTotal) {
    await startNextBonusGame(code, room);
    return;
  }
  const usedIds = lm.usedIds || [];
  const round = buildLandmarkRound(usedIds);
  await update(roomRef(code), {
    landmark: {
      roundIndex: lm.roundIndex + 1,
      roundsTotal: lm.roundsTotal,
      usedIds: [...usedIds, round.landmarkId],
      ...round,
    },
  });
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

export const GOLF_MP_COURSE_W = 1600;
export const GOLF_MP_COURSE_H = 900;
export const GOLF_MP_BALL_RADIUS = 9;
export const GOLF_MP_HOLE_RADIUS = 16;
export const GOLF_MP_START = { x: 70, y: 450 };
export const GOLF_MP_HOLE = { x: 1520, y: 450 };
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

// Paredes fixas do campo, iguais para todos.
export const GOLF_MP_WALLS = [
  { x: 300, y: 0, w: 24, h: 340 },
  { x: 300, y: 560, w: 24, h: 340 },
  { x: 620, y: 200, w: 24, h: 500 },
  { x: 940, y: 0, w: 24, h: 340 },
  { x: 940, y: 560, w: 24, h: 340 },
  { x: 1260, y: 220, w: 24, h: 460 },
];

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
