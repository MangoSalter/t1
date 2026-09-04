// Todas as leituras/escritas na Realtime Database vivem aqui.
// O resto da app (app.js) nunca fala diretamente com o Firebase.

import {
  db, ref, onValue, get, set, update, remove,
  onDisconnect, serverTimestamp, runTransaction, serverNow,
} from "./firebase-init.js";
import {
  DEFAULT_CONFIG, pickLetters, pickCategories, catKey, catIndexFromKey,
  BALL_MIN_DELAY_MS, BALL_MAX_DELAY_MS, VOTING_TIME_SECONDS,
} from "./data.js";

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

export async function createRoom(uid, name) {
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
        [uid]: { name, score: 0, connected: true, joinedAt: serverTimestamp() },
      },
      usedLetters: {},
      usedCategories: {},
    });
    attachPresence(code, uid);
    return code;
  }
  throw new Error("Não foi possível criar a sala. Tenta novamente.");
}

export async function joinRoom(code, uid, name) {
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
    name, score: room.players?.[uid]?.score || 0, connected: true, joinedAt: serverTimestamp(),
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
    await update(roomRef(code), { state: "final" });
  } else {
    await update(roomRef(code), { round: room.round + 1 });
    await startBallPhase(code);
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
  };
  Object.keys(room.players || {}).forEach((uid) => {
    updates[`players/${uid}/score`] = 0;
  });
  await update(roomRef(code), updates);
}

export async function leaveRoom(code, uid) {
  await remove(ref(db, `rooms/${code}/players/${uid}`));
}
