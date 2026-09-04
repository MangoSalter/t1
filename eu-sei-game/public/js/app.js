import { getUid, serverNow } from "./firebase-init.js";
import { showTouchControls, hideTouchControls } from "./touch-controls.js";
import {
  CATEGORIES, DEFAULT_CONFIG, CONFIG_LIMITS, MAX_PLAYERS, catKey, MIN_ENABLED_CATEGORIES,
  MAP_BACKGROUND_SVG,
} from "./data.js";
import {
  createRoom, joinRoom, listenRoom, updateConfig, maybeReclaimHost, updatePlayerAvatar,
  startGame, startQuickBonusGame, pushScratchpadPoints, clearScratchpad,
  startBallPhase, claimBallWin, startLetterPick, voteLetter,
  confirmLetter, submitAnswer, finishCategoriesRound, startVoting,
  castVote, finishVoting, nextRoundOrFinal, resetForRematch, leaveRoom,
  finishHangman, clearHangmanDoodle, pushHangmanDoodlePoints,
  pushDrawDoodlePoints, clearDrawDoodle, selectDrawWinner, skipDrawRound, advanceDrawRound,
  DRAW_WINNER_POINTS, DRAW_DRAWER_BONUS,
  submitMapTriviaAnswer, resolveMapTriviaRound, advanceMapTriviaRoundOrFinish, voteAcceptMapTriviaAnswer,
  MAP_TRIVIA_RESULT_DISPLAY_MS,
  updateTagPosition, claimTagInfection, claimTagPowerup, spawnTagPowerup, resolveTagRound, finishTagRound,
  TAG_PLAYER_RADIUS, TAG_POWERUP_RADIUS, TAG_POWERUP_MAX_ACTIVE, TAG_POWERUP_SPAWN_INTERVAL_MS,
  TAG_RESULT_DISPLAY_MS,
  updateBattlePosition, claimBattleWeapon, claimBattleHit, spawnBattleWeapon, resolveBattleRound, finishBattleRound,
  battleClampToWalls, BATTLE_WALLS, BATTLE_PLAYER_RADIUS, BATTLE_WEAPON_RADIUS, BATTLE_WEAPON_MAX_ACTIVE,
  BATTLE_WEAPON_SPAWN_INTERVAL_MS, BATTLE_ATTACK_RADIUS, BATTLE_ATTACK_COOLDOWN_MS, BATTLE_LIVES,
  BATTLE_RESULT_DISPLAY_MS,
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

els.createBtn.disabled = true;
els.joinBtn.disabled = true;

els.createBtn.addEventListener("click", async () => {
  const name = els.nameInput.value.trim();
  if (!name) return showHomeError("Escreve o teu nome primeiro.");
  try {
    state.name = name;
    const code = await createRoom(state.uid, name, loadAvatar());
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
    const joinedCode = await joinRoom(code, state.uid, name, loadAvatar());
    enterRoom(joinedCode);
  } catch (err) {
    showHomeError(err.message);
  }
});

// ---------- AVATAR (desenho em pixels, mostrado ao lado do nome nas salas) ----------

const AVATAR_SIZE = 16;
const AVATAR_KEY = "euSei_avatar";
const AVATAR_PALETTE = ["#3a3126", "#c65d4a", "#e3a53d", "#6c8a4f", "#5c7e91", "#8a6bb0", "#ffffff"];
const AVATAR_BLANK_PNG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";

const avatarEls = {
  preview: document.getElementById("avatar-preview"),
  editBtn: document.getElementById("avatar-edit-btn"),
  lobbyEditBtn: document.getElementById("lobby-avatar-edit-btn"),
  overlay: document.getElementById("avatar-editor-overlay"),
  canvas: document.getElementById("avatar-canvas"),
  toolPencil: document.getElementById("avatar-tool-pencil"),
  toolEraser: document.getElementById("avatar-tool-eraser"),
  clearBtn: document.getElementById("avatar-clear-btn"),
  palette: document.getElementById("avatar-palette"),
  saveBtn: document.getElementById("avatar-save-btn"),
  cancelBtn: document.getElementById("avatar-cancel-btn"),
};

const avatarState = { tool: "pencil", color: AVATAR_PALETTE[0], drawing: false };
const avatarCtx = avatarEls.canvas.getContext("2d", { willReadFrequently: true });
avatarCtx.imageSmoothingEnabled = false;

function loadAvatar() {
  try {
    return localStorage.getItem(AVATAR_KEY) || null;
  } catch {
    return null;
  }
}

function saveAvatar(dataUrl) {
  try {
    localStorage.setItem(AVATAR_KEY, dataUrl);
  } catch {
    // sem localStorage (modo privado, etc.) — o avatar só não persiste entre visitas.
  }
}

function updateAvatarPreview(dataUrl) {
  avatarEls.preview.src = dataUrl || AVATAR_BLANK_PNG;
  avatarEls.preview.classList.toggle("avatar-preview-empty", !dataUrl);
}
updateAvatarPreview(loadAvatar());

AVATAR_PALETTE.forEach((color) => {
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = "avatar-swatch";
  swatch.style.background = color;
  swatch.classList.toggle("active", color === avatarState.color);
  swatch.addEventListener("click", () => {
    avatarState.color = color;
    avatarState.tool = "pencil";
    avatarEls.toolPencil.classList.add("active");
    avatarEls.toolEraser.classList.remove("active");
    avatarEls.palette.querySelectorAll(".avatar-swatch").forEach((s) => s.classList.toggle("active", s === swatch));
  });
  avatarEls.palette.appendChild(swatch);
});

avatarEls.toolPencil.addEventListener("click", () => {
  avatarState.tool = "pencil";
  avatarEls.toolPencil.classList.add("active");
  avatarEls.toolEraser.classList.remove("active");
});
avatarEls.toolEraser.addEventListener("click", () => {
  avatarState.tool = "eraser";
  avatarEls.toolEraser.classList.add("active");
  avatarEls.toolPencil.classList.remove("active");
});
avatarEls.clearBtn.addEventListener("click", () => {
  avatarCtx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
});

function avatarPixelFromEvent(e) {
  const rect = avatarEls.canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  const x = Math.floor(((point.clientX - rect.left) / rect.width) * AVATAR_SIZE);
  const y = Math.floor(((point.clientY - rect.top) / rect.height) * AVATAR_SIZE);
  return { x: Math.max(0, Math.min(AVATAR_SIZE - 1, x)), y: Math.max(0, Math.min(AVATAR_SIZE - 1, y)) };
}

function avatarPaintAt(e) {
  const { x, y } = avatarPixelFromEvent(e);
  if (avatarState.tool === "eraser") {
    avatarCtx.clearRect(x, y, 1, 1);
  } else {
    avatarCtx.fillStyle = avatarState.color;
    avatarCtx.fillRect(x, y, 1, 1);
  }
}

["mousedown", "touchstart"].forEach((evt) => {
  avatarEls.canvas.addEventListener(evt, (e) => {
    e.preventDefault();
    avatarState.drawing = true;
    avatarPaintAt(e);
  });
});
["mousemove", "touchmove"].forEach((evt) => {
  avatarEls.canvas.addEventListener(evt, (e) => {
    if (!avatarState.drawing) return;
    e.preventDefault();
    avatarPaintAt(e);
  });
});
["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((evt) => {
  avatarEls.canvas.addEventListener(evt, () => { avatarState.drawing = false; });
});

function openAvatarEditor() {
  avatarCtx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const saved = loadAvatar();
  if (saved) {
    const img = new Image();
    img.onload = () => avatarCtx.drawImage(img, 0, 0);
    img.src = saved;
  }
  avatarEls.overlay.classList.remove("hidden");
}
avatarEls.editBtn.addEventListener("click", openAvatarEditor);
avatarEls.lobbyEditBtn.addEventListener("click", openAvatarEditor);

avatarEls.saveBtn.addEventListener("click", () => {
  const dataUrl = avatarEls.canvas.toDataURL("image/png");
  saveAvatar(dataUrl);
  updateAvatarPreview(dataUrl);
  // Já numa sala (ex: desenhado a partir da lobby) — sincroniza logo, para
  // não ficar só guardado localmente até à próxima vez que entrar numa sala.
  if (state.code && state.uid) updatePlayerAvatar(state.code, state.uid, dataUrl);
  avatarEls.overlay.classList.add("hidden");
});
avatarEls.cancelBtn.addEventListener("click", () => {
  avatarEls.overlay.classList.add("hidden");
});

function avatarImgHtml(avatarDataUrl, size) {
  // avatarDataUrl vem de outro jogador (via Firebase) — valida que é mesmo
  // um data URI de imagem antes de o meter num atributo src, e escapa na
  // mesma por defesa extra (um jogador tecnicamente curioso podia escrever
  // lá o que quisesse diretamente na base de dados, tal como o resto deste
  // jogo "por confiança" — ver nota acima da Forca).
  const isValidDataUrl = typeof avatarDataUrl === "string" && /^data:image\/(png|gif|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarDataUrl);
  const src = isValidDataUrl ? avatarDataUrl : AVATAR_BLANK_PNG;
  const cls = size === "sm" ? "avatar-thumb-sm" : "avatar-thumb";
  return `<img class="${cls}" src="${escapeHtml(src)}" alt="" />`;
}

