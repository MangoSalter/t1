import { getUid, serverNow } from "./firebase-init.js";
import {
  CATEGORIES, DEFAULT_CONFIG, CONFIG_LIMITS, MAX_PLAYERS, catKey,
} from "./data.js";
import {
  createRoom, joinRoom, listenRoom, updateConfig, maybeReclaimHost,
  startGame, startBallPhase, claimBallWin, startLetterPick, voteLetter,
  confirmLetter, submitAnswer, finishCategoriesRound, startVoting,
  castVote, finishVoting, nextRoundOrFinal, resetForRematch, leaveRoom,
} from "./room.js";

const screens = {};
document.querySelectorAll("[data-screen]").forEach((el) => {
  screens[el.dataset.screen] = el;
});

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
}

const state = {
  uid: null,
  name: "",
  code: null,
  room: null,
  unsubscribe: null,
  answerTimers: {},
};

// ---------- HOME ----------

const els = {
  nameInput: document.getElementById("name-input"),
  createBtn: document.getElementById("create-room-btn"),
  joinCodeInput: document.getElementById("join-code-input"),
  joinBtn: document.getElementById("join-room-btn"),
  homeError: document.getElementById("home-error"),
};

els.createBtn.addEventListener("click", async () => {
  const name = els.nameInput.value.trim();
  if (!name) return showHomeError("Escreve o teu nome primeiro.");
  try {
    state.name = name;
    const code = await createRoom(state.uid, name);
    enterRoom(code);
  } catch (err) {
    showHomeError(err.message);
  }
});

els.joinBtn.addEventListener("click", async () => {
  const name = els.nameInput.value.trim();
  const code = els.joinCodeInput.value.trim();
  if (!name) return showHomeError("Escreve o teu nome primeiro.");
  if (!code) return showHomeError("Escreve o código da sala.");
  try {
    state.name = name;
    const joinedCode = await joinRoom(code, state.uid, name);
    enterRoom(joinedCode);
  } catch (err) {
    showHomeError(err.message);
  }
});

function showHomeError(msg) {
  els.homeError.textContent = msg;
}

function enterRoom(code) {
  state.code = code;
  showHomeError("");
  if (state.unsubscribe) state.unsubscribe();
  state.unsubscribe = listenRoom(code, onRoomUpdate);
}

// ---------- ROOM UPDATE / ROUTER ----------

let lastRenderedState = null;

function onRoomUpdate(room) {
  if (!room) {
    alert("A sala deixou de existir.");
    leaveToHome();
    return;
  }
  state.room = room;
  maybeReclaimHost(state.code, room, state.uid);

  if (room.state !== lastRenderedState) {
    lastRenderedState = room.state;
  }

  switch (room.state) {
    case "lobby": renderLobby(room); showScreen("lobby"); break;
    case "ball": renderBall(room); showScreen("ball"); break;
    case "letterPick": renderLetterPick(room); showScreen("letterpick"); break;
    case "categories": renderCategories(room); showScreen("categories"); break;
    case "voting": renderVoting(room); showScreen("voting"); break;
    case "roundScore": renderRoundScore(room); showScreen("roundscore"); break;
    case "final": renderFinal(room); showScreen("final"); break;
    default: showScreen("lobby");
  }

  runHostLoopTick(room);
}

function leaveToHome() {
  if (state.unsubscribe) state.unsubscribe();
  state.unsubscribe = null;
  state.code = null;
  state.room = null;
  showScreen("home");
}

document.querySelectorAll("[data-leave]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (state.code && state.uid) {
      try { await leaveRoom(state.code, state.uid); } catch (e) { /* ignore */ }
    }
    leaveToHome();
  });
});

function isHost(room) {
  return room.hostId === state.uid;
}

// ---------- LOBBY ----------

const lobbyEls = {
  code: document.getElementById("lobby-code"),
  players: document.getElementById("lobby-players"),
  startBtn: document.getElementById("start-game-btn"),
  waiting: document.getElementById("lobby-waiting"),
  configForm: document.getElementById("config-form"),
  numCategories: document.getElementById("cfg-num-categories"),
  timeLimit: document.getElementById("cfg-time-limit"),
  excludeHard: document.getElementById("cfg-exclude-hard"),
  numRounds: document.getElementById("cfg-num-rounds"),
};

let configDebounce = null;
["numCategories", "timeLimit", "excludeHard", "numRounds"].forEach((key) => {
  lobbyEls[key].addEventListener("input", () => {
    if (!state.room || !isHost(state.room)) return;
    clearTimeout(configDebounce);
    configDebounce = setTimeout(() => {
      const partial = {
        numCategories: clamp(lobbyEls.numCategories.value, CONFIG_LIMITS.numCategories),
        timeLimit: clamp(lobbyEls.timeLimit.value, CONFIG_LIMITS.timeLimit),
        excludeHardLetters: lobbyEls.excludeHard.checked,
        numRounds: clamp(lobbyEls.numRounds.value, CONFIG_LIMITS.numRounds),
      };
      updateConfig(state.code, partial);
    }, 300);
  });
});

