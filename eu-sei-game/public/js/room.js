// Todas as leituras/escritas na Realtime Database vivem aqui.
// O resto da app (app.js) nunca fala diretamente com o Firebase.

import {
  db, ref, onValue, get, set, update, remove,
  onDisconnect, serverTimestamp, runTransaction, serverNow,
} from "./firebase-init.js";
import {
  DEFAULT_CONFIG, pickLetters, pickCategories, catKey, catIndexFromKey, CATEGORIES,
  BALL_MIN_DELAY_MS, BALL_MAX_DELAY_MS, VOTING_TIME_SECONDS,
  pickMapCriteria, shuffleArray, normalizeCountryName,
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

export const BONUS_GAME_KEYS = ["hangman", "mapTrivia", "tag"];

// --- Forca em equipa (bónus de fim de partida) ---
// NOTA: a palavra fica guardada em texto simples na sala — tal como o resto
// do jogo, não há servidor próprio a esconder dados de uns jogadores dos
// outros, por isso isto é "por confiança" (um jogador tecnicamente curioso
// podia espreitar a resposta na consola do browser). Aceitável para jogar
// com amigos; ver README para a mesma ressalva aplicada ao resto do jogo.
export const HANGMAN_MAX_WRONG = 6;
export const HANGMAN_WORD_WRONG_PENALTY = 2;
export const HANGMAN_TEAM_WIN_POINTS = 15;
export const HANGMAN_SETTER_BONUS = 5;
export const HANGMAN_SETUP_TIMEOUT_MS = 45000;
export const HANGMAN_TURN_TIMEOUT_MS = 25000;

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

export async function castVote(code, targetUid, catIndex, voterUid, kind, active) {
  const path = `rooms/${code}/votes/${targetUid}_${catIndex}/${kind}/${voterUid}`;
  await set(ref(db, path), active ? true : null);
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
    entries.forEach((e) => {
      e.startsOk = e.text.length > 0 && e.text[0].toUpperCase() === letter;
      const voteKey = `${e.uid}_${ci}`;
      const v = room.votes?.[voteKey] || {};
      const invalidCount = Object.keys(v.invalid || {}).length;
      const othersCount = Math.max(N - 1, 0);
      e.invalidByVote = othersCount > 0 && invalidCount > Math.floor(othersCount / 2);
      e.gloriaCount = Object.keys(v.gloria || {}).length;
      e.engracadaCount = Object.keys(v.engracada || {}).length;
    });

    const validEntries = entries.filter((e) => e.startsOk && !e.invalidByVote && e.text);
    const counts = {};
    validEntries.forEach((e) => {
      const key = e.text.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });

    entries.forEach((e) => {
      let status, points;
      if (!e.text) {
        status = "vazia"; points = 0;
      } else if (!e.startsOk || e.invalidByVote) {
        if (e.engracadaCount > 0) { status = "engracada"; points = 2; }
        else { status = "invalida"; points = 0; }
      } else {
        const key = e.text.toLowerCase();
        const repeated = counts[key] > 1;
        const base = repeated ? 5 : 10;
        const bonus = e.gloriaCount * 2;
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
  };
  Object.keys(room.players || {}).forEach((uid) => {
    updates[`players/${uid}/score`] = 0;
  });
  await update(roomRef(code), updates);
}

export async function leaveRoom(code, uid) {
  await remove(ref(db, `rooms/${code}/players/${uid}`));
}

// --- Forca em equipa ---

export async function startHangman(code, room) {
  const setterId = room.hostId;
  const turnOrder = Object.keys(room.players || {}).filter((uid) => uid !== setterId);
  await update(roomRef(code), {
    state: "hangman",
    hangman: {
      setterId,
      turnOrder,
      turnIndex: 0,
      status: "settingUp",
      categoryIndex: null,
      word: null,
      guessedLetters: {},
      wrongCount: 0,
      setupStartedAt: serverNow(),
      turnStartedAt: null,
      lastAction: null,
    },
  });
}

export async function submitHangmanWord(code, categoryIndex, word) {
  const cleanWord = word.trim().toUpperCase();
  if (!cleanWord) return;
  await update(ref(db, `rooms/${code}/hangman`), {
    categoryIndex,
    word: cleanWord,
    status: "playing",
    turnStartedAt: serverNow(),
  });
}

// Funções puras (sem Firebase) — fáceis de testar isoladamente.

export function hangmanIsRevealed(word, guessedLetters) {
  if (!word) return false;
  return [...word].every((ch) => ch === " " || guessedLetters?.[ch]);
}

export function computeHangmanLetterGuess(hangman, letterRaw) {
  const letter = letterRaw.toUpperCase();
  const word = hangman.word || "";
  const already = !!hangman.guessedLetters?.[letter];
  const isInWord = word.includes(letter);
  const guessedLetters = { ...(hangman.guessedLetters || {}), [letter]: true };
  const wrongCount = (hangman.wrongCount || 0) + (!already && !isInWord ? 1 : 0);
  let status = "playing";
  if (hangmanIsRevealed(word, guessedLetters)) status = "won";
  else if (wrongCount >= HANGMAN_MAX_WRONG) status = "lost";
  const orderLen = Math.max((hangman.turnOrder || []).length, 1);
  const turnIndex = status === "playing" ? ((hangman.turnIndex || 0) + 1) % orderLen : hangman.turnIndex;
  return {
    guessedLetters, wrongCount, status, turnIndex,
    lastAction: { type: "letter", value: letter, correct: !already && isInWord },
  };
}

export function computeHangmanWordGuess(hangman, guessRaw) {
  const guess = guessRaw.trim().toUpperCase();
  const word = hangman.word || "";
  const correct = guess.length > 0 && guess === word;
  const guessedLetters = correct
    ? { ...(hangman.guessedLetters || {}), ...Object.fromEntries([...word].map((ch) => [ch, true])) }
    : { ...(hangman.guessedLetters || {}) };
  const wrongCount = (hangman.wrongCount || 0) + (correct ? 0 : HANGMAN_WORD_WRONG_PENALTY);
  let status = "playing";
  if (correct) status = "won";
  else if (wrongCount >= HANGMAN_MAX_WRONG) status = "lost";
  const orderLen = Math.max((hangman.turnOrder || []).length, 1);
  const turnIndex = status === "playing" ? ((hangman.turnIndex || 0) + 1) % orderLen : hangman.turnIndex;
  return {
    guessedLetters, wrongCount, status, turnIndex,
    lastAction: { type: "word", value: guess, correct },
  };
}

export function computeHangmanScoring(room) {
  const hangman = room.hangman || {};
  const players = Object.keys(room.players || {});
  const scores = {};
  players.forEach((uid) => { scores[uid] = 0; });
  if (hangman.status === "won") {
    (hangman.turnOrder || []).forEach((uid) => { scores[uid] = HANGMAN_TEAM_WIN_POINTS; });
    if (hangman.setterId) scores[hangman.setterId] = HANGMAN_SETTER_BONUS;
  }
  return scores;
}

export async function guessHangmanLetter(code, room, uid, letter) {
  const hangman = room.hangman;
  if (!hangman || hangman.status !== "playing") return;
  const currentTurnUid = hangman.turnOrder[hangman.turnIndex];
  if (currentTurnUid !== uid) return;
  const result = computeHangmanLetterGuess(hangman, letter);
  const updates = { ...result, lastAction: { ...result.lastAction, uid } };
  if (result.status === "playing") updates.turnStartedAt = serverNow();
  else updates.resolvedAt = serverNow();
  await update(ref(db, `rooms/${code}/hangman`), updates);
}

export async function guessHangmanWord(code, room, uid, guess) {
  const hangman = room.hangman;
  if (!hangman || hangman.status !== "playing") return;
  const currentTurnUid = hangman.turnOrder[hangman.turnIndex];
  if (currentTurnUid !== uid) return;
  const result = computeHangmanWordGuess(hangman, guess);
  const updates = { ...result, lastAction: { ...result.lastAction, uid } };
  if (result.status === "playing") updates.turnStartedAt = serverNow();
  else updates.resolvedAt = serverNow();
  await update(ref(db, `rooms/${code}/hangman`), updates);
}

export async function skipHangmanTurn(code, room) {
  const hangman = room.hangman;
  if (!hangman || hangman.status !== "playing") return;
  const orderLen = Math.max((hangman.turnOrder || []).length, 1);
  const turnIndex = (hangman.turnIndex + 1) % orderLen;
  await update(ref(db, `rooms/${code}/hangman`), { turnIndex, turnStartedAt: serverNow() });
}

// Qualquer jogador da equipa (não o autor da palavra) pode desistir em vez
// de continuar a tentar — revela a palavra e termina a ronda como derrota,
// sem pontos, tal como esgotar os erros permitidos.
export async function giveUpHangman(code, room, uid) {
  const hangman = room.hangman;
  if (!hangman || hangman.status !== "playing") return;
  if (!(hangman.turnOrder || []).includes(uid)) return;
  await update(ref(db, `rooms/${code}/hangman`), {
    status: "lost",
    resolvedAt: serverNow(),
    lastAction: { type: "giveup", uid },
  });
}

export async function finishHangman(code, room) {
  const scores = computeHangmanScoring(room);
  const updates = {};
  Object.entries(scores).forEach(([uid, pts]) => {
    if (pts > 0) {
      const prevScore = room.players?.[uid]?.score || 0;
      updates[`players/${uid}/score`] = prevScore + pts;
    }
  });
  updates["hangman/finalScores"] = scores;
  await update(roomRef(code), updates);
  await startNextBonusGame(code, room);
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