function showHomeError(msg) {
  els.homeError.textContent = msg;
}

function enterRoom(code) {
  state.code = code;
  showHomeError("");
  if (state.unsubscribe) state.unsubscribe();
  state.unsubscribe = listenRoom(code, onRoomUpdate);
  optionsEls.fab.classList.remove("hidden");
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
  if (room.state !== "tag" && tagState.active) tagExit();
  if (room.state !== "battle" && battleState.active) battleExit();

  switch (room.state) {
    case "lobby": renderLobby(room); showScreen("lobby"); break;
    case "ball": renderBall(room); showScreen("ball"); break;
    case "letterPick": renderLetterPick(room); showScreen("letterpick"); break;
    case "categories": renderCategories(room); showScreen("categories"); break;
    case "voting": renderVoting(room); showScreen("voting"); break;
    case "roundScore": renderRoundScore(room); showScreen("roundscore"); break;
    case "hangman": renderHangman(room); showScreen("hangman"); break;
    case "draw": renderDraw(room); showScreen("draw"); break;
    case "mapTrivia": renderMapTrivia(room); showScreen("map-trivia"); break;
    case "tag": renderTag(room); showScreen("tag"); break;
    case "battle": renderBattle(room); showScreen("battle"); break;
    case "final": renderFinal(room); showScreen("final"); break;
    default: showScreen("lobby");
  }

  refreshOptionsIfOpen(room);
  runHostLoopTick(room);
}

function leaveToHome() {
  if (state.unsubscribe) state.unsubscribe();
  state.unsubscribe = null;
  state.code = null;
  state.room = null;
  if (tagState.active) tagExit();
  if (battleState.active) battleExit();
  optionsEls.fab.classList.add("hidden");
  optionsEls.overlay.classList.add("hidden");
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

// Nomes de jogadores são escritos por eles próprios — sempre escapar antes
// de meter em innerHTML (textContent já é seguro por si só).
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
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
  catCount: document.getElementById("cfg-cat-count"),
  catGrid: document.getElementById("cfg-cat-grid"),
  catSelectAll: document.getElementById("cfg-cat-selectall"),
  catClear: document.getElementById("cfg-cat-clear"),
  minigamesHint: document.getElementById("lobby-minigames-hint"),
};

// Menu de escolha de jogo da sala, ao estilo do menu do modo sozinho: cada
// botão salta as rondas clássicas e começa logo nesse mini-jogo.
const mpGameButtons = Array.from(document.querySelectorAll("[data-mp-game]"));
mpGameButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const room = state.room;
    if (!room || !isHost(room)) return;
    startQuickBonusGame(state.code, room, btn.dataset.mpGame);
  });
});

const bonusGameCheckboxes = Array.from(document.querySelectorAll("[data-bonus-game]"));

bonusGameCheckboxes.forEach((cb) => {
  cb.addEventListener("change", () => {
    if (!state.room || !isHost(state.room)) return;
    const selected = bonusGameCheckboxes.filter((c) => c.checked);
    if (selected.length === 0) {
      cb.checked = true; // não deixa ficar sem nenhum jogo bónus escolhido
      return;
    }
    updateConfig(state.code, { bonusGames: selected.map((c) => c.dataset.bonusGame) });
  });
});

const catCheckboxes = CATEGORIES.map((name, i) => {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = true;
  input.dataset.catIndex = String(i);
  label.appendChild(input);
  label.appendChild(document.createTextNode(name));
  lobbyEls.catGrid.appendChild(label);
  return input;
});

function getSelectedCategoryIndexes() {
  return catCheckboxes
    .map((cb, i) => (cb.checked ? i : -1))
    .filter((i) => i !== -1);
}

function sendCategoryUpdate() {
  if (!state.room || !isHost(state.room)) return;
  const selected = getSelectedCategoryIndexes();
  updateConfig(state.code, { enabledCategories: selected });
}

catCheckboxes.forEach((cb) => {
  cb.addEventListener("change", () => {
    if (!state.room || !isHost(state.room)) return;
    if (!cb.checked && getSelectedCategoryIndexes().length < MIN_ENABLED_CATEGORIES) {
      cb.checked = true; // não deixa descer abaixo do mínimo
      return;
    }
    sendCategoryUpdate();
  });
});

lobbyEls.catSelectAll.addEventListener("click", () => {
  if (!state.room || !isHost(state.room)) return;
  catCheckboxes.forEach((cb) => { cb.checked = true; });
  sendCategoryUpdate();
});

lobbyEls.catClear.addEventListener("click", () => {
  if (!state.room || !isHost(state.room)) return;
  catCheckboxes.forEach((cb, i) => { cb.checked = i < MIN_ENABLED_CATEGORIES; });
  sendCategoryUpdate();
});

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
    li.innerHTML = avatarImgHtml(p.avatar, "sm")
      + escapeHtml(p.name) + (uid === room.hostId ? " 👑" : "") + (p.connected ? "" : " (desligado)");
    lobbyEls.players.appendChild(li);
  });

  const cfg = { ...DEFAULT_CONFIG, ...(room.config || {}) };
  if (document.activeElement !== lobbyEls.numCategories) lobbyEls.numCategories.value = cfg.numCategories;
  if (document.activeElement !== lobbyEls.timeLimit) lobbyEls.timeLimit.value = cfg.timeLimit;
  if (document.activeElement !== lobbyEls.numRounds) lobbyEls.numRounds.value = cfg.numRounds;
  lobbyEls.excludeHard.checked = !!cfg.excludeHardLetters;

  const enabledCats = room.config?.enabledCategories;
  const hasCustomSelection = Array.isArray(enabledCats) && enabledCats.length > 0;
  const enabledSet = hasCustomSelection ? new Set(enabledCats) : null;
  catCheckboxes.forEach((cb, i) => {
    cb.checked = enabledSet ? enabledSet.has(i) : true;
  });
  lobbyEls.catCount.textContent = hasCustomSelection ? enabledCats.length : CATEGORIES.length;

  const enabledBonusGames = room.config?.bonusGames?.length ? room.config.bonusGames : ["hangman"];
  bonusGameCheckboxes.forEach((cb) => {
    cb.checked = enabledBonusGames.includes(cb.dataset.bonusGame);
  });

  const amHost = isHost(room);
  [lobbyEls.numCategories, lobbyEls.timeLimit, lobbyEls.excludeHard, lobbyEls.numRounds].forEach((el) => {
    el.disabled = !amHost;
  });
  catCheckboxes.forEach((cb) => { cb.disabled = !amHost; });
  bonusGameCheckboxes.forEach((cb) => { cb.disabled = !amHost; });
  lobbyEls.catSelectAll.classList.toggle("hidden", !amHost);
  lobbyEls.catClear.classList.toggle("hidden", !amHost);
  lobbyEls.startBtn.classList.toggle("hidden", !amHost);
  lobbyEls.startBtn.disabled = players.length < 2;
  lobbyEls.waiting.classList.toggle("hidden", amHost);

  const connectedCount = players.filter(([, p]) => p.connected).length;
  mpGameButtons.forEach((btn) => {
    btn.disabled = !amHost || connectedCount < 3;
  });
  lobbyEls.minigamesHint.textContent = !amHost
    ? "Só o anfitrião escolhe o jogo."
    : connectedCount < 3
      ? `Precisa de 3+ jogadores ligados (há ${connectedCount}).`
      : "Salta as rondas clássicas e começa já neste.";
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
        const votesForAnswer = room.votes?.[voteKey] || {};
        row.appendChild(voteToggleBtn("✕ Inválida", votesForAnswer, uid, ci, "invalid"));
        row.appendChild(voteToggleBtn("👑 Glória", votesForAnswer, uid, ci, "gloria"));
        row.appendChild(voteToggleBtn("😂 Engraçada", votesForAnswer, uid, ci, "engracada"));
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