function clamp(value, limits) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return limits.min;
  return Math.min(limits.max, Math.max(limits.min, n));
}

lobbyEls.startBtn.addEventListener("click", () => {
  if (!state.room || !isHost(state.room)) return;
  startGame(state.code);
});

function renderLobby(room) {
  lobbyEls.code.textContent = state.code;
  const players = Object.entries(room.players || {});
  lobbyEls.players.innerHTML = "";
  players.forEach(([uid, p]) => {
    const li = document.createElement("li");
    li.textContent = p.name + (uid === room.hostId ? " 👑" : "") + (p.connected ? "" : " (desligado)");
    lobbyEls.players.appendChild(li);
  });

  const cfg = { ...DEFAULT_CONFIG, ...(room.config || {}) };
  if (document.activeElement !== lobbyEls.numCategories) lobbyEls.numCategories.value = cfg.numCategories;
  if (document.activeElement !== lobbyEls.timeLimit) lobbyEls.timeLimit.value = cfg.timeLimit;
  if (document.activeElement !== lobbyEls.numRounds) lobbyEls.numRounds.value = cfg.numRounds;
  lobbyEls.excludeHard.checked = !!cfg.excludeHardLetters;

  const amHost = isHost(room);
  [lobbyEls.numCategories, lobbyEls.timeLimit, lobbyEls.excludeHard, lobbyEls.numRounds].forEach((el) => {
    el.disabled = !amHost;
  });
  lobbyEls.startBtn.classList.toggle("hidden", !amHost);
  lobbyEls.startBtn.disabled = players.length < 2;
  lobbyEls.waiting.classList.toggle("hidden", amHost);
}

// ---------- BALL MINIGAME ----------

const ballEls = {
  status: document.getElementById("ball-status"),
  circle: document.getElementById("ball-circle"),
};
let ballRAF = null;
let ballClicked = false;
let ballRenderedKey = null;

ballEls.circle.addEventListener("click", async () => {
  const room = state.room;
  if (!room || room.state !== "ball" || ballClicked) return;
  const appearAt = room.ball?.appearAt;
  if (serverNow() < appearAt) {
    flashBallStatus("Cedo demais! Espera a bola vermelha. 🙈");
    return;
  }
  ballClicked = true;
  const won = await claimBallWin(state.code, state.uid);
  if (!won) ballClicked = false;
});

function flashBallStatus(msg) {
  ballEls.status.textContent = msg;
  setTimeout(() => {
    if (state.room?.state === "ball" && !state.room.ball?.winnerId) {
      ballEls.status.textContent = "Prepara-te...";
    }
  }, 1200);
}

function renderBall(room) {
  const key = room.ball?.appearAt;
  if (ballRenderedKey === key) return; // mesma fase da bola; não reiniciar por causa de um winnerId a chegar
  ballRenderedKey = key;

  ballClicked = false;
  ballEls.circle.classList.remove("visible");
  ballEls.status.textContent = "Prepara-te...";
  cancelAnimationFrame(ballRAF);

  function tick() {
    const r = state.room;
    if (!r || r.state !== "ball") return;
    if (r.ball?.winnerId) {
      const winner = r.players?.[r.ball.winnerId];
      ballEls.status.textContent = r.ball.winnerId === state.uid
        ? "Ganhaste! Escolhe a letra..."
        : `${winner?.name || "Alguém"} ganhou esta ronda!`;
      ballEls.circle.classList.add("visible");
      return;
    }
    if (serverNow() >= r.ball?.appearAt) {
      ballEls.circle.classList.add("visible");
    }
    ballRAF = requestAnimationFrame(tick);
  }
  ballRAF = requestAnimationFrame(tick);
}

// ---------- LETTER PICK ----------

const letterEls = {
  info: document.getElementById("letter-info"),
  buttons: document.getElementById("letter-buttons"),
};