// Um único voto por votante em cada resposta — Inválida/Glória/Engraçada
// nunca se acumulam (ver nota em castVote, room.js). Clicar num botão já
// ativo retira o voto; clicar noutro substitui o anterior.
function voteToggleBtn(label, votesForAnswer, targetUid, ci, kind) {
  const count = Object.values(votesForAnswer || {}).filter((k) => k === kind).length;
  const btn = document.createElement("button");
  btn.className = "vote-btn";
  const active = (votesForAnswer || {})[state.uid] === kind;
  btn.classList.toggle("active", active);
  btn.textContent = `${label} (${count})`;
  btn.addEventListener("click", () => {
    castVote(state.code, state.room, targetUid, ci, state.uid, kind);
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
    row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm")}${escapeHtml(p.name)}</span>
      <span class="score-round">+${roundPts} nesta ronda</span>
      <span class="score-total">${p.score || 0} pts</span>`;
    roundScoreEls.table.appendChild(row);
  });

  const amHost = isHost(room);
  roundScoreEls.nextBtn.classList.toggle("hidden", !amHost);
  const numRounds = room.config?.numRounds || DEFAULT_CONFIG.numRounds;
  const isLastRound = room.round >= numRounds;
  const playerCount = Object.keys(room.players || {}).length;
  roundScoreEls.nextBtn.textContent = isLastRound
    ? (playerCount >= 3 ? "Forca em equipa (bónus)" : "Ver resultados finais")
    : "Próxima ronda";
}

// ---------- FORCA EM EQUIPA ----------
// Já não é o jogo de adivinhar letra a letra — é um quadro branco em ecrã
// inteiro (fora da moldura/cartão normal da app, ocupa o espaço todo do
// browser) onde só o anfitrião da sala ("líder") escreve/desenha; o resto
// da equipa vê e adivinha em voz alta à volta do ecrã, como um jogo de
// charadas tradicional — o nome "Forca" ficou só como identificador deste
// mini-jogo. Os pontos mais antigos vão saindo à medida que se desenham
// novos (ver HANGMAN_DOODLE_MAX_POINTS em room.js), como tinta limitada.

const HANGMAN_DOODLE_INK = "#3a3126";
const HANGMAN_DOODLE_BROADCAST_INTERVAL_MS = 90;
const HANGMAN_DOODLE_MIN_DIST = 0.004;

const hangmanEls = {
  status: document.getElementById("hangman-status"),
  doodleCanvas: document.getElementById("hangman-doodle-canvas"),
  clearBtn: document.getElementById("hangman-doodle-clear-btn"),
  continueBtn: document.getElementById("hangman-continue-btn"),
};

const hangmanDoodleState = {
  drawing: false,
  lastPoint: null,
  pending: [],
  lastBroadcastAt: 0,
  dpr: 1,
  rectW: 0,
  rectH: 0,
};

function hangmanAmLeader() {
  return !!state.room?.hangman && state.room.hangman.leaderId === state.uid;
}

function hangmanDoodleSyncCanvasSize() {
  const canvas = hangmanEls.doodleCanvas;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  hangmanDoodleState.dpr = dpr;
  hangmanDoodleState.rectW = rect.width;
  hangmanDoodleState.rectH = rect.height;
  return true;
}

function hangmanDoodleRedraw() {
  if (!hangmanDoodleSyncCanvasSize()) return;
  const canvas = hangmanEls.doodleCanvas;
  const ctx = canvas.getContext("2d");
  const { dpr, rectW, rectH } = hangmanDoodleState;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rectW, rectH);
  const room = state.room;
  const points = [...(room?.hangman?.doodle?.points || []), ...hangmanDoodleState.pending];
  ctx.strokeStyle = HANGMAN_DOODLE_INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  let prev = null;
  points.forEach((p) => {
    const x = p.x * rectW;
    const y = p.y * rectH;
    if (p.newStroke || !prev) {
      prev = { x, y };
      return;
    }
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    prev = { x, y };
  });
}

function hangmanDoodlePointFromEvent(e) {
  const rect = hangmanEls.doodleCanvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  return { x, y };
}

function hangmanDoodleFlush() {
  if (hangmanDoodleState.pending.length === 0) return;
  const toSend = hangmanDoodleState.pending;
  hangmanDoodleState.pending = [];
  hangmanDoodleState.lastBroadcastAt = performance.now();
  pushHangmanDoodlePoints(state.code, state.room, state.uid, toSend);
}

hangmanEls.doodleCanvas.addEventListener("pointerdown", (e) => {
  if (!hangmanAmLeader()) return;
  e.preventDefault();
  hangmanEls.doodleCanvas.setPointerCapture(e.pointerId);
  hangmanDoodleState.drawing = true;
  const p = hangmanDoodlePointFromEvent(e);
  hangmanDoodleState.lastPoint = p;
  hangmanDoodleState.pending.push({ x: p.x, y: p.y, newStroke: true });
  hangmanDoodleRedraw();
});

hangmanEls.doodleCanvas.addEventListener("pointermove", (e) => {
  if (!hangmanDoodleState.drawing) return;
  const p = hangmanDoodlePointFromEvent(e);
  const last = hangmanDoodleState.lastPoint;
  const dist = last ? Math.hypot(p.x - last.x, p.y - last.y) : 1;
  if (dist < HANGMAN_DOODLE_MIN_DIST) return;
  hangmanDoodleState.lastPoint = p;
  hangmanDoodleState.pending.push({ x: p.x, y: p.y, newStroke: false });
  hangmanDoodleRedraw();
  if (performance.now() - hangmanDoodleState.lastBroadcastAt > HANGMAN_DOODLE_BROADCAST_INTERVAL_MS) {
    hangmanDoodleFlush();
  }
});

function hangmanDoodleEndStroke() {
  if (!hangmanDoodleState.drawing) return;
  hangmanDoodleState.drawing = false;
  hangmanDoodleState.lastPoint = null;
  hangmanDoodleFlush();
}
hangmanEls.doodleCanvas.addEventListener("pointerup", hangmanDoodleEndStroke);
hangmanEls.doodleCanvas.addEventListener("pointercancel", hangmanDoodleEndStroke);
hangmanEls.doodleCanvas.addEventListener("pointerleave", hangmanDoodleEndStroke);

hangmanEls.clearBtn.addEventListener("click", () => {
  clearHangmanDoodle(state.code);
});
hangmanEls.continueBtn.addEventListener("click", () => {
  finishHangman(state.code, state.room);
});

window.addEventListener("resize", () => {
  if (screens["hangman"]?.classList.contains("active")) hangmanDoodleRedraw();
});

function renderHangman(room) {
  const hangman = room.hangman;
  if (!hangman) return;
  const amLeader = hangman.leaderId === state.uid;
  const leaderName = room.players?.[hangman.leaderId]?.name || "O anfitrião";
  hangmanEls.status.textContent = amLeader
    ? "És o líder — desenha ou escreve uma pista para a equipa adivinhar em voz alta!"
    : `${leaderName} está a desenhar — adivinhem em voz alta!`;
  hangmanEls.doodleCanvas.classList.toggle("hangman-doodle-canvas-active", amLeader);
  hangmanEls.clearBtn.classList.toggle("hidden", !amLeader);
  hangmanEls.continueBtn.classList.toggle("hidden", !isHost(room));
  hangmanDoodleRedraw();
}

// ---------- DESENHA E ADIVINHA EM EQUIPA ----------
// Mesmo padrão de quadro branco em ecrã inteiro da Forca, mas com pontuação
// e vez a rodar: um jogador desenha por ronda (turnOrder sorteado uma vez
// no início), os outros veem o traço em tempo real e adivinham em voz alta
// (fora da app). Quem desenha faz de juiz — escolhe quem acertou primeiro
// (ou salta, se ninguém acertou), o que fecha a ronda e passa a vez ao
// próximo jogador. Continua até todos terem desenhado uma vez.

const DRAW_DOODLE_INK = "#3a3126";
const DRAW_DOODLE_BROADCAST_INTERVAL_MS = 90;
const DRAW_DOODLE_MIN_DIST = 0.004;

const drawEls = {
  status: document.getElementById("draw-status"),
  doodleCanvas: document.getElementById("draw-doodle-canvas"),
  clearBtn: document.getElementById("draw-clear-btn"),
  selectWinnerBtn: document.getElementById("draw-select-winner-btn"),
  skipBtn: document.getElementById("draw-skip-btn"),
  continueBtn: document.getElementById("draw-continue-btn"),
  result: document.getElementById("draw-result"),
  winnerOverlay: document.getElementById("draw-winner-overlay"),
  winnerList: document.getElementById("draw-winner-list"),
  winnerCancelBtn: document.getElementById("draw-winner-cancel-btn"),
};

const drawDoodleState = {
  drawing: false,
  lastPoint: null,
  pending: [],
  lastBroadcastAt: 0,
  dpr: 1,
  rectW: 0,
  rectH: 0,
};

function drawAmDrawer() {
  return !!state.room?.draw && state.room.draw.drawerId === state.uid;
}

function drawDoodleSyncCanvasSize() {
  const canvas = drawEls.doodleCanvas;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  drawDoodleState.dpr = dpr;
  drawDoodleState.rectW = rect.width;
  drawDoodleState.rectH = rect.height;
  return true;
}

function drawDoodleRedraw() {
  if (!drawDoodleSyncCanvasSize()) return;
  const canvas = drawEls.doodleCanvas;
  const ctx = canvas.getContext("2d");
  const { dpr, rectW, rectH } = drawDoodleState;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rectW, rectH);
  const room = state.room;
  const points = [...(room?.draw?.doodle?.points || []), ...drawDoodleState.pending];
  ctx.strokeStyle = DRAW_DOODLE_INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  let prev = null;
  points.forEach((p) => {
    const x = p.x * rectW;
    const y = p.y * rectH;
    if (p.newStroke || !prev) {
      prev = { x, y };
      return;
    }
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    prev = { x, y };
  });
}

function drawDoodlePointFromEvent(e) {
  const rect = drawEls.doodleCanvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  return { x, y };
}

function drawDoodleFlush() {
  if (drawDoodleState.pending.length === 0) return;
  const toSend = drawDoodleState.pending;
  drawDoodleState.pending = [];
  drawDoodleState.lastBroadcastAt = performance.now();
  pushDrawDoodlePoints(state.code, state.room, state.uid, toSend);
}

drawEls.doodleCanvas.addEventListener("pointerdown", (e) => {
  if (!drawAmDrawer() || state.room.draw.resolved) return;
  e.preventDefault();
  drawEls.doodleCanvas.setPointerCapture(e.pointerId);
  drawDoodleState.drawing = true;
  const p = drawDoodlePointFromEvent(e);
  drawDoodleState.lastPoint = p;
  drawDoodleState.pending.push({ x: p.x, y: p.y, newStroke: true });
  drawDoodleRedraw();
});

drawEls.doodleCanvas.addEventListener("pointermove", (e) => {
  if (!drawDoodleState.drawing) return;
  const p = drawDoodlePointFromEvent(e);
  const last = drawDoodleState.lastPoint;
  const dist = last ? Math.hypot(p.x - last.x, p.y - last.y) : 1;
  if (dist < DRAW_DOODLE_MIN_DIST) return;
  drawDoodleState.lastPoint = p;
  drawDoodleState.pending.push({ x: p.x, y: p.y, newStroke: false });
  drawDoodleRedraw();
  if (performance.now() - drawDoodleState.lastBroadcastAt > DRAW_DOODLE_BROADCAST_INTERVAL_MS) {
    drawDoodleFlush();
  }
});

function drawDoodleEndStroke() {
  if (!drawDoodleState.drawing) return;
  drawDoodleState.drawing = false;
  drawDoodleState.lastPoint = null;
  drawDoodleFlush();
}
drawEls.doodleCanvas.addEventListener("pointerup", drawDoodleEndStroke);
drawEls.doodleCanvas.addEventListener("pointercancel", drawDoodleEndStroke);
drawEls.doodleCanvas.addEventListener("pointerleave", drawDoodleEndStroke);

drawEls.clearBtn.addEventListener("click", () => {
  clearDrawDoodle(state.code, state.room, state.uid);
});

drawEls.selectWinnerBtn.addEventListener("click", () => {
  const room = state.room;
  if (!room) return;
  drawEls.winnerList.innerHTML = "";
  Object.entries(room.players || {})
    .filter(([uid]) => uid !== room.draw.drawerId)
    .forEach(([uid, p]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "primary";
      btn.innerHTML = avatarImgHtml(p.avatar, "sm") + escapeHtml(p.name);
      btn.addEventListener("click", () => {
        selectDrawWinner(state.code, state.room, state.uid, uid);
        drawEls.winnerOverlay.classList.add("hidden");
      });
      drawEls.winnerList.appendChild(btn);
    });
  drawEls.winnerOverlay.classList.remove("hidden");
});
drawEls.winnerCancelBtn.addEventListener("click", () => {
  drawEls.winnerOverlay.classList.add("hidden");
});

drawEls.skipBtn.addEventListener("click", () => {
  skipDrawRound(state.code, state.room, state.uid);
});

drawEls.continueBtn.addEventListener("click", () => {
  advanceDrawRound(state.code, state.room);
});

window.addEventListener("resize", () => {
  if (screens["draw"]?.classList.contains("active")) drawDoodleRedraw();
});

function renderDraw(room) {
  const draw = room.draw;
  if (!draw) return;
  const amDrawer = draw.drawerId === state.uid;
  const drawerName = room.players?.[draw.drawerId]?.name || "Alguém";
  const roundLabel = `Ronda ${draw.turnIndex + 1}/${draw.turnOrder.length}`;

  if (!draw.resolved) {
    // A palavra secreta só aparece a quem desenha; os outros só sabem de
    // quem é a vez (e adivinham em voz alta).
    drawEls.status.textContent = amDrawer
      ? `${roundLabel} — desenha: “${draw.secretWord || "?"}”`
      : `${roundLabel} — ${drawerName} está a desenhar. Adivinhem em voz alta!`;
    drawEls.doodleCanvas.classList.toggle("hangman-doodle-canvas-active", amDrawer);
    drawEls.clearBtn.classList.toggle("hidden", !amDrawer);
    drawEls.selectWinnerBtn.classList.toggle("hidden", !amDrawer);
    drawEls.skipBtn.classList.toggle("hidden", !amDrawer);
    drawEls.continueBtn.classList.add("hidden");
    drawEls.result.classList.add("hidden");
  } else {
    drawEls.doodleCanvas.classList.remove("hangman-doodle-canvas-active");
    drawEls.clearBtn.classList.add("hidden");
    drawEls.selectWinnerBtn.classList.add("hidden");
    drawEls.skipBtn.classList.add("hidden");
    drawEls.continueBtn.classList.toggle("hidden", !isHost(room));
    drawEls.result.classList.remove("hidden");
    const word = draw.secretWord ? `Era “${draw.secretWord}”. ` : "";
    if (draw.roundWinnerId) {
      const winnerName = room.players?.[draw.roundWinnerId]?.name || "Alguém";
      drawEls.result.textContent = `🎉 ${word}${winnerName} acertou! +${DRAW_WINNER_POINTS} pts (e +${DRAW_DRAWER_BONUS} para ${drawerName})`;
    } else {
      drawEls.result.textContent = `${word}Ninguém acertou desta vez...`;
    }
  }
  drawDoodleRedraw();
}

// ---------- MAPA-MÚNDI EM EQUIPA ----------

const mapTriviaEls = {
  roundInfo: document.getElementById("map-trivia-round-info"),
  prompt: document.getElementById("map-trivia-prompt"),
  timer: document.getElementById("map-trivia-timer"),
  arena: document.getElementById("map-trivia-arena"),
  answerRow: document.getElementById("map-trivia-answer-row"),
  answerInput: document.getElementById("map-trivia-answer-input"),
  answerSubmitBtn: document.getElementById("map-trivia-answer-submit-btn"),
  answered: document.getElementById("map-trivia-answered"),
  results: document.getElementById("map-trivia-results"),
  voteHint: document.getElementById("map-trivia-vote-hint"),
  continueBtn: document.getElementById("map-trivia-continue-btn"),
};

(function buildMapTriviaBackground() {
  const bg = document.createElement("div");
  bg.className = "map-bg";
  bg.innerHTML = MAP_BACKGROUND_SVG;
  mapTriviaEls.arena.appendChild(bg);
})();

function submitMyMapTriviaAnswer() {
  const room = state.room;
  const mt = room?.mapTrivia;
  if (!mt || mt.resolved) return;
  if (mt.answers?.[state.uid]) return; // já respondeste esta ronda
  const text = mapTriviaEls.answerInput.value.trim();
  if (!text) return;
  submitMapTriviaAnswer(state.code, state.uid, text);
}
mapTriviaEls.answerSubmitBtn.addEventListener("click", submitMyMapTriviaAnswer);
mapTriviaEls.answerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitMyMapTriviaAnswer();
});

mapTriviaEls.continueBtn.addEventListener("click", () => {
  advanceMapTriviaRoundOrFinish(state.code, state.room);
});

function renderMapTrivia(room) {
  const mt = room.mapTrivia;
  if (!mt) return;
  mapTriviaEls.roundInfo.textContent = `Ronda ${mt.roundIndex}/${mt.roundsTotal}`;
  mapTriviaEls.prompt.textContent = mt.criteria?.promptText || "";

  const myAnswer = mt.answers?.[state.uid];

  if (!mt.resolved) {
    const msLeft = Math.max(0, (mt.endAt || 0) - serverNow());
    mapTriviaEls.timer.textContent = `${Math.ceil(msLeft / 1000)}s`;
    const answeredCount = Object.keys(mt.answers || {}).length;
    const totalPlayers = Object.keys(room.players || {}).length;
    mapTriviaEls.answered.textContent = myAnswer
      ? `Já respondeste "${myAnswer}"! (${answeredCount}/${totalPlayers} responderam)`
      : `Escreve a tua resposta e envia. (${answeredCount}/${totalPlayers} responderam)`;
    mapTriviaEls.answerRow.classList.toggle("hidden", !!myAnswer);
    mapTriviaEls.results.classList.add("hidden");
    mapTriviaEls.voteHint.classList.add("hidden");
    mapTriviaEls.continueBtn.classList.add("hidden");
  } else {
    mapTriviaEls.timer.textContent = "";
    mapTriviaEls.answered.textContent = "";
    mapTriviaEls.answerRow.classList.add("hidden");
    mapTriviaEls.answerInput.value = "";
    mapTriviaEls.results.classList.remove("hidden");
    mapTriviaEls.results.innerHTML = "";
    let anyChallengeable = false;
    Object.entries(mt.roundResults || {}).forEach(([uid, r]) => {
      const row = document.createElement("div");
      row.className = "score-row";
      const p = room.players?.[uid];
      const name = escapeHtml(p?.name || "?");
      const statusLabel = r.correct
        ? (r.votedIn ? "✓ aceite pela equipa! +8 pts" : "✓ +8 pts")
        : "✕ 0 pts";
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p?.avatar, "sm")}${name}</span>
        <span class="score-round">${escapeHtml(r.answer) || "(sem resposta)"}</span>
        <span class="score-total">${statusLabel}</span>`;
      if (!r.correct && r.answer && uid !== state.uid) {
        anyChallengeable = true;
        const alreadyVoted = !!mt.votes?.[uid]?.[state.uid];
        const voteBtn = document.createElement("button");
        voteBtn.className = "vote-btn";
        voteBtn.textContent = alreadyVoted ? "Votaste para aceitar" : "Aceitar resposta";
        voteBtn.disabled = alreadyVoted;
        voteBtn.addEventListener("click", () => {
          voteAcceptMapTriviaAnswer(state.code, state.room, uid, state.uid);
        });
        row.appendChild(voteBtn);
      }
      mapTriviaEls.results.appendChild(row);
    });
    mapTriviaEls.voteHint.classList.toggle("hidden", !anyChallengeable);
    mapTriviaEls.continueBtn.classList.toggle("hidden", !isHost(room));
  }
}