function renderLetterPick(room) {
  const winner = room.players?.[room.ball?.winnerId];
  const amWinner = room.ball?.winnerId === state.uid;
  letterEls.info.textContent = amWinner
    ? "Escolhe a letra desta ronda:"
    : `${winner?.name || "O vencedor"} está a escolher a letra...`;

  letterEls.buttons.innerHTML = "";
  const candidates = room.letterPick?.candidates || [];
  const votes = room.letterPick?.votes || {};
  candidates.forEach((letter) => {
    const count = Object.values(votes).filter((v) => v === letter).length;
    const btn = document.createElement("button");
    btn.className = "letter-btn";
    btn.innerHTML = `<span class="letter-big">${letter}</span><span class="letter-votes">${count} voto(s)</span>`;
    btn.disabled = !amWinner && !!room.letterPick?.chosen;
    if (letter === room.letterPick?.chosen) btn.classList.add("chosen");
    btn.addEventListener("click", () => {
      if (amWinner) {
        if (!room.letterPick?.chosen) confirmLetter(state.code, room, letter);
      } else {
        voteLetter(state.code, state.uid, letter);
      }
    });
    letterEls.buttons.appendChild(btn);
  });
}

// ---------- CATEGORIES ROUND ----------

const catEls = {
  letter: document.getElementById("cat-letter"),
  timer: document.getElementById("cat-timer"),
  list: document.getElementById("cat-list"),
  finishBtn: document.getElementById("cat-finish-btn"),
};
let catRAF = null;
let catRenderedKey = null;

catEls.finishBtn.addEventListener("click", () => {
  finishCategoriesRound(state.code, state.uid);
});

function renderCategories(room) {
  const cr = room.categoriesRound;
  if (!cr) return;
  catEls.letter.textContent = cr.letter;

  if (catRenderedKey === cr.endAt) return; // mesma ronda; não recriar os inputs enquanto o jogador escreve
  catRenderedKey = cr.endAt;

  catEls.list.innerHTML = "";
  cr.categoryIndexes.forEach((ci) => {
    const wrapper = document.createElement("label");
    wrapper.className = "cat-item";
    const title = document.createElement("span");
    title.textContent = CATEGORIES[ci];
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.value = room.answers?.[state.uid]?.[catKey(ci)] || "";
    input.addEventListener("input", () => {
      clearTimeout(state.answerTimers[ci]);
      state.answerTimers[ci] = setTimeout(() => {
        submitAnswer(state.code, state.uid, ci, input.value);
      }, 350);
    });
    wrapper.appendChild(title);
    wrapper.appendChild(input);
    catEls.list.appendChild(wrapper);
  });

  cancelAnimationFrame(catRAF);
  function tick() {
    const r = state.room;
    if (!r || r.state !== "categories") return;
    const msLeft = (r.categoriesRound?.endAt || 0) - serverNow();
    catEls.timer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    catRAF = requestAnimationFrame(tick);
  }
  catRAF = requestAnimationFrame(tick);
}