// ---------- FUGA DA INFEÇÃO EM EQUIPA ----------
// Cada cliente controla e transmite só a sua própria posição (a um ritmo
// limitado), e deteta contacto/apanha power-ups localmente — tal como o
// resto do jogo, isto é "por confiança" entre os jogadores, não física
// corrida no servidor. A câmara segue sempre o PRÓPRIO jogador (cada
// cliente vê o mundo centrado em si, não numa vista partilhada).

const TAG_ACCEL = 900;
const TAG_DRAG = 3.2;
const TAG_MAX_SPEED = 260;
const TAG_SPEED_BOOST_MULT = 1.6;
const TAG_BROADCAST_INTERVAL_MS = 120;

const tagEls = {
  statusLine: document.getElementById("tag-status-line"),
  timer: document.getElementById("tag-timer"),
  arena: document.getElementById("tag-arena"),
  results: document.getElementById("tag-results"),
  continueBtn: document.getElementById("tag-continue-btn"),
};

const tagState = {
  active: false,
  x: 0, y: 0, vx: 0, vy: 0,
  keys: { up: false, down: false, left: false, right: false },
  lastFrame: 0,
  lastBroadcastAt: 0,
  keydownHandler: null,
  keyupHandler: null,
  rafId: null,
  worldEl: null,
  playerEls: {},
  powerupEls: {},
  playerDisplayPos: {},
};

tagEls.continueBtn.addEventListener("click", () => {
  finishTagRound(state.code, state.room);
});

function tagHandleKey(e, isDown) {
  const map = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
  const dir = map[e.key];
  if (!dir) return;
  e.preventDefault();
  tagState.keys[dir] = isDown;
}

function tagEnter(room) {
  tagState.active = true;
  const myPos = room.tag?.positions?.[state.uid];
  tagState.x = myPos?.x ?? (room.tag?.arenaW || 1400) / 2;
  tagState.y = myPos?.y ?? (room.tag?.arenaH || 900) / 2;
  tagState.vx = 0;
  tagState.vy = 0;
  tagState.keys = { up: false, down: false, left: false, right: false };
  tagState.playerEls = {};
  tagState.powerupEls = {};
  tagState.playerDisplayPos = {};

  tagEls.arena.innerHTML = "";
  tagState.worldEl = document.createElement("div");
  tagState.worldEl.className = "tag-world";
  tagState.worldEl.style.width = `${room.tag?.arenaW || 1400}px`;
  tagState.worldEl.style.height = `${room.tag?.arenaH || 900}px`;
  tagEls.arena.appendChild(tagState.worldEl);

  tagState.keydownHandler = (e) => tagHandleKey(e, true);
  tagState.keyupHandler = (e) => tagHandleKey(e, false);
  document.addEventListener("keydown", tagState.keydownHandler);
  document.addEventListener("keyup", tagState.keyupHandler);

  showTouchControls();
  tagState.lastFrame = performance.now();
  tagState.rafId = requestAnimationFrame(tagTick);
}

function tagExit() {
  hideTouchControls();
  tagState.active = false;
  if (tagState.rafId) cancelAnimationFrame(tagState.rafId);
  tagState.rafId = null;
  if (tagState.keydownHandler) document.removeEventListener("keydown", tagState.keydownHandler);
  if (tagState.keyupHandler) document.removeEventListener("keyup", tagState.keyupHandler);
  tagState.keydownHandler = null;
  tagState.keyupHandler = null;
}

function tagPlayerEl(uid, name) {
  if (tagState.playerEls[uid]) return tagState.playerEls[uid];
  const el = document.createElement("div");
  el.className = "tag-player";
  const label = document.createElement("span");
  label.className = "tag-player-name";
  label.textContent = name;
  el.appendChild(label);
  tagState.worldEl.appendChild(el);
  tagState.playerEls[uid] = el;
  return el;
}

function tagRenderPowerups(powerups) {
  const seen = new Set();
  Object.entries(powerups || {}).forEach(([id, p]) => {
    seen.add(id);
    let el = tagState.powerupEls[id];
    if (!el) {
      el = document.createElement("div");
      el.className = `tag-powerup tag-powerup-${p.type}`;
      el.textContent = p.type === "shield" ? "🛡" : "⚡";
      tagState.worldEl.appendChild(el);
      tagState.powerupEls[id] = el;
    }
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  });
  Object.keys(tagState.powerupEls).forEach((id) => {
    if (!seen.has(id)) {
      tagState.powerupEls[id].remove();
      delete tagState.powerupEls[id];
    }
  });
}

function tagTick(now) {
  if (!tagState.active) return;
  const room = state.room;
  const tag = room?.tag;
  if (!tag) { tagState.rafId = requestAnimationFrame(tagTick); return; }

  const dt = Math.min((now - tagState.lastFrame) / 1000, 0.05);
  tagState.lastFrame = now;

  if (!tag.resolved) {
    let ax = 0, ay = 0;
    if (tagState.keys.up) ay -= 1;
    if (tagState.keys.down) ay += 1;
    if (tagState.keys.left) ax -= 1;
    if (tagState.keys.right) ax += 1;
    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      tagState.vx += (ax / len) * TAG_ACCEL * dt;
      tagState.vy += (ay / len) * TAG_ACCEL * dt;
    }
    const dragFactor = Math.max(0, 1 - TAG_DRAG * dt);
    tagState.vx *= dragFactor;
    tagState.vy *= dragFactor;

    const speedBoosted = (tag.effects?.[state.uid]?.speedUntil || 0) > serverNow();
    const maxSpeed = TAG_MAX_SPEED * (speedBoosted ? TAG_SPEED_BOOST_MULT : 1);
    const speed = Math.hypot(tagState.vx, tagState.vy);
    if (speed > maxSpeed) {
      tagState.vx = (tagState.vx / speed) * maxSpeed;
      tagState.vy = (tagState.vy / speed) * maxSpeed;
    }

    const arenaW = tag.arenaW || 1400;
    const arenaH = tag.arenaH || 900;
    tagState.x = Math.max(TAG_PLAYER_RADIUS, Math.min(arenaW - TAG_PLAYER_RADIUS, tagState.x + tagState.vx * dt));
    tagState.y = Math.max(TAG_PLAYER_RADIUS, Math.min(arenaH - TAG_PLAYER_RADIUS, tagState.y + tagState.vy * dt));

    if (now - tagState.lastBroadcastAt > TAG_BROADCAST_INTERVAL_MS) {
      tagState.lastBroadcastAt = now;
      updateTagPosition(state.code, state.uid, Math.round(tagState.x), Math.round(tagState.y));
    }

    const amInfected = !!tag.infected?.[state.uid];
    if (amInfected) {
      Object.entries(tag.positions || {}).forEach(([uid, pos]) => {
        if (uid === state.uid || tag.infected?.[uid]) return;
        const targetShielded = (tag.effects?.[uid]?.shieldUntil || 0) > serverNow();
        if (targetShielded) return;
        const dist = Math.hypot(tagState.x - pos.x, tagState.y - pos.y);
        if (dist < TAG_PLAYER_RADIUS * 2) claimTagInfection(state.code, uid);
      });
    } else {
      Object.entries(tag.powerups || {}).forEach(([id, p]) => {
        const dist = Math.hypot(tagState.x - p.x, tagState.y - p.y);
        if (dist < TAG_PLAYER_RADIUS + TAG_POWERUP_RADIUS) claimTagPowerup(state.code, state.uid, id, p.type);
      });
    }
  }

  // Renderiza todos os jogadores (posições mais recentes conhecidas via room).
  // Os outros jogadores só recebem uma posição nova a cada ~120ms (o ritmo
  // de transmissão de cada cliente), por isso suaviza-se visualmente o
  // movimento deles (o próprio jogador já é 100% local, sem essa lacuna).
  Object.keys(room.players || {}).forEach((uid) => {
    const isMe = uid === state.uid;
    const target = isMe ? { x: tagState.x, y: tagState.y } : tag.positions?.[uid];
    if (!target) return;
    let display = tagState.playerDisplayPos[uid];
    if (!display) {
      display = { x: target.x, y: target.y };
      tagState.playerDisplayPos[uid] = display;
    }
    if (isMe) {
      display.x = target.x;
      display.y = target.y;
    } else {
      const smoothing = Math.min(1, dt * 8);
      display.x += (target.x - display.x) * smoothing;
      display.y += (target.y - display.y) * smoothing;
    }
    const el = tagPlayerEl(uid, room.players[uid].name || "?");
    const infected = !!tag.infected?.[uid];
    const shielded = (tag.effects?.[uid]?.shieldUntil || 0) > serverNow();
    const speedy = (tag.effects?.[uid]?.speedUntil || 0) > serverNow();
    el.classList.toggle("tag-player-infected", infected);
    el.classList.toggle("tag-player-survivor", !infected);
    el.classList.toggle("tag-player-me", isMe);
    el.classList.toggle("tag-player-shield", shielded);
    el.classList.toggle("tag-player-speed", speedy && !shielded);
    el.style.left = `${display.x}px`;
    el.style.top = `${display.y}px`;
  });
  tagRenderPowerups(tag.powerups);

  const viewportW = tagEls.arena.clientWidth;
  const viewportH = tagEls.arena.clientHeight;
  const arenaW = tag.arenaW || 1400;
  const arenaH = tag.arenaH || 900;
  const camX = Math.max(0, Math.min(tagState.x - viewportW / 2, arenaW - viewportW));
  const camY = Math.max(0, Math.min(tagState.y - viewportH / 2, arenaH - viewportH));
  tagState.worldEl.style.transform = `translate(${-camX}px, ${-camY}px)`;

  tagState.rafId = requestAnimationFrame(tagTick);
}