function formatSeconds(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

// ---------- VOTING ----------

const voteEls = {
  timer: document.getElementById("vote-timer"),
  myAnswers: document.getElementById("vote-my-answers"),
  list: document.getElementById("vote-list"),
  endBtn: document.getElementById("vote-end-btn"),
};
let voteRAF = null;

voteEls.endBtn.addEventListener("click", () => {
  finishVoting(state.code, state.room);
});

function renderVoting(room) {
  const cr = room.categoriesRound;
  if (!cr) return;
  voteEls.endBtn.classList.toggle("hidden", !isHost(room));

  voteEls.myAnswers.innerHTML = "<h3>As tuas respostas</h3>";
  cr.categoryIndexes.forEach((ci) => {
    const text = room.answers?.[state.uid]?.[catKey(ci)] || "";
    const p = document.createElement("p");
    p.textContent = `${CATEGORIES[ci]}: ${text || "(sem resposta)"}`;
    voteEls.myAnswers.appendChild(p);
  });

  const scrollTop = voteEls.list.scrollTop;
  voteEls.list.innerHTML = "";
  const others = Object.keys(room.players || {}).filter((uid) => uid !== state.uid);
  cr.categoryIndexes.forEach((ci) => {
    const section = document.createElement("div");
    section.className = "vote-category";
    const h = document.createElement("h4");
    h.textContent = CATEGORIES[ci];
    section.appendChild(h);

    others.forEach((uid) => {
      const text = (room.answers?.[uid]?.[catKey(ci)] || "").trim();
      const row = document.createElement("div");
      row.className = "vote-row";
      const label = document.createElement("span");
      label.className = "vote-answer";
      label.textContent = `${room.players[uid]?.name}: ${text || "(sem resposta)"}`;
      row.appendChild(label);

      if (text) {
        const voteKey = `${uid}_${ci}`;
        const v = room.votes?.[voteKey] || {};
        row.appendChild(voteToggleBtn("✕ Inválida", v.invalid, uid, ci, "invalid"));
        row.appendChild(voteToggleBtn("👑 Glória", v.gloria, uid, ci, "gloria"));
        row.appendChild(voteToggleBtn("😂 Engraçada", v.engracada, uid, ci, "engracada"));
      }
      section.appendChild(row);
    });
    voteEls.list.appendChild(section);
  });
  voteEls.list.scrollTop = scrollTop;

  cancelAnimationFrame(voteRAF);
  function tick() {
    const r = state.room;
    if (!r || r.state !== "voting") return;
    const msLeft = (r.voting?.endAt || 0) - serverNow();
    voteEls.timer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    voteRAF = requestAnimationFrame(tick);
  }
  voteRAF = requestAnimationFrame(tick);
}

function voteToggleBtn(label, votersObj, targetUid, ci, kind) {
  const count = Object.keys(votersObj || {}).length;
  const btn = document.createElement("button");
  btn.className = "vote-btn";
  const active = !!(votersObj || {})[state.uid];
  btn.classList.toggle("active", active);
  btn.textContent = `${label} (${count})`;
  btn.addEventListener("click", () => {
    castVote(state.code, targetUid, ci, state.uid, kind, !active);
  });
  return btn;
}

// ---------- ROUND SCORE ----------

const roundScoreEls = {
  table: document.getElementById("round-score-table"),
  nextBtn: document.getElementById("round-next-btn"),
};

roundScoreEls.nextBtn.addEventListener("click", () => {
  nextRoundOrFinal(state.code, state.room);
});

function renderRoundScore(room) {
  const rr = room.roundResults;
  const players = Object.entries(room.players || {});
  players.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

  roundScoreEls.table.innerHTML = "";
  players.forEach(([uid, p]) => {
    const row = document.createElement("div");
    row.className = "score-row";
    const roundPts = rr?.roundPoints?.[uid] || 0;
    row.innerHTML = `<span class="score-name">${p.name}</span>
      <span class="score-round">+${roundPts} nesta ronda</span>
      <span class="score-total">${p.score || 0} pts</span>`;
    roundScoreEls.table.appendChild(row);
  });

  const amHost = isHost(room);
  roundScoreEls.nextBtn.classList.toggle("hidden", !amHost);
  const numRounds = room.config?.numRounds || DEFAULT_CONFIG.numRounds;
  roundScoreEls.nextBtn.textContent = room.round >= numRounds ? "Ver resultados finais" : "Próxima ronda";
}

// ---------- FINAL ----------

const finalEls = {
  ranking: document.getElementById("final-ranking"),
  rematchBtn: document.getElementById("final-rematch-btn"),
};

finalEls.rematchBtn.addEventListener("click", () => {
  resetForRematch(state.code, state.room);
});

function renderFinal(room) {
  const players = Object.entries(room.players || {});
  players.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
  finalEls.ranking.innerHTML = "";
  players.forEach(([uid, p], i) => {
    const row = document.createElement("div");
    row.className = "final-row";
    row.innerHTML = `<span class="final-pos">${i === 0 ? "👑" : `#${i + 1}`}</span>
      <span class="final-name">${p.name}</span>
      <span class="final-score">${p.score || 0} pts</span>`;
    finalEls.ranking.appendChild(row);
  });
  finalEls.rematchBtn.classList.toggle("hidden", !isHost(room));
}

// ---------- HOST LOOP: transições dirigidas por tempo ----------

let hostLoopBusy = false;

async function runHostLoopTick(room) {
  if (!room || room.hostId !== state.uid || hostLoopBusy) return;
  hostLoopBusy = true;
  try {
    const now = serverNow();
    if (room.state === "ball") {
      const appearAt = room.ball?.appearAt || 0;
      if (!room.ball?.winnerId && now - appearAt > 15000) {
        await startBallPhase(state.code); // ninguém clicou, tenta outra vez
      } else if (room.ball?.winnerId && !room.letterPick) {
        await startLetterPick(state.code, room);
      }
    } else if (room.state === "letterPick") {
      const lp = room.letterPick;
      const winnerConnected = room.players?.[room.ball?.winnerId]?.connected;
      if (lp && !lp.chosen && !winnerConnected && now - (lp.startedAt || 0) > 8000) {
        await confirmLetter(state.code, room, lp.candidates[0]);
      }
    } else if (room.state === "categories") {
      const cr = room.categoriesRound;
      if (cr && (now >= cr.endAt || cr.finishedBy)) {
        await startVoting(state.code);
      }
    } else if (room.state === "voting") {
      if (room.voting && now >= room.voting.endAt) {
        await finishVoting(state.code, room);
      }
    }
  } finally {
    hostLoopBusy = false;
  }
}

// ---------- INIT ----------

async function init() {
  showScreen("home");
  state.uid = await getUid();
  // Verificação periódica: garante que transições por tempo (fim de ronda,
  // fim de votação, bola sem resposta) acontecem mesmo que ninguém escreva
  // nada na base de dados entretanto.
  setInterval(() => {
    if (state.room) runHostLoopTick(state.room);
  }, 1000);
}

init();