function renderTag(room) {
  const tag = room.tag;
  if (!tag) return;
  if (!tagState.active) tagEnter(room);

  const amInfected = !!tag.infected?.[state.uid];
  if (!tag.resolved) {
    const msLeft = Math.max(0, (tag.endAt || 0) - serverNow());
    tagEls.timer.textContent = `${Math.ceil(msLeft / 1000)}s`;
    tagEls.statusLine.textContent = amInfected
      ? "Estás INFETADO — encosta aos outros para os apanhar!"
      : "Foge dos infetados! Apanha os power-ups no chão.";
    tagEls.results.classList.add("hidden");
    tagEls.continueBtn.classList.add("hidden");
  } else {
    tagEls.timer.textContent = "";
    tagEls.statusLine.textContent = "Ronda terminada!";
    tagEls.results.classList.remove("hidden");
    tagEls.results.innerHTML = "";
    const startedAt = tag.startedAt || 0;
    Object.entries(room.players || {}).forEach(([uid, p]) => {
      const survived = tag.survived ? !!tag.survived[uid] : !tag.infected?.[uid];
      const infectedAt = tag.infectedAt?.[uid];
      const detail = survived
        ? "sobreviveu à ronda toda!"
        : `apanhado aos ${Math.max(0, Math.round(((infectedAt || startedAt) - startedAt) / 1000))}s`;
      const row = document.createElement("div");
      row.className = "score-row";
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm")}${escapeHtml(p.name)}</span>
        <span class="score-round">${detail}</span>
        <span class="score-total">+${tag.roundPoints?.[uid] || 0} pts</span>`;
      tagEls.results.appendChild(row);
    });
    tagEls.continueBtn.classList.toggle("hidden", !isHost(room));
  }
}

// ---------- LABIRINTO: BATALHA EM EQUIPA ----------
// Mesmo padrão de tempo real "por confiança" da Fuga da Infeção: cada
// cliente controla e transmite só a sua posição, e deteta localmente tanto
// a apanha de armas como os golpes que dá (a câmara também segue sempre o
// PRÓPRIO jogador). A diferença é que aqui há paredes fixas a formar um
// labirinto (colisão resolvida localmente com battleClampToWalls, a mesma
// função pura usada no servidor para validar onde as armas podem surgir) e
// um sistema de vidas: sem arma apanhada não se consegue atacar.

const BATTLE_ACCEL = 900;
const BATTLE_DRAG = 3.2;
const BATTLE_MAX_SPEED = 240;
const BATTLE_BROADCAST_INTERVAL_MS = 120;

const battleEls = {
  statusLine: document.getElementById("battle-status-line"),
  timer: document.getElementById("battle-timer"),
  arena: document.getElementById("battle-arena"),
  results: document.getElementById("battle-results"),
  continueBtn: document.getElementById("battle-continue-btn"),
};

const battleState = {
  active: false,
  x: 0, y: 0, vx: 0, vy: 0,
  keys: { up: false, down: false, left: false, right: false },
  lastFrame: 0,
  lastBroadcastAt: 0,
  lastAttackAt: 0,
  swingUntil: 0,
  keydownHandler: null,
  keyupHandler: null,
  rafId: null,
  worldEl: null,
  playerEls: {},
  livesEls: {},
  weaponEls: {},
  playerDisplayPos: {},
};

battleEls.continueBtn.addEventListener("click", () => {
  finishBattleRound(state.code, state.room);
});

function battleAttack() {
  const room = state.room;
  const battle = room?.battle;
  if (!battle || battle.resolved) return;
  if (battle.eliminated?.[state.uid]) return;
  const armedUntil = battle.armed?.[state.uid] || 0;
  if (armedUntil < serverNow()) return;
  const now = performance.now();
  if (now - battleState.lastAttackAt < BATTLE_ATTACK_COOLDOWN_MS) return;
  battleState.lastAttackAt = now;
  battleState.swingUntil = now + 180;
  Object.entries(battle.positions || {}).forEach(([uid, pos]) => {
    if (uid === state.uid || battle.eliminated?.[uid]) return;
    const dist = Math.hypot(battleState.x - pos.x, battleState.y - pos.y);
    if (dist < BATTLE_ATTACK_RADIUS) claimBattleHit(state.code, room, state.uid, uid);
  });
}

function battleHandleKey(e, isDown) {
  const map = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
  const dir = map[e.key];
  if (dir) {
    e.preventDefault();
    battleState.keys[dir] = isDown;
    return;
  }
  if ((e.key === " " || e.code === "Space") && isDown && !e.repeat) {
    e.preventDefault();
    battleAttack();
  }
}

function battleRenderWalls() {
  BATTLE_WALLS.forEach((wall) => {
    const el = document.createElement("div");
    el.className = "battle-wall";
    el.style.left = `${wall.x}px`;
    el.style.top = `${wall.y}px`;
    el.style.width = `${wall.w}px`;
    el.style.height = `${wall.h}px`;
    battleState.worldEl.appendChild(el);
  });
}

function battleEnter(room) {
  battleState.active = true;
  const myPos = room.battle?.positions?.[state.uid];
  battleState.x = myPos?.x ?? (room.battle?.arenaW || 1400) / 2;
  battleState.y = myPos?.y ?? (room.battle?.arenaH || 900) / 2;
  battleState.vx = 0;
  battleState.vy = 0;
  battleState.keys = { up: false, down: false, left: false, right: false };
  battleState.playerEls = {};
  battleState.livesEls = {};
  battleState.weaponEls = {};
  battleState.playerDisplayPos = {};
  battleState.lastAttackAt = 0;
  battleState.swingUntil = 0;

  battleEls.arena.innerHTML = "";
  battleState.worldEl = document.createElement("div");
  battleState.worldEl.className = "battle-world";
  battleState.worldEl.style.width = `${room.battle?.arenaW || 1400}px`;
  battleState.worldEl.style.height = `${room.battle?.arenaH || 900}px`;
  battleEls.arena.appendChild(battleState.worldEl);
  battleRenderWalls();

  battleState.keydownHandler = (e) => battleHandleKey(e, true);
  battleState.keyupHandler = (e) => battleHandleKey(e, false);
  document.addEventListener("keydown", battleState.keydownHandler);
  document.addEventListener("keyup", battleState.keyupHandler);

  showTouchControls({ action: { key: " ", label: "Atacar" } });
  battleState.lastFrame = performance.now();
  battleState.rafId = requestAnimationFrame(battleTick);
}

function battleExit() {
  hideTouchControls();
  battleState.active = false;
  if (battleState.rafId) cancelAnimationFrame(battleState.rafId);
  battleState.rafId = null;
  if (battleState.keydownHandler) document.removeEventListener("keydown", battleState.keydownHandler);
  if (battleState.keyupHandler) document.removeEventListener("keyup", battleState.keyupHandler);
  battleState.keydownHandler = null;
  battleState.keyupHandler = null;
}

function battlePlayerEl(uid, name) {
  if (battleState.playerEls[uid]) return battleState.playerEls[uid];
  const el = document.createElement("div");
  el.className = "battle-player";
  const label = document.createElement("span");
  label.className = "battle-player-name";
  label.textContent = name;
  el.appendChild(label);
  const lives = document.createElement("span");
  lives.className = "battle-player-lives";
  el.appendChild(lives);
  battleState.worldEl.appendChild(el);
  battleState.playerEls[uid] = el;
  battleState.livesEls[uid] = lives;
  return el;
}

function battleRenderWeapons(weapons) {
  const seen = new Set();
  Object.entries(weapons || {}).forEach(([id, w]) => {
    seen.add(id);
    let el = battleState.weaponEls[id];
    if (!el) {
      el = document.createElement("div");
      el.className = "battle-weapon";
      el.textContent = "🗡️";
      battleState.worldEl.appendChild(el);
      battleState.weaponEls[id] = el;
    }
    el.style.left = `${w.x}px`;
    el.style.top = `${w.y}px`;
  });
  Object.keys(battleState.weaponEls).forEach((id) => {
    if (!seen.has(id)) {
      battleState.weaponEls[id].remove();
      delete battleState.weaponEls[id];
    }
  });
}

function battleTick(now) {
  if (!battleState.active) return;
  const room = state.room;
  const battle = room?.battle;
  if (!battle) { battleState.rafId = requestAnimationFrame(battleTick); return; }

  const dt = Math.min((now - battleState.lastFrame) / 1000, 0.05);
  battleState.lastFrame = now;

  const amEliminated = !!battle.eliminated?.[state.uid];
  if (!battle.resolved && !amEliminated) {
    let ax = 0, ay = 0;
    if (battleState.keys.up) ay -= 1;
    if (battleState.keys.down) ay += 1;
    if (battleState.keys.left) ax -= 1;
    if (battleState.keys.right) ax += 1;
    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      battleState.vx += (ax / len) * BATTLE_ACCEL * dt;
      battleState.vy += (ay / len) * BATTLE_ACCEL * dt;
    }
    const dragFactor = Math.max(0, 1 - BATTLE_DRAG * dt);
    battleState.vx *= dragFactor;
    battleState.vy *= dragFactor;
    const speed = Math.hypot(battleState.vx, battleState.vy);
    if (speed > BATTLE_MAX_SPEED) {
      battleState.vx = (battleState.vx / speed) * BATTLE_MAX_SPEED;
      battleState.vy = (battleState.vy / speed) * BATTLE_MAX_SPEED;
    }

    const arenaW = battle.arenaW || 1400;
    const arenaH = battle.arenaH || 900;
    const nx = Math.max(BATTLE_PLAYER_RADIUS, Math.min(arenaW - BATTLE_PLAYER_RADIUS, battleState.x + battleState.vx * dt));
    const ny = Math.max(BATTLE_PLAYER_RADIUS, Math.min(arenaH - BATTLE_PLAYER_RADIUS, battleState.y + battleState.vy * dt));
    const resolved = battleClampToWalls(nx, ny, BATTLE_PLAYER_RADIUS);
    battleState.x = resolved.x;
    battleState.y = resolved.y;

    if (now - battleState.lastBroadcastAt > BATTLE_BROADCAST_INTERVAL_MS) {
      battleState.lastBroadcastAt = now;
      updateBattlePosition(state.code, state.uid, Math.round(battleState.x), Math.round(battleState.y));
    }

    const armedUntil = battle.armed?.[state.uid] || 0;
    if (armedUntil < serverNow()) {
      Object.entries(battle.weapons || {}).forEach(([id, w]) => {
        const dist = Math.hypot(battleState.x - w.x, battleState.y - w.y);
        if (dist < BATTLE_PLAYER_RADIUS + BATTLE_WEAPON_RADIUS) claimBattleWeapon(state.code, state.uid, id);
      });
    }
  }

  // Renderiza todos os jogadores (mesma suavização visual da Fuga da
  // Infeção para quem não é o próprio — ver nota lá em cima).
  Object.keys(room.players || {}).forEach((uid) => {
    const isMe = uid === state.uid;
    const eliminated = !!battle.eliminated?.[uid];
    const target = isMe ? { x: battleState.x, y: battleState.y } : battle.positions?.[uid];
    if (!target) return;
    let display = battleState.playerDisplayPos[uid];
    if (!display) {
      display = { x: target.x, y: target.y };
      battleState.playerDisplayPos[uid] = display;
    }
    if (isMe) {
      display.x = target.x;
      display.y = target.y;
    } else {
      const smoothing = Math.min(1, dt * 8);
      display.x += (target.x - display.x) * smoothing;
      display.y += (target.y - display.y) * smoothing;
    }
    const el = battlePlayerEl(uid, room.players[uid].name || "?");
    const armed = (battle.armed?.[uid] || 0) > serverNow();
    el.classList.toggle("battle-player-me", isMe);
    el.classList.toggle("battle-player-armed", armed);
    el.classList.toggle("battle-player-eliminated", eliminated);
    el.style.left = `${display.x}px`;
    el.style.top = `${display.y}px`;
    const lives = Math.max(0, battle.lives?.[uid] ?? BATTLE_LIVES);
    battleState.livesEls[uid].textContent = "❤".repeat(lives);
  });
  battleRenderWeapons(battle.weapons);

  const viewportW = battleEls.arena.clientWidth;
  const viewportH = battleEls.arena.clientHeight;
  const arenaW = battle.arenaW || 1400;
  const arenaH = battle.arenaH || 900;
  const camX = Math.max(0, Math.min(battleState.x - viewportW / 2, arenaW - viewportW));
  const camY = Math.max(0, Math.min(battleState.y - viewportH / 2, arenaH - viewportH));
  battleState.worldEl.style.transform = `translate(${-camX}px, ${-camY}px)`;

  battleState.rafId = requestAnimationFrame(battleTick);
}

function renderBattle(room) {
  const battle = room.battle;
  if (!battle) return;
  if (!battleState.active) battleEnter(room);

  const amEliminated = !!battle.eliminated?.[state.uid];
  const amArmed = (battle.armed?.[state.uid] || 0) > serverNow();
  if (!battle.resolved) {
    const msLeft = Math.max(0, (battle.endAt || 0) - serverNow());
    battleEls.timer.textContent = `${Math.ceil(msLeft / 1000)}s`;
    battleEls.statusLine.textContent = amEliminated
      ? "Foste eliminado — vê o resto da batalha em modo espetador."
      : amArmed
        ? "Estás ARMADO! Espaço para atacar quem estiver perto."
        : "Apanha uma arma no chão para poderes atacar. Foge de quem já tiver uma!";
    battleEls.results.classList.add("hidden");
    battleEls.continueBtn.classList.add("hidden");
  } else {
    battleEls.timer.textContent = "";
    battleEls.statusLine.textContent = "Batalha terminada!";
    battleEls.results.classList.remove("hidden");
    battleEls.results.innerHTML = "";
    Object.entries(room.players || {}).forEach(([uid, p]) => {
      const alive = battle.alive ? !!battle.alive[uid] : !battle.eliminated?.[uid];
      const kills = battle.kills?.[uid] || 0;
      const detail = alive
        ? `sobreviveu! ${kills} abate${kills === 1 ? "" : "s"}`
        : `eliminado — ${kills} abate${kills === 1 ? "" : "s"}`;
      const row = document.createElement("div");
      row.className = "score-row";
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm")}${escapeHtml(p.name)}</span>
        <span class="score-round">${detail}</span>
        <span class="score-total">+${battle.roundPoints?.[uid] || 0} pts</span>`;
      battleEls.results.appendChild(row);
    });
    battleEls.continueBtn.classList.toggle("hidden", !isHost(room));
  }
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
      <span class="final-name">${avatarImgHtml(p.avatar, "sm")}${escapeHtml(p.name)}</span>
      <span class="final-score">${p.score || 0} pts</span>`;
    finalEls.ranking.appendChild(row);
  });
  finalEls.rematchBtn.classList.toggle("hidden", !isHost(room));
}

// ---------- OPÇÕES (classificação + rabisco coletivo) ----------
// Botão flutuante disponível em qualquer ecrã dentro de uma sala — mostra
// a classificação em tempo real e um quadro de rabisco só por diversão
// (cada jogador na sua cor, sem "vez"/dono — ao contrário do Desenha e
// Adivinha, aqui todos podem escrever ao mesmo tempo, não vale pontos).

const SCRATCHPAD_PALETTE = ["#c0524a", "#3f7d5c", "#3a5f8a", "#b8862f", "#7a4f9e", "#2f8a86", "#a15a2e", "#5a6b3a"];
const SCRATCHPAD_BROADCAST_INTERVAL_MS = 90;
const SCRATCHPAD_MIN_DIST = 0.006;

const optionsEls = {
  fab: document.getElementById("options-fab"),
  overlay: document.getElementById("options-overlay"),
  tabLeaderboard: document.getElementById("options-tab-leaderboard"),
  tabScratchpad: document.getElementById("options-tab-scratchpad"),
  panelLeaderboard: document.getElementById("options-panel-leaderboard"),
  panelScratchpad: document.getElementById("options-panel-scratchpad"),
  leaderboardList: document.getElementById("options-leaderboard-list"),
  canvas: document.getElementById("options-scratchpad-canvas"),
  clearBtn: document.getElementById("options-scratchpad-clear-btn"),
  closeBtn: document.getElementById("options-close-btn"),
};

const scratchpadState = {
  drawing: false,
  lastPoint: null,
  pending: [],
  lastBroadcastAt: 0,
  dpr: 1,
  rectW: 0,
  rectH: 0,
};

function scratchpadColorForUid(room, uid) {
  const ids = Object.keys(room?.players || {});
  const idx = Math.max(0, ids.indexOf(uid));
  return SCRATCHPAD_PALETTE[idx % SCRATCHPAD_PALETTE.length];
}

function renderOptionsLeaderboard(room) {
  const players = Object.entries(room.players || {});
  players.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
  optionsEls.leaderboardList.innerHTML = "";
  players.forEach(([uid, p], i) => {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `<span class="score-name">${i === 0 ? "👑 " : `#${i + 1} `}${avatarImgHtml(p.avatar, "sm")}${escapeHtml(p.name)}</span>
      <span class="score-total">${p.score || 0} pts</span>`;
    optionsEls.leaderboardList.appendChild(row);
  });
}

function scratchpadSyncCanvasSize() {
  const canvas = optionsEls.canvas;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  scratchpadState.dpr = dpr;
  scratchpadState.rectW = rect.width;
  scratchpadState.rectH = rect.height;
  return true;
}

function scratchpadRedraw() {
  if (!scratchpadSyncCanvasSize()) return;
  const canvas = optionsEls.canvas;
  const ctx = canvas.getContext("2d");
  const { dpr, rectW, rectH } = scratchpadState;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rectW, rectH);
  const room = state.room;
  const points = [...(room?.scratchpad?.points || []), ...scratchpadState.pending];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  let prev = null;
  points.forEach((p) => {
    const x = p.x * rectW;
    const y = p.y * rectH;
    if (p.newStroke || !prev) {
      prev = { x, y };
      return;
    }
    ctx.strokeStyle = scratchpadColorForUid(room, p.uid);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    prev = { x, y };
  });
}

function scratchpadPointFromEvent(e) {
  const rect = optionsEls.canvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  return { x, y };
}

function scratchpadFlush() {
  if (scratchpadState.pending.length === 0) return;
  const toSend = scratchpadState.pending;
  scratchpadState.pending = [];
  scratchpadState.lastBroadcastAt = performance.now();
  pushScratchpadPoints(state.code, state.room, toSend);
}

optionsEls.canvas.addEventListener("pointerdown", (e) => {
  if (!state.code) return;
  e.preventDefault();
  optionsEls.canvas.setPointerCapture(e.pointerId);
  scratchpadState.drawing = true;
  const p = scratchpadPointFromEvent(e);
  scratchpadState.lastPoint = p;
  scratchpadState.pending.push({ x: p.x, y: p.y, uid: state.uid, newStroke: true });
  scratchpadRedraw();
});
optionsEls.canvas.addEventListener("pointermove", (e) => {
  if (!scratchpadState.drawing) return;
  const p = scratchpadPointFromEvent(e);
  const last = scratchpadState.lastPoint;
  const dist = last ? Math.hypot(p.x - last.x, p.y - last.y) : 1;
  if (dist < SCRATCHPAD_MIN_DIST) return;
  scratchpadState.lastPoint = p;
  scratchpadState.pending.push({ x: p.x, y: p.y, uid: state.uid, newStroke: false });
  scratchpadRedraw();
  if (performance.now() - scratchpadState.lastBroadcastAt > SCRATCHPAD_BROADCAST_INTERVAL_MS) {
    scratchpadFlush();
  }
});
function scratchpadEndStroke() {
  if (!scratchpadState.drawing) return;
  scratchpadState.drawing = false;
  scratchpadState.lastPoint = null;
  scratchpadFlush();
}
optionsEls.canvas.addEventListener("pointerup", scratchpadEndStroke);
optionsEls.canvas.addEventListener("pointercancel", scratchpadEndStroke);
optionsEls.canvas.addEventListener("pointerleave", scratchpadEndStroke);

optionsEls.clearBtn.addEventListener("click", () => {
  clearScratchpad(state.code);
});

function optionsShowTab(tab) {
  const isLeaderboard = tab === "leaderboard";
  optionsEls.tabLeaderboard.classList.toggle("active", isLeaderboard);
  optionsEls.tabScratchpad.classList.toggle("active", !isLeaderboard);
  optionsEls.panelLeaderboard.classList.toggle("hidden", !isLeaderboard);
  optionsEls.panelScratchpad.classList.toggle("hidden", isLeaderboard);
  if (!isLeaderboard) scratchpadRedraw();
}
optionsEls.tabLeaderboard.addEventListener("click", () => optionsShowTab("leaderboard"));
optionsEls.tabScratchpad.addEventListener("click", () => optionsShowTab("scratchpad"));

optionsEls.fab.addEventListener("click", () => {
  if (!state.room) return;
  optionsShowTab("leaderboard");
  renderOptionsLeaderboard(state.room);
  optionsEls.overlay.classList.remove("hidden");
});
optionsEls.closeBtn.addEventListener("click", () => {
  optionsEls.overlay.classList.add("hidden");
});

window.addEventListener("resize", () => {
  if (!optionsEls.overlay.classList.contains("hidden")) scratchpadRedraw();
});

// Chamado a cada atualização da sala para manter a classificação e o
// rabisco em tempo real enquanto o overlay estiver aberto.
function refreshOptionsIfOpen(room) {
  if (optionsEls.overlay.classList.contains("hidden")) return;
  renderOptionsLeaderboard(room);
  scratchpadRedraw();
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
    } else if (room.state === "mapTrivia") {
      const mt = room.mapTrivia;
      if (mt && !mt.resolved) {
        const connectedIds = Object.keys(room.players || {}).filter((uid) => room.players[uid].connected);
        const allAnswered = connectedIds.length > 0
          && connectedIds.every((uid) => mt.answers && mt.answers[uid] !== undefined);
        if (now >= (mt.endAt || 0) || allAnswered) {
          await resolveMapTriviaRound(state.code, room);
        }
      } else if (mt && mt.resolved) {
        if (now - (mt.resolvedAt || 0) > MAP_TRIVIA_RESULT_DISPLAY_MS) {
          await advanceMapTriviaRoundOrFinish(state.code, room);
        }
      }
    } else if (room.state === "tag") {
      const tag = room.tag;
      if (tag && !tag.resolved) {
        const activePowerups = Object.keys(tag.powerups || {}).length;
        if (activePowerups < TAG_POWERUP_MAX_ACTIVE && now - (tag.lastPowerupSpawnAt || 0) > TAG_POWERUP_SPAWN_INTERVAL_MS) {
          await spawnTagPowerup(state.code, room);
        }
        const connectedIds = Object.keys(room.players || {}).filter((uid) => room.players[uid].connected);
        const allInfected = connectedIds.length > 0 && connectedIds.every((uid) => tag.infected?.[uid]);
        if (now >= (tag.endAt || 0) || allInfected) {
          await resolveTagRound(state.code, room);
        }
      } else if (tag && tag.resolved) {
        if (now - (tag.resolvedAt || 0) > TAG_RESULT_DISPLAY_MS) {
          await finishTagRound(state.code, room);
        }
      }
    } else if (room.state === "battle") {
      const battle = room.battle;
      if (battle && !battle.resolved) {
        const activeWeapons = Object.keys(battle.weapons || {}).length;
        if (activeWeapons < BATTLE_WEAPON_MAX_ACTIVE && now - (battle.lastWeaponSpawnAt || 0) > BATTLE_WEAPON_SPAWN_INTERVAL_MS) {
          await spawnBattleWeapon(state.code, room);
        }
        const connectedIds = Object.keys(room.players || {}).filter((uid) => room.players[uid].connected);
        const aliveCount = connectedIds.filter((uid) => !battle.eliminated?.[uid]).length;
        if (now >= (battle.endAt || 0) || (connectedIds.length > 1 && aliveCount <= 1)) {
          await resolveBattleRound(state.code, room);
        }
      } else if (battle && battle.resolved) {
        if (now - (battle.resolvedAt || 0) > BATTLE_RESULT_DISPLAY_MS) {
          await finishBattleRound(state.code, room);
        }
      }
    }
  } finally {
    hostLoopBusy = false;
  }
}

// ---------- INIT ----------

async function init() {
  showScreen("home");
  showHomeError("A ligar ao servidor...");
  try {
    state.uid = await getUid();
  } catch (err) {
    showHomeError("Não foi possível ligar ao servidor. Verifica a configuração do Firebase (firebase-config.js) e se o login anónimo está ativado.");
    return;
  }
  showHomeError("");
  els.createBtn.disabled = false;
  els.joinBtn.disabled = false;
  // Verificação periódica: garante que transições por tempo (fim de ronda,
  // fim de votação, bola sem resposta) acontecem mesmo que ninguém escreva
  // nada na base de dados entretanto.
  setInterval(() => {
    if (state.room) runHostLoopTick(state.room);
  }, 1000);
}

init();
