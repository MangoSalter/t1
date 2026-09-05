import { getUid, serverNow } from "./firebase-init.js";
import { showTouchControls, hideTouchControls } from "./touch-controls.js";
// As ferramentas são as MESMAS do quadro solo, não uma cópia: o que é um
// "marcador" tem de ser a mesma coisa nos dois sítios, senão o mesmo botão
// desenha diferente conforme o ecrã em que se está.
import { BOARD_TOOLS } from "./board.js";
import { say as narrar } from "./voice.js";
import { sfx } from "./sfx.js";
import {
  CATEGORIES, DEFAULT_CONFIG, CONFIG_LIMITS, MAX_PLAYERS, catKey, MIN_ENABLED_CATEGORIES,
  MAP_BACKGROUND_SVG, LANDMARKS,
} from "./data.js";
import {
  createRoom, joinRoom, listenRoom, updateConfig, maybeReclaimHost, updatePlayerAvatar,
  startGame, startQuickBonusGame, pushScratchpadPoints, clearScratchpad,
  startBallPhase, claimBallWin, startLetterPick, voteLetter,
  confirmLetter, submitAnswer, finishCategoriesRound, startVoting,
  castVote, finishVoting, nextRoundOrFinal, resetForRematch, leaveRoom,
  finishHangman, clearHangmanDoodle, pushHangmanDoodlePoints, pointsObjectToArray,
  undoLastHangmanStroke,
  passHangmanPen, passHangmanPenRandom,
  BOARD_MODES, DEFAULT_BOARD_MODE, setBoardMode, canSetBoardMode, votePenHolder, applyBoardVotes,
  raiseHand, lowerHand, handQueue, connectedPlayerIds, tallyVotes, votesNeeded,
  maskWord, revealLetter, maskIsSolved, setHangmanPuzzle, updateHangmanMask,
  addHangmanMiss, clearHangmanPuzzle, HANGMAN_MAX_MISSES, DOODLE_BOARD_FULL,
  HANGMAN_PLAYER_COLORS, takenHangmanColors, pickHangmanColor, playerColor,
  hangmanGuessers, currentGuesser, submitLetterGuess, passGuessTurn,
  resolveGuess, wrongLetters, letterAlreadyTried, modeAllowsTool,
  BOARD_SETTINGS_SPEC, boardSetting, setBoardSetting, maxMissesOf, canGuessNow,
  freeGuessing, MAX_TEAMS, teamsOn, teamsLocked, teamList, setPlayMode,
  setTeamCount, joinTeam, renameTeam, teamOfPlayer,
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
  updateRacer, crashRacer, resolveRaceRound, finishRaceRound, raceObstacleLane, racerTimeMs,
  raceSpawnIntervalAt, raceSpeedAt,
  RACE_LANES, RACE_CAR_W, RACE_CAR_H, RACE_ROAD_H, RACE_PLAYER_Y, RACE_BASE_SPEED,
  RACE_SPAWN_INTERVAL_START_MS, RACE_BROADCAST_MS, RACE_RESULT_DISPLAY_MS,
  submitLandmarkAnswer, resolveLandmarkRound, advanceLandmarkRoundOrFinish,
  LANDMARK_TEAM_POINTS, LANDMARK_TEAM_RESULT_DISPLAY_MS,
  updateGolfBall, claimGolfFinish, claimGolfPowerup, useGolfCharge, spawnGolfPowerup,
  pruneGolfBarriers, golfActiveWalls, resolveGolfRound, finishGolfRound,
  GOLF_MP_COURSE_W, GOLF_MP_COURSE_H, GOLF_MP_BALL_RADIUS, GOLF_MP_HOLE_RADIUS,
  GOLF_MP_START, GOLF_MP_HOLE, GOLF_MP_WALLS, GOLF_MP_POWERUP_RADIUS,
  GOLF_MP_POWERUP_MAX_ACTIVE, GOLF_MP_POWERUP_SPAWN_INTERVAL_MS,
  GOLF_MP_BROADCAST_MS, GOLF_MP_RESULT_DISPLAY_MS,
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

// Enter no nome cria a sala; Enter no código entra na sala — a seguir a
// escrever, ninguém quer ir buscar o rato.
els.nameInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || els.createBtn.disabled) return;
  e.preventDefault();
  (els.joinCodeInput.value.trim() ? els.joinBtn : els.createBtn).click();
});
els.joinCodeInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || els.joinBtn.disabled) return;
  e.preventDefault();
  els.joinBtn.click();
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

function avatarImgHtml(avatarDataUrl, size, name) {
  // avatarDataUrl vem de outro jogador (via Firebase) — valida que é mesmo
  // um data URI de imagem antes de o meter num atributo src, e escapa na
  // mesma por defesa extra (um jogador tecnicamente curioso podia escrever
  // lá o que quisesse diretamente na base de dados, tal como o resto deste
  // jogo "por confiança" — ver nota acima da Forca).
  const isValidDataUrl = typeof avatarDataUrl === "string" && /^data:image\/(png|gif|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarDataUrl);
  const cls = size === "sm" ? "avatar-thumb-sm" : "avatar-thumb";
  // Sem avatar, um quadrado vazio com moldura lia-se como uma checkbox por
  // marcar em todas as classificações. A inicial do nome ocupa o mesmo
  // espaço, parece intencional, e ainda ajuda a distinguir jogadores.
  if (!isValidDataUrl) {
    const initial = (typeof name === "string" ? name.trim() : "").slice(0, 1).toUpperCase();
    return `<span class="${cls} avatar-thumb-initial">${escapeHtml(initial || "?")}</span>`;
  }
  return `<img class="${cls}" src="${escapeHtml(avatarDataUrl)}" alt="" />`;
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
  if (room.state !== "hangman") esquecerNarracao();
  if (room.state !== "tag" && tagState.active) tagExit();
  if (room.state !== "battle" && battleState.active) battleExit();
  if (room.state !== "race" && raceState.active) raceExit();
  if (room.state !== "golf" && golfMpState.active) golfMpExit();

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
    case "race": renderRace(room); showScreen("race"); break;
    case "landmark": renderLandmarkTeam(room); showScreen("landmark"); break;
    case "golf": renderGolfMp(room); showScreen("golf"); break;
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
  if (raceState.active) raceExit();
  if (golfMpState.active) golfMpExit();
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
// Mínimo de jogadores por jogo. Era 3 para todos (herdado da regra da fila
// de bónus de fim de partida), o que deixava os quadros de desenho mortos
// numa sala de teste com 1–2 pessoas: o botão não fazia nada e parecia que
// o jogo "não abria". Só os jogos de perseguição precisam mesmo de 2+.
const MP_GAME_MIN_PLAYERS = { hangman: 1, mapTrivia: 1, draw: 2, tag: 2, battle: 2, race: 2, landmark: 1, golf: 2 };

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
    li.innerHTML = avatarImgHtml(p.avatar, "sm", p.name)
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
  let blockedByPlayers = 0;
  mpGameButtons.forEach((btn) => {
    const min = MP_GAME_MIN_PLAYERS[btn.dataset.mpGame] ?? 2;
    const enough = connectedCount >= min;
    if (!enough) blockedByPlayers++;
    btn.disabled = !amHost || !enough;
    btn.title = enough ? "" : `Precisa de ${min}+ jogadores ligados.`;
  });
  lobbyEls.minigamesHint.textContent = !amHost
    ? "Só o anfitrião escolhe o jogo."
    : blockedByPlayers > 0
      ? `Salta as rondas clássicas e começa já neste. Há ${connectedCount} ligado(s) — alguns jogos precisam de mais.`
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
  // O sino do Stop: o momento em que alguem chega primeiro a bola e o mais
  // fisico do jogo todo, e era completamente mudo.
  sfx(won ? "stop" : "errado");
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
    // Enter salta para a categoria seguinte; no último campo, entrega.
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const inputs = [...catEls.list.querySelectorAll(".cat-item input")];
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) next.focus();
      else catEls.finishBtn.click();
    });
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
    row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
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
    ? (playerCount >= 3 ? "Quadro branco (bónus)" : "Ver resultados finais")
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
  screen: document.querySelector('[data-screen="hangman"]'),
  modeTitle: document.getElementById("hangman-mode-title"),
  penZone: document.getElementById("hangman-pen-zone"),
  boardZone: document.getElementById("hangman-board-zone"),
  colorRow: document.getElementById("hangman-color-row"),
  widthRow: document.getElementById("hangman-width-row"),
  toolsRow: document.getElementById("hangman-tools-row"),
  fillToggle: document.getElementById("hangman-fill-toggle"),
  modeBar: document.getElementById("hangman-mode-bar"),
  modeBtn: document.getElementById("hangman-mode-btn"),
  modeBtnViewer: document.getElementById("hangman-mode-btn-viewer"),
  modeHint: document.getElementById("hangman-mode-hint"),
  handBtn: document.getElementById("hangman-hand-btn"),
  handQueue: document.getElementById("hangman-hand-queue"),
  modeOverlay: document.getElementById("hangman-mode-overlay"),
  modeList: document.getElementById("hangman-mode-list"),
  modeCancelBtn: document.getElementById("hangman-mode-cancel-btn"),
  penVoteOverlay: document.getElementById("hangman-penvote-overlay"),
  penVoteList: document.getElementById("hangman-penvote-list"),
  penVoteCancelBtn: document.getElementById("hangman-penvote-cancel-btn"),
  backToFreeBtn: document.getElementById("hangman-backtofree-btn"),
  settingsBtn: document.getElementById("hangman-settings-btn"),
  settingsBtnViewer: document.getElementById("hangman-settings-btn-viewer"),
  settingsOverlay: document.getElementById("hangman-settings-overlay"),
  settingsList: document.getElementById("hangman-settings-list"),
  settingsCloseBtn: document.getElementById("hangman-settings-close-btn"),
  teamsBtn: document.getElementById("hangman-teams-btn"),
  teamsBtnViewer: document.getElementById("hangman-teams-btn-viewer"),
  teamsOverlay: document.getElementById("hangman-teams-overlay"),
  playToggle: document.getElementById("hangman-play-toggle"),
  teamCountRow: document.getElementById("hangman-team-count-row"),
  teamCountBtns: document.getElementById("hangman-team-count-btns"),
  teamBoxes: document.getElementById("hangman-team-boxes"),
  teamsHint: document.getElementById("hangman-teams-hint"),
  teamsCloseBtn: document.getElementById("hangman-teams-close-btn"),
  wordZone: document.getElementById("hangman-word-zone"),
  slots: document.getElementById("hangman-slots"),
  missesLabel: document.getElementById("hangman-misses"),
  wordForm: document.getElementById("hangman-word-form"),
  wordInput: document.getElementById("hangman-word-input"),
  hintInput: document.getElementById("hangman-hint-input"),
  hintLabel: document.getElementById("hangman-hint-label"),
  wordTools: document.getElementById("hangman-word-tools"),
  secretLabel: document.getElementById("hangman-secret"),
  letterInput: document.getElementById("hangman-letter-input"),
  revealBtn: document.getElementById("hangman-reveal-btn"),
  missBtn: document.getElementById("hangman-miss-btn"),
  newWordBtn: document.getElementById("hangman-newword-btn"),
  passTurnBtn: document.getElementById("hangman-passturn-btn"),
  wrongStrip: document.getElementById("hangman-wrong-strip"),
  wrongLetters: document.getElementById("hangman-wrong-letters"),
  slotsStrip: document.getElementById("hangman-slots-strip"),
  players: document.getElementById("hangman-players"),
  guessForm: document.getElementById("hangman-guess-form"),
  guessInput: document.getElementById("hangman-guess-input"),
  turnLabel: document.getElementById("hangman-turn-label"),
  colorOverlay: document.getElementById("hangman-color-overlay"),
  colorChoices: document.getElementById("hangman-color-choices"),
  colorWaiting: document.getElementById("hangman-color-waiting"),
  canvasWrap: document.querySelector(".hangman-canvas-wrap"),
  personalCanvas: document.getElementById("hangman-personal-canvas"),
  personalTools: document.getElementById("hangman-personal-tools"),
  personalToggle: document.getElementById("hangman-personal-toggle"),
  personalColors: document.getElementById("hangman-personal-colors"),
  personalEraser: document.getElementById("hangman-personal-eraser"),
  personalClear: document.getElementById("hangman-personal-clear"),
  doodleCanvas: document.getElementById("hangman-doodle-canvas"),
  clearBtn: document.getElementById("hangman-doodle-clear-btn"),
  undoBtn: document.getElementById("hangman-undo-btn"),
  continueBtn: document.getElementById("hangman-continue-btn"),
  passPenBtn: document.getElementById("hangman-pass-pen-btn"),
  penOverlay: document.getElementById("hangman-pen-overlay"),
  penList: document.getElementById("hangman-pen-list"),
  penRandomBtn: document.getElementById("hangman-pen-random-btn"),
  penCancelBtn: document.getElementById("hangman-pen-cancel-btn"),
};

// Cores e espessuras do quadro de sala. Menos do que no quadro solo de
// propósito: aqui cada traço viaja pela rede, e cada opção a mais é mais um
// campo em cada ponto enviado. Estas chegam para separar quem escreve o quê.
const HANGMAN_COLORS = ["#3a3126", "#b24b38", "#5c7e91", "#5b7442", "#e3a53d"];
const HANGMAN_WIDTHS = [2, 4, 9];

const hangmanDoodleState = {
  drawing: false,
  lastPoint: null,
  pending: [],
  lastBroadcastAt: 0,
  dpr: 1,
  rectW: 0,
  rectH: 0,
  color: HANGMAN_COLORS[0],
  width: HANGMAN_WIDTHS[1],
  erasing: false,
  tool: "pen",
  shapePending: null,
};

// O quadro de sala não tem câmara nem folha infinita: a mão de arrastar não
// faz aqui sentido nenhum. Tudo o resto do quadro solo vem para cá.
const HANGMAN_TOOL_KEYS = Object.keys(BOARD_TOOLS).filter((k) => !BOARD_TOOLS[k].pan);

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
  const points = [
    ...pointsObjectToArray(room?.hangman?.doodle?.points),
    ...hangmanDoodleState.pending,
    ...(hangmanDoodleState.shapePending ? [hangmanDoodleState.shapePending] : []),
  ];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // O estilo viaja só no PRIMEIRO ponto de cada traço, não em todos: repeti-lo
  // em cada ponto multiplicava por três o que vai para a rede a cada arrasto.
  // Pontos antigos não trazem estilo nenhum e caem nos valores de sempre.
  let prev = null;
  let style = { color: HANGMAN_DOODLE_INK, width: 4, erase: false };
  points.forEach((p) => {
    const x = p.x * rectW;
    const y = p.y * rectH;
    // Uma forma ou um texto é UMA entrada, não uma sequência de pontos: cada
    // traço aqui viaja pela rede, e mandar um retângulo como cem pontos seria
    // cem vezes mais mensagens para desenhar quatro linhas.
    if (p.shape || p.text) {
      drawHangmanItem(ctx, p, rectW, rectH);
      prev = null;
      return;
    }
    if (p.newStroke || !prev) {
      if (p.newStroke) {
        style = {
          color: p.color || HANGMAN_DOODLE_INK,
          width: p.width || 4,
          erase: !!p.erase,
        };
      }
      prev = { x, y };
      return;
    }
    ctx.globalCompositeOperation = style.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.erase ? style.width * 3.5 : style.width;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    prev = { x, y };
  });
  ctx.globalCompositeOperation = "source-over";
}

// Desenha uma forma ou um texto a partir da sua única entrada.
function drawHangmanItem(ctx, p, rectW, rectH) {
  const tool = BOARD_TOOLS[p.tool] || BOARD_TOOLS.pen;
  const x1 = p.x * rectW, y1 = p.y * rectH;
  const x2 = (p.x2 ?? p.x) * rectW, y2 = (p.y2 ?? p.y) * rectH;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = tool.alpha;
  ctx.strokeStyle = p.color || HANGMAN_DOODLE_INK;
  ctx.fillStyle = p.color || HANGMAN_DOODLE_INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lw = Math.max(1, (p.width || 4) * tool.widthScale);
  ctx.lineWidth = lw;

  if (p.text) {
    const size = Math.max(10, lw * 4);
    ctx.font = `${size}px "Patrick Hand", "Gaegu", cursive, sans-serif`;
    ctx.textBaseline = "top";
    String(p.text).split("\n").forEach((linha, i) => ctx.fillText(linha, x1, y1 + i * size * 1.2));
    ctx.restore();
    return;
  }

  ctx.beginPath();
  if (p.shape === "line") {
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  } else if (p.shape === "arrow") {
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const comp = Math.hypot(x2 - x1, y2 - y1);
    // A ponta nunca passa de 40% da seta: uma seta curta ficaria só ponta.
    const ponta = Math.min(comp * 0.4, Math.max(8, lw * 3.5));
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ponta * Math.cos(ang - Math.PI / 7), y2 - ponta * Math.sin(ang - Math.PI / 7));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ponta * Math.cos(ang + Math.PI / 7), y2 - ponta * Math.sin(ang + Math.PI / 7));
    ctx.stroke();
  } else if (p.shape === "rect") {
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    if (p.fill) ctx.fill();
    ctx.stroke();
  } else if (p.shape === "ellipse") {
    ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    if (p.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
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
  pushHangmanDoodlePoints(state.code, state.room, state.uid, toSend).then((r) => {
    // O quadro cheio diz-se. Antes o excesso comia os traços mais antigos em
    // silêncio, e quem estava a desenhar via o desenho a encolher sem
    // perceber porquê.
    if (r === DOODLE_BOARD_FULL) {
      hangmanEls.status.textContent = "O quadro está cheio — carrega em Limpar para continuar.";
    }
  });
}

function hangmanCurrentTool() {
  // A borracha continua a ser um botão à parte por ser a que mais se usa;
  // ligada, manda sobre a ferramenta escolhida.
  return hangmanDoodleState.erasing ? "eraser" : hangmanDoodleState.tool;
}

hangmanEls.doodleCanvas.addEventListener("pointerdown", (e) => {
  if (!hangmanAmLeader()) return;
  e.preventDefault();
  hangmanEls.doodleCanvas.setPointerCapture(e.pointerId);
  const p = hangmanDoodlePointFromEvent(e);
  const key = hangmanCurrentTool();
  const tool = BOARD_TOOLS[key];

  if (tool.text) {
    const texto = window.prompt("Texto a escrever no quadro:");
    if (texto && texto.trim()) {
      hangmanDoodleState.pending.push({
        x: p.x, y: p.y, newStroke: true, tool: key, text: texto.trim(),
        color: hangmanDoodleState.color, width: hangmanDoodleState.width,
      });
      hangmanDoodleFlush();
      hangmanDoodleRedraw();
    }
    return;
  }

  hangmanDoodleState.drawing = true;
  hangmanDoodleState.lastPoint = p;

  if (tool.shape) {
    // A forma só vai para a rede quando estiver acabada: enquanto se arrasta é
    // desenho local. Mandar cada passo do arrasto seria mandar o mesmo
    // retângulo dezenas de vezes.
    hangmanDoodleState.shapePending = {
      x: p.x, y: p.y, x2: p.x, y2: p.y, newStroke: true,
      tool: key, shape: key,
      color: hangmanDoodleState.color,
      width: hangmanDoodleState.width,
      fill: !!(tool.fillable && hangmanDoodleState.fill),
    };
    hangmanDoodleRedraw();
    return;
  }

  hangmanDoodleState.pending.push({
    x: p.x, y: p.y, newStroke: true, tool: key,
    color: hangmanDoodleState.color,
    width: hangmanDoodleState.width,
    erase: key === "eraser",
  });
  hangmanDoodleRedraw();
});

hangmanEls.doodleCanvas.addEventListener("pointermove", (e) => {
  if (!hangmanDoodleState.drawing) return;
  const p = hangmanDoodlePointFromEvent(e);

  if (hangmanDoodleState.shapePending) {
    hangmanDoodleState.shapePending.x2 = p.x;
    hangmanDoodleState.shapePending.y2 = p.y;
    hangmanDoodleRedraw();
    return;
  }

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
  const forma = hangmanDoodleState.shapePending;
  hangmanDoodleState.shapePending = null;
  if (forma) {
    // Um clique sem arrastar não é um retângulo de tamanho zero: é um clique.
    const arrastou = Math.hypot(forma.x2 - forma.x, forma.y2 - forma.y) > 0.004;
    if (arrastou) hangmanDoodleState.pending.push(forma);
    else hangmanDoodleRedraw();
  }
  hangmanDoodleFlush();
}
hangmanEls.doodleCanvas.addEventListener("pointerup", hangmanDoodleEndStroke);
hangmanEls.doodleCanvas.addEventListener("pointercancel", hangmanDoodleEndStroke);
hangmanEls.doodleCanvas.addEventListener("pointerleave", hangmanDoodleEndStroke);

hangmanEls.undoBtn.addEventListener("click", () => {
  // Antes de anular, deita fora o que ainda não foi enviado: senão o traço
  // meio transmitido chegava depois e ressuscitava metade do que se anulou.
  hangmanDoodleState.pending = [];
  hangmanDoodleState.shapePending = null;
  undoLastHangmanStroke(state.code, state.room, state.uid);
});

// Atalhos de teclado no quadro de sala, os mesmos do quadro solo. Quem
// desenha no computador espera-os, e o Ctrl+Z é o mais esperado de todos.
window.addEventListener("keydown", (e) => {
  if (!screens["hangman"]?.classList.contains("active")) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === "z") {
    e.preventDefault();
    if (hangmanAmLeader()) hangmanEls.undoBtn.click();
  } else if (!ctrl && hangmanAmLeader()) {
    // Só quem tem a caneta troca de ferramenta por atalho: aos outros, estas
    // teclas não fazem nada e não devem parecer que fazem.
    if (k === "b") selectHangmanTool("pen");
    else if (k === "e") selectHangmanTool("eraser");
    else if (k === "t" && modeAllowsTool(state.room?.hangman?.mode || DEFAULT_BOARD_MODE, "text")) selectHangmanTool("text");
    else if (k === "l") selectHangmanTool("line");
    else if (k === "r") selectHangmanTool("rect");
    else if (k === "o") selectHangmanTool("ellipse");
  }
});

hangmanEls.clearBtn.addEventListener("click", () => {
  clearHangmanDoodle(state.code, state.room, state.uid);
});
hangmanEls.continueBtn.addEventListener("click", () => {
  finishHangman(state.code, state.room);
});

// --- Passar a caneta ---
// O quadro é uma folha coletiva, mas escreve um de cada vez. Quem tem a
// caneta (ou o anfitrião, para destravar) escolhe quem escreve a seguir.

function hangmanOpenPenPicker() {
  const room = state.room;
  if (!room) return;
  hangmanEls.penList.innerHTML = "";
  Object.entries(room.players || {})
    .filter(([uid, p]) => uid !== room.hangman?.leaderId && p.connected)
    .forEach(([uid, p]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}`;
      btn.addEventListener("click", () => {
        passHangmanPen(state.code, state.room, state.uid, uid);
        hangmanClosePenPicker();
      });
      hangmanEls.penList.appendChild(btn);
    });
  if (hangmanEls.penList.children.length === 0) {
    hangmanEls.penList.innerHTML = '<p class="hint small">Não há mais ninguém ligado para receber a caneta.</p>';
  }
  hangmanEls.penOverlay.classList.remove("hidden");
}

function hangmanClosePenPicker() {
  hangmanEls.penOverlay.classList.add("hidden");
}

hangmanEls.passPenBtn.addEventListener("click", hangmanOpenPenPicker);
hangmanEls.penCancelBtn.addEventListener("click", hangmanClosePenPicker);
hangmanEls.penRandomBtn.addEventListener("click", async () => {
  await passHangmanPenRandom(state.code, state.room, state.uid);
  hangmanClosePenPicker();
});

window.addEventListener("resize", () => {
  if (screens["hangman"]?.classList.contains("active")) hangmanDoodleRedraw();
});

// --- Opções da caneta (zona 1 do esboço) ---

function buildHangmanPenZone() {
  hangmanEls.toolsRow.innerHTML = "";
  HANGMAN_TOOL_KEYS.forEach((key) => {
    const tool = BOARD_TOOLS[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-tool";
    btn.dataset.hangmanTool = key;
    btn.title = tool.label;
    btn.innerHTML = `<span aria-hidden="true">${tool.icon}</span><span class="board-tool-name">${tool.label}</span>`;
    btn.addEventListener("click", () => selectHangmanTool(key));
    hangmanEls.toolsRow.appendChild(btn);
  });
  hangmanEls.colorRow.innerHTML = "";
  HANGMAN_COLORS.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-color";
    btn.dataset.hangmanColor = color;
    btn.style.background = color;
    btn.setAttribute("aria-label", `Cor ${color}`);
    btn.addEventListener("click", () => selectHangmanColor(color));
    hangmanEls.colorRow.appendChild(btn);
  });
  hangmanEls.widthRow.innerHTML = "";
  HANGMAN_WIDTHS.forEach((w) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-width";
    btn.dataset.hangmanWidth = String(w);
    btn.setAttribute("aria-label", `Espessura ${w}`);
    btn.innerHTML = `<span class="board-width-dot" style="width:${w + 3}px;height:${w + 3}px"></span>`;
    btn.addEventListener("click", () => selectHangmanWidth(w));
    hangmanEls.widthRow.appendChild(btn);
  });
  refreshHangmanPenZone();
}

// O MODO manda no que aparece: um modo pode tirar ferramentas do ecrã. Na
// Forca sai o texto, porque quem desenha podia escrever a palavra na folha e
// acabar o jogo por engano no primeiro clique — tirar a ferramenta é mais
// honesto do que pedir que não se use.
function refreshHangmanPenZone(modeKey) {
  const st = hangmanDoodleState;
  const modo = modeKey || state.room?.hangman?.mode || DEFAULT_BOARD_MODE;
  const atual = hangmanCurrentTool();
  hangmanEls.toolsRow.querySelectorAll("[data-hangman-tool]").forEach((b) => {
    const key = b.dataset.hangmanTool;
    b.classList.toggle("hidden", !modeAllowsTool(modo, key));
    b.setAttribute("aria-pressed", String(key === atual));
  });
  // Se a ferramenta na mão deixou de existir neste modo, volta à caneta em vez
  // de ficar escolhida uma ferramenta que já não se vê.
  if (!modeAllowsTool(modo, atual)) {
    st.erasing = false;
    st.tool = "pen";
    hangmanEls.toolsRow.querySelectorAll("[data-hangman-tool]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.hangmanTool === "pen"));
    });
  }
  hangmanEls.colorRow.querySelectorAll("[data-hangman-color]").forEach((b) => {
    b.setAttribute("aria-pressed", String(!st.erasing && b.dataset.hangmanColor === st.color));
  });
  hangmanEls.widthRow.querySelectorAll("[data-hangman-width]").forEach((b) => {
    b.setAttribute("aria-pressed", String(Number(b.dataset.hangmanWidth) === st.width));
  });
  // A caixa de preencher só interessa a quem tem uma forma que se preencha.
  const preenchivel = !!BOARD_TOOLS[hangmanCurrentTool()]?.fillable;
  hangmanEls.fillToggle.parentElement.classList.toggle("hidden", !preenchivel);
}

function selectHangmanTool(key) {
  if (!BOARD_TOOLS[key]) return;
  hangmanDoodleState.erasing = key === "eraser";
  hangmanDoodleState.tool = key;
  refreshHangmanPenZone();
}

function selectHangmanColor(color) {
  hangmanDoodleState.color = color;
  // Escolher cor com a borracha na mão quer dizer "voltar a escrever".
  if (hangmanDoodleState.erasing) {
    hangmanDoodleState.erasing = false;
    hangmanDoodleState.tool = "pen";
  }
  refreshHangmanPenZone();
}

function selectHangmanWidth(w) {
  hangmanDoodleState.width = w;
  refreshHangmanPenZone();
}

buildHangmanPenZone();
hangmanEls.fillToggle.addEventListener("change", (e) => {
  hangmanDoodleState.fill = e.target.checked;
});

// --- Votar o modo do quadro (zonas 2 e a) ---

// Guarda o modo que estava a jogar-se quando o menu abriu: é assim que se
// sabe que a votação já deu resultado e o menu deixou de ter razão de estar
// aberto. Sem isto ficava a tapar o quadro depois de a mudança acontecer —
// exatamente o momento em que a pessoa quer ver a folha.
let hangmanModePickerOpenedFor = null;

function hangmanOpenModePicker() {
  const room = state.room;
  if (!room?.hangman) return;
  if (hangmanEls.modeOverlay.classList.contains("hidden")) {
    hangmanModePickerOpenedFor = room.hangman.mode;
  }
  hangmanEls.modeList.innerHTML = "";
  Object.entries(BOARD_MODES).forEach(([key, mode]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.modeChoice = key;
    const atual = room.hangman.mode === key ? " (a jogar agora)" : "";
    btn.innerHTML = `<b>${escapeHtml(mode.label)}${atual}</b><br>` +
      `<span class="hint small">${escapeHtml(mode.hint)}</span>`;
    btn.addEventListener("click", async () => {
      // Muda já, para todos. Se mudarem de ideias, é voltar a clicar.
      const mudou = await setBoardMode(state.code, state.room, state.uid, key);
      if (!mudou) hangmanCloseModePicker();
    });
    hangmanEls.modeList.appendChild(btn);
  });
  hangmanEls.modeOverlay.classList.remove("hidden");
}

function hangmanCloseModePicker() {
  hangmanEls.modeOverlay.classList.add("hidden");
  hangmanModePickerOpenedFor = null;
}

// --- Votar quem fica com a caneta (modo Forca) ---

function hangmanOpenPenVote() {
  const room = state.room;
  if (!room?.hangman) return;
  const connected = connectedPlayerIds(room);
  const counts = tallyVotes(room.hangman.penVotes, connected);
  const needed = votesNeeded(connected);
  const myVote = room.hangman.penVotes?.[state.uid];
  hangmanEls.penVoteList.innerHTML = "";
  connected.forEach((uid) => {
    const p = room.players[uid];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.penVoteChoice = uid;
    const votes = counts[uid] || 0;
    const mine = myVote === uid ? " ✓" : "";
    btn.innerHTML = `${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}${mine}` +
      ` <span class="hint small">(${votes}/${needed})</span>`;
    btn.addEventListener("click", async () => {
      await votePenHolder(state.code, state.room, state.uid, uid);
      // Só refresca se a votação AINDA estiver aberta. Reabrir sem verificar
      // ressuscitava-a: entre o clique e o fim do await, o voto podia já ter
      // decidido a caneta e o ecrã já ter fechado — e voltava a aparecer por
      // cima de um quadro que já estava a funcionar, sem nada que o fechasse.
      if (!hangmanEls.penVoteOverlay.classList.contains("hidden")) hangmanOpenPenVote();
    });
    hangmanEls.penVoteList.appendChild(btn);
  });
  hangmanEls.penVoteOverlay.classList.remove("hidden");
}

function hangmanClosePenVote() {
  hangmanEls.penVoteOverlay.classList.add("hidden");
}

// --- Definições do jogo ---

function hangmanOpenSettings() {
  const room = state.room;
  if (!room?.hangman) return;
  const modo = room.hangman.mode || DEFAULT_BOARD_MODE;
  const spec = BOARD_SETTINGS_SPEC[modo] || [];
  hangmanEls.settingsList.innerHTML = "";
  if (spec.length === 0) {
    hangmanEls.settingsList.innerHTML = '<p class="hint small">Este modo não tem nada para definir.</p>';
  }
  spec.forEach((def) => {
    const atual = boardSetting(room, modo, def.key);
    const bloco = document.createElement("div");
    const label = document.createElement("span");
    label.className = "hangman-setting-label";
    label.textContent = def.label;
    bloco.appendChild(label);
    const linha = document.createElement("div");
    linha.className = "hangman-setting-options";
    def.options.forEach((op) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.setting = def.key;
      btn.dataset.settingValue = String(op.value);
      btn.textContent = op.label;
      btn.setAttribute("aria-pressed", String(op.value === atual));
      btn.addEventListener("click", async () => {
        await setBoardSetting(state.code, state.room, state.uid, def.key, op.value);
        // Só refresca se ainda estiver aberto — mesma razão da votação da
        // caneta: entre o clique e o fim do await o ecrã pode já ter fechado.
        if (!hangmanEls.settingsOverlay.classList.contains("hidden")) hangmanOpenSettings();
      });
      linha.appendChild(btn);
    });
    bloco.appendChild(linha);
    hangmanEls.settingsList.appendChild(bloco);
  });
  hangmanEls.settingsOverlay.classList.remove("hidden");
}

function hangmanCloseSettings() {
  hangmanEls.settingsOverlay.classList.add("hidden");
}

// --- Folha pessoal de quem adivinha ---
//
// Quem está a adivinhar quer testar palavras e riscar letras já usadas sem
// estragar o quadro de todos. Isto é uma segunda tela POR CIMA da partilhada,
// que nunca toca na rede: os traços ficam neste browser e mais ninguém os vê.
// Por baixo, o quadro de quem tem a caneta continua a chegar em tempo real —
// as duas camadas não se misturam porque são mesmo duas telas.

const personal = {
  on: false,
  strokes: [],
  current: null,
  drawing: false,
  color: HANGMAN_COLORS[1],
  width: HANGMAN_WIDTHS[1],
  erasing: false,
};

function personalSyncSize() {
  const c = hangmanEls.personalCanvas;
  const rect = c.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  personal.dpr = dpr;
  personal.rectW = rect.width;
  personal.rectH = rect.height;
  return true;
}

function personalRedraw() {
  if (!personalSyncSize()) return;
  const ctx = hangmanEls.personalCanvas.getContext("2d");
  const { dpr, rectW, rectH } = personal;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rectW, rectH);
  const todos = personal.current ? [...personal.strokes, personal.current] : personal.strokes;
  todos.forEach((t) => {
    if (t.points.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = t.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = t.color;
    ctx.lineWidth = t.erase ? t.width * 3.5 : t.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(t.points[0].x * rectW, t.points[0].y * rectH);
    for (let i = 1; i < t.points.length; i += 1) {
      ctx.lineTo(t.points[i].x * rectW, t.points[i].y * rectH);
    }
    ctx.stroke();
    ctx.restore();
  });
}

function personalPointFrom(e) {
  const rect = hangmanEls.personalCanvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  };
}

hangmanEls.personalCanvas.addEventListener("pointerdown", (e) => {
  if (!personal.on) return;
  e.preventDefault();
  hangmanEls.personalCanvas.setPointerCapture(e.pointerId);
  personal.drawing = true;
  personal.current = {
    color: personal.color, width: personal.width, erase: personal.erasing,
    points: [personalPointFrom(e)],
  };
  personalRedraw();
});
hangmanEls.personalCanvas.addEventListener("pointermove", (e) => {
  if (!personal.drawing || !personal.current) return;
  const p = personalPointFrom(e);
  const ultimo = personal.current.points[personal.current.points.length - 1];
  if (Math.hypot(p.x - ultimo.x, p.y - ultimo.y) < HANGMAN_DOODLE_MIN_DIST) return;
  personal.current.points.push(p);
  personalRedraw();
});
function personalEnd() {
  if (!personal.drawing) return;
  personal.drawing = false;
  if (personal.current && personal.current.points.length > 1) personal.strokes.push(personal.current);
  personal.current = null;
  personalRedraw();
}
hangmanEls.personalCanvas.addEventListener("pointerup", personalEnd);
hangmanEls.personalCanvas.addEventListener("pointercancel", personalEnd);
hangmanEls.personalCanvas.addEventListener("pointerleave", personalEnd);

function personalSetOn(on) {
  personal.on = !!on;
  hangmanEls.personalToggle.checked = personal.on;
  hangmanEls.personalCanvas.classList.toggle("hangman-personal-active", personal.on);
  // A moldura tracejada é o que impede a confusão: sem ela é fácil julgar-se
  // que se está a escrever no quadro de todos.
  hangmanEls.canvasWrap.dataset.personal = personal.on ? "1" : "0";
  personalRedraw();
}

function personalBuildTools() {
  hangmanEls.personalColors.innerHTML = "";
  HANGMAN_COLORS.forEach((cor) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-color";
    btn.dataset.personalColor = cor;
    btn.style.background = cor;
    btn.setAttribute("aria-label", `Cor do rascunho ${cor}`);
    btn.addEventListener("click", () => {
      personal.color = cor;
      personal.erasing = false;
      // Escolher uma cor no rascunho liga-o: é o que se estava a tentar fazer.
      personalSetOn(true);
      personalRefreshTools();
    });
    hangmanEls.personalColors.appendChild(btn);
  });
  personalRefreshTools();
}

function personalRefreshTools() {
  hangmanEls.personalColors.querySelectorAll("[data-personal-color]").forEach((b) => {
    b.setAttribute("aria-pressed", String(!personal.erasing && b.dataset.personalColor === personal.color));
  });
  hangmanEls.personalEraser.setAttribute("aria-pressed", String(personal.erasing));
}

hangmanEls.personalToggle.addEventListener("change", (e) => personalSetOn(e.target.checked));
hangmanEls.personalEraser.addEventListener("click", () => {
  personal.erasing = !personal.erasing;
  if (personal.erasing) personalSetOn(true);
  personalRefreshTools();
});
hangmanEls.personalClear.addEventListener("click", () => {
  personal.strokes = [];
  personal.current = null;
  personalRedraw();
});
personalBuildTools();

window.addEventListener("resize", () => {
  if (screens["hangman"]?.classList.contains("active")) personalRedraw();
});

// Exposto para os testes poderem verificar que ISTO não vai para a rede.
window.__hangmanPersonal = personal;

// Guarda a forma da palavra a que o rascunho pertence.
let personalLastMask = null;

// --- A sala a narrar-se ---
//
// O modo guiado existe para quem joga com outras pessoas online SEM canal de
// voz. Aí a app tem de dizer o que está a acontecer, porque não há mais
// ninguém a dizê-lo. No modo mínimo cala-se: pressupõe-se que há um Discord
// ao lado e que quem lá está já explica melhor do que isto.
//
// Regra que não se quebra: NUNCA diz a palavra escondida, nem sequer as
// letras já reveladas em conjunto. Diz o que aconteceu, não a resposta.
const narrado = {
  mask: undefined,
  leaderId: undefined,
  turnUid: undefined,
  wrongCount: 0,
  solved: false,
};

function narrarQuadro(room, souLider) {
  const h = room.hangman;
  if (!h || h.mode !== "forca") return;
  const nome = (uid) => room.players?.[uid]?.name || "alguém";

  // Palavra nova: diz-se o TAMANHO, que é informação pública (está no ecrã
  // em espaços), nunca as letras.
  if (h.mask !== narrado.mask) {
    const antes = narrado.mask;
    narrado.mask = h.mask;
    if (h.mask && !antes) {
      const letras = [...h.mask].filter((c) => /[\p{L}\p{N}_]/u.test(c)).length;
      const palavras = h.mask.trim().split(/\s+/).length;
      const pista = h.hint ? ` A pista é: ${h.hint}.` : "";
      narrar(`Palavra nova, com ${letras} letras${palavras > 1 ? ` em ${palavras} palavras` : ""}.${pista}`);
    }
  }

  if (h.leaderId !== narrado.leaderId) {
    narrado.leaderId = h.leaderId;
    if (h.leaderId) {
      narrar(souLider ? "Ficaste com a caneta. Escreve a palavra." : `${nome(h.leaderId)} ficou com a caneta.`);
    }
  }

  // Letras erradas: diz-se qual saiu e de quem foi. É o que numa mesa se
  // ouviria sem esforço nenhum.
  const erradas = wrongLetters(room);
  if (erradas.length > narrado.wrongCount) {
    const nova = erradas[erradas.length - 1];
    narrar(`${nome(nova.uid)} disse ${nova.letter}. Não está na palavra.`);
  }
  narrado.wrongCount = erradas.length;

  if (h.solved && !narrado.solved) {
    narrar("Acertaram a palavra!");
  }
  narrado.solved = !!h.solved;

  // De quem é a vez: só quando muda, e só se for por turnos — no modo
  // "qualquer um arrisca" não há vez nenhuma para anunciar.
  if (!freeGuessing(room) && h.mask && !h.solved) {
    const daVez = currentGuesser(room);
    if (daVez !== narrado.turnUid) {
      narrado.turnUid = daVez;
      if (daVez === state.uid) narrar("É a tua vez de arriscar uma letra.");
      else if (daVez) narrar(`É a vez de ${nome(daVez)}.`);
    }
  }
}

// Ao sair do quadro esquece o que já narrou, senão ao voltar ficava calado
// sobre coisas que a pessoa não chegou a ouvir.
function esquecerNarracao() {
  narrado.mask = undefined;
  narrado.leaderId = undefined;
  narrado.turnUid = undefined;
  narrado.wrongCount = 0;
  narrado.solved = false;
}

// --- Solo ou equipas ---

function hangmanOpenTeams() {
  const room = state.room;
  if (!room?.hangman) return;
  // O ecrã das equipas redesenha-se a cada mexida dos outros (é assim que se
  // vê alguém entrar numa equipa). Isso apagava o que se estivesse a escrever
  // no nome da equipa: bastava outra pessoa entrar noutra caixa para o texto
  // meio escrito desaparecer. Guarda-se o que está a ser escrito e o sítio do
  // cursor, e repõe-se no fim.
  const focado = document.activeElement;
  const aEscrever = focado?.dataset?.teamNameInput
    ? { id: focado.dataset.teamNameInput, valor: focado.value, inicio: focado.selectionStart, fim: focado.selectionEnd }
    : null;
  const manda = canSetBoardMode(room, state.uid);
  const emEquipas = teamsOn(room);
  const trancado = teamsLocked(room);

  hangmanEls.playToggle.innerHTML = "";
  [["solo", "🙋 Cada um por si"], ["equipas", "👥 Equipas"]].forEach(([valor, texto]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.playMode = valor;
    btn.textContent = texto;
    btn.setAttribute("aria-pressed", String((room.hangman.play || "solo") === valor));
    btn.disabled = !manda || trancado;
    btn.addEventListener("click", async () => {
      await setPlayMode(state.code, state.room, state.uid, valor);
      if (!hangmanEls.teamsOverlay.classList.contains("hidden")) hangmanOpenTeams();
    });
    hangmanEls.playToggle.appendChild(btn);
  });

  hangmanEls.teamCountRow.classList.toggle("hidden", !emEquipas);
  hangmanEls.teamCountBtns.innerHTML = "";
  const equipas = teamList(room);
  for (let n = 2; n <= MAX_TEAMS; n += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.teamCount = String(n);
    btn.textContent = String(n);
    btn.setAttribute("aria-pressed", String(equipas.length === n));
    btn.disabled = !manda || trancado;
    btn.addEventListener("click", async () => {
      await setTeamCount(state.code, state.room, state.uid, n);
      if (!hangmanEls.teamsOverlay.classList.contains("hidden")) hangmanOpenTeams();
    });
    hangmanEls.teamCountBtns.appendChild(btn);
  }

  hangmanEls.teamBoxes.innerHTML = "";
  if (emEquipas) {
    const minha = teamOfPlayer(room, state.uid);
    equipas.forEach((eq) => {
      const caixa = document.createElement("div");
      caixa.className = "hangman-team-box";
      caixa.dataset.teamBox = eq.id;
      caixa.dataset.mine = eq.id === minha ? "1" : "0";
      caixa.style.borderColor = eq.color;

      // Quem está DENTRO da equipa pode mudar-lhe o nome; de fora, só se lê.
      if (eq.id === minha && !trancado) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "hangman-team-name-input";
        input.maxLength = 24;
        input.value = eq.name;
        input.dataset.teamNameInput = eq.id;
        input.setAttribute("aria-label", `Nome da ${eq.name}`);
        const guardar = () => {
          if (input.value.trim() && input.value.trim() !== eq.name) {
            renameTeam(state.code, state.room, state.uid, eq.id, input.value);
          }
        };
        input.addEventListener("change", guardar);
        input.addEventListener("blur", guardar);
        caixa.appendChild(input);
      } else {
        const nome = document.createElement("span");
        nome.className = "hangman-team-name";
        nome.style.color = eq.color;
        nome.textContent = eq.name;
        caixa.appendChild(nome);
      }

      const membros = document.createElement("div");
      membros.className = "hangman-team-members";
      if (eq.members.length === 0) {
        const vazio = document.createElement("span");
        vazio.className = "hangman-team-empty";
        vazio.textContent = "ainda ninguém";
        membros.appendChild(vazio);
      }
      eq.members.forEach((uid) => {
        const linha = document.createElement("span");
        linha.dataset.teamMember = uid;
        linha.textContent = room.players[uid]?.name || "?";
        membros.appendChild(linha);
      });
      caixa.appendChild(membros);

      if (eq.score > 0) {
        const pontos = document.createElement("span");
        pontos.className = "hangman-team-score";
        pontos.textContent = `${eq.score} letra${eq.score === 1 ? "" : "s"}`;
        caixa.appendChild(pontos);
      }

      const entrar = document.createElement("button");
      entrar.type = "button";
      entrar.className = "ghost hangman-team-join";
      entrar.dataset.joinTeam = eq.id;
      entrar.textContent = eq.id === minha ? "Sair" : "Entrar";
      entrar.disabled = trancado;
      entrar.addEventListener("click", async () => {
        await joinTeam(state.code, state.room, state.uid, eq.id === minha ? null : eq.id);
        if (!hangmanEls.teamsOverlay.classList.contains("hidden")) hangmanOpenTeams();
      });
      caixa.appendChild(entrar);
      hangmanEls.teamBoxes.appendChild(caixa);
    });
  }

  hangmanEls.teamsHint.textContent = trancado
    ? "O jogo já começou — as equipas ficam como estão até à próxima palavra."
    : (emEquipas
      ? "Entra numa equipa. Podem trocar à vontade até a palavra ser definida."
      : "Cada um joga por si.");
  if (aEscrever) {
    const campo = hangmanEls.teamBoxes.querySelector(`[data-team-name-input="${aEscrever.id}"]`);
    if (campo) {
      campo.value = aEscrever.valor;
      campo.focus();
      try {
        campo.setSelectionRange(aEscrever.inicio, aEscrever.fim);
      } catch {
        // Alguns browsers recusam mexer no cursor logo a seguir ao focus;
        // o texto é o que importa, o cursor no fim não estraga nada.
      }
    }
  }

  hangmanEls.teamsOverlay.classList.remove("hidden");
}

function hangmanCloseTeams() {
  hangmanEls.teamsOverlay.classList.add("hidden");
}

hangmanEls.teamsBtn.addEventListener("click", hangmanOpenTeams);
hangmanEls.teamsBtnViewer.addEventListener("click", hangmanOpenTeams);
hangmanEls.teamsCloseBtn.addEventListener("click", hangmanCloseTeams);

hangmanEls.settingsBtn.addEventListener("click", hangmanOpenSettings);
hangmanEls.settingsBtnViewer.addEventListener("click", hangmanOpenSettings);
hangmanEls.settingsCloseBtn.addEventListener("click", hangmanCloseSettings);

hangmanEls.modeBtn.addEventListener("click", hangmanOpenModePicker);
hangmanEls.modeBtnViewer.addEventListener("click", hangmanOpenModePicker);
hangmanEls.modeCancelBtn.addEventListener("click", hangmanCloseModePicker);
hangmanEls.penVoteCancelBtn.addEventListener("click", hangmanClosePenVote);
hangmanEls.backToFreeBtn.addEventListener("click", () => setBoardMode(state.code, state.room, state.uid, "livre"));

// Pedir a palavra: quem não tem a caneta levanta o braço para falar com o
// grupo. É um botão de alternar — quem já falou baixa o braço.
// A PALAVRA VIVE SÓ AQUI, no browser de quem tem a caneta. Para a sala vai
// apenas a sua forma (ver maskWord em room.js): sem servidor, tudo o que
// fosse guardado na sala era legível por qualquer jogador que abrisse as
// ferramentas do browser, e o jogo acabava antes de começar.
let hangmanSecretWord = "";

// A palavra tem de sobreviver a um F5 de quem tem a caneta. Não sobrevivia: era
// só uma variável em memória, e recarregar a página deixava o jogo PENDURADO —
// a forma da palavra continuava na sala, mas o único browser capaz de julgar as
// tentativas já não sabia a resposta. Quem arriscava ficava eternamente em "a
// tua letra está a ser verificada...", sem nada no ecrã a dizer porquê.
//
// Guardada no browser de quem a escreveu, e só lá: continua a nunca entrar na
// base de dados, que é o ponto todo (ver maskWord em room.js).
const SECRET_WORD_KEY = "euSei_hangmanSecret";

function saveSecretWord(code, word) {
  try {
    localStorage.setItem(SECRET_WORD_KEY, JSON.stringify({ code, word }));
  } catch {
    // Armazenamento bloqueado: o jogo funciona na mesma, só não aguenta um F5.
  }
}

function clearSecretWord() {
  try {
    localStorage.removeItem(SECRET_WORD_KEY);
  } catch { /* ver saveSecretWord */ }
}

// Só devolve a palavra se ela ainda corresponder à forma que está na sala:
// uma palavra de uma partida anterior daria respostas erradas com toda a
// confiança, que é pior do que não dar nenhuma.
function recoverSecretWord(code, mask) {
  try {
    const guardado = JSON.parse(localStorage.getItem(SECRET_WORD_KEY) || "null");
    if (!guardado || guardado.code !== code || !guardado.word) return "";
    if (maskWord(guardado.word) !== maskWord(mask)) return "";
    // E as letras já reveladas têm de bater certo com ela.
    const bate = [...mask].every((ch, i) => ch === "_" || ch === guardado.word[i]);
    return bate ? guardado.word : "";
  } catch {
    return "";
  }
}

hangmanEls.wordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const word = hangmanEls.wordInput.value.trim();
  if (!word) return;
  const maskAtual = state.room?.hangman?.mask || "";
  // Reescrever a MESMA palavra depois de a perder retoma o jogo onde estava,
  // em vez de recomeçar: as letras já reveladas e os erros já contados não
  // podem desaparecer só porque quem arbitra recarregou a página.
  const retoma = !!maskAtual
    && maskWord(word) === maskWord(maskAtual)
    && [...maskAtual].every((ch, i) => ch === "_" || ch === word[i]);
  hangmanSecretWord = word;
  saveSecretWord(state.code, word);
  const pista = hangmanEls.hintInput.value.trim();
  hangmanEls.wordInput.value = "";
  hangmanEls.hintInput.value = "";
  if (retoma) {
    hangmanEls.status.textContent = "Palavra recuperada — o jogo continua de onde estava.";
    renderHangman(state.room);
    return;
  }
  await setHangmanPuzzle(state.code, state.room, state.uid, maskWord(word), pista);
});

hangmanEls.revealBtn.addEventListener("click", async () => {
  const letra = hangmanEls.letterInput.value.trim();
  hangmanEls.letterInput.value = "";
  const mask = state.room?.hangman?.mask;
  if (!mask) return;
  // Sem letra escrita, "Acertaram" revela a palavra toda: é o fim de jogo
  // normal quando o grupo diz a palavra de uma vez.
  const nova = letra ? revealLetter(hangmanSecretWord, mask, letra) : hangmanSecretWord;
  await updateHangmanMask(state.code, state.room, state.uid, nova);
});

hangmanEls.missBtn.addEventListener("click", () => addHangmanMiss(state.code, state.room, state.uid));
hangmanEls.newWordBtn.addEventListener("click", () => {
  hangmanSecretWord = "";
  clearSecretWord();
  clearHangmanPuzzle(state.code, state.room, state.uid);
});

// Desenha os espaços por preencher. Cada letra é uma caixa com risco por
// baixo; brancos e hífens ficam à vista, porque é isso que diz se são duas
// palavras ou uma palavra composta. Para quem tem a caneta, cada espaço por
// preencher é CLICÁVEL: ouve a letra por voz e escreve-a ali, sem ter de a
// ir escrever noutro sítio do ecrã.
function renderHangmanSlots(mask, interactive) {
  hangmanEls.slots.innerHTML = "";
  [...String(mask || "")].forEach((ch, i) => {
    const el = document.createElement("span");
    if (ch === " ") {
      el.className = "hangman-slot hangman-slot-space";
      el.innerHTML = "&nbsp;";
    } else if (ch === "_") {
      el.className = "hangman-slot";
      el.innerHTML = "&nbsp;";
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      el.className = "hangman-slot hangman-slot-filled";
      el.textContent = ch;
    } else {
      el.className = "hangman-slot hangman-slot-punct";
      el.textContent = ch;
    }
    if (interactive && ch === "_") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hangman-slot-btn";
      btn.dataset.slotIndex = String(i);
      btn.setAttribute("aria-label", `Escrever a letra da posição ${i + 1}`);
      btn.appendChild(el);
      btn.addEventListener("click", () => hangmanFillSlot(i));
      hangmanEls.slots.appendChild(btn);
    } else {
      hangmanEls.slots.appendChild(el);
    }
  });
}

// Clicar num espaço: quem tem a caneta escreve a letra que ouviu. Revela
// todas as posições dessa letra, como qualquer forca de papel.
async function hangmanFillSlot(index) {
  const mask = state.room?.hangman?.mask;
  if (!mask || !hangmanSecretWord) return;
  const certa = hangmanSecretWord[index];
  if (!certa) return;
  const escrita = window.prompt(`Que letra vai na posição ${index + 1}?`);
  if (!escrita) return;
  if (escrita.trim().toLocaleLowerCase("pt") !== certa.toLocaleLowerCase("pt")) {
    hangmanEls.status.textContent = `Nesse espaço não vai "${escrita.trim()}".`;
    return;
  }
  await updateHangmanMask(state.code, state.room, state.uid, revealLetter(hangmanSecretWord, mask, certa));
}

// As letras erradas, cada uma na cor de quem a disse — é para isso que serve
// a cor escolhida no início do modo.
function renderWrongLetters(room) {
  const erradas = wrongLetters(room);
  hangmanEls.wrongStrip.classList.toggle("hidden", erradas.length === 0);
  hangmanEls.wrongLetters.innerHTML = "";
  erradas.forEach(({ letter, uid }) => {
    const el = document.createElement("span");
    el.className = "hangman-wrong-letter";
    el.style.color = playerColor(room, uid);
    el.title = room.players?.[uid]?.name || "";
    el.textContent = letter.toLocaleUpperCase("pt");
    hangmanEls.wrongLetters.appendChild(el);
  });
}

// --- Escolher a cor ---

function hangmanRenderColorPicker(room) {
  const minha = room.hangman?.colors?.[state.uid] || null;
  const ocupadas = takenHangmanColors(room, state.uid);
  hangmanEls.colorChoices.innerHTML = "";
  HANGMAN_PLAYER_COLORS.forEach((cor) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hangman-color-choice";
    btn.dataset.colorChoice = cor;
    btn.style.background = cor;
    btn.disabled = ocupadas.includes(cor);
    btn.setAttribute("aria-label", `Cor ${cor}`);
    btn.setAttribute("aria-pressed", String(minha === cor));
    btn.addEventListener("click", () => pickHangmanColor(state.code, state.room, state.uid, cor));
    hangmanEls.colorChoices.appendChild(btn);
  });
  const semCor = connectedPlayerIds(room).filter((uid) => !room.hangman?.colors?.[uid]);
  hangmanEls.colorWaiting.textContent = minha
    ? (semCor.length ? `À espera de ${semCor.map((u) => room.players[u]?.name).filter(Boolean).join(", ")}...` : "")
    : "";
}

// --- Tentativas de letra ---

hangmanEls.guessForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const letra = hangmanEls.guessInput.value.trim();
  hangmanEls.guessInput.value = "";
  if (!letra) return;
  if (letterAlreadyTried(state.room, letra)) {
    hangmanEls.status.textContent = `A letra "${letra}" já foi tentada.`;
    return;
  }
  await submitLetterGuess(state.code, state.room, state.uid, letra);
});

hangmanEls.passTurnBtn.addEventListener("click", () => passGuessTurn(state.code, state.room, state.uid));

// Quem tem a caneta é quem julga: é o único browser que conhece a palavra.
// Uma tentativa de cada vez, e com trinco, senão dois desenhos de ecrã
// seguidos julgavam a mesma letra duas vezes e contavam dois erros.
let hangmanJudging = false;
async function hangmanJudgePendingGuesses(room) {
  if (hangmanJudging || !hangmanSecretWord) return;
  // Filtra as entradas vazias: uma tentativa já resolvida pode ficar como
  // null em vez de desaparecer, e ler ".letter" de null rebentava o cliente
  // de quem tem a caneta — logo o único que consegue julgar seja o que for.
  const pendentes = Object.entries(room.hangman?.guesses || {}).filter(([, g]) => g && g.letter);
  if (pendentes.length === 0) return;
  hangmanJudging = true;
  try {
    const [guesserUid, info] = pendentes[0];
    await resolveGuess(state.code, room, state.uid, guesserUid, info.letter, hangmanSecretWord);
  } finally {
    hangmanJudging = false;
  }
}

hangmanEls.handBtn.addEventListener("click", () => {
  const raised = !!state.room?.hangman?.hands?.[state.uid];
  if (raised) lowerHand(state.code, state.uid);
  else raiseHand(state.code, state.uid);
});

function renderHangman(room) {
  const hangman = room.hangman;
  if (!hangman) return;
  const mode = BOARD_MODES[hangman.mode] ? hangman.mode : DEFAULT_BOARD_MODE;
  const amLeader = hangman.leaderId === state.uid;
  const leaderName = room.players?.[hangman.leaderId]?.name || null;
  const host = isHost(room);


  // As duas versões do esboço. Quem tem a caneta vê a moldura forte e as
  // opções todas; quem não tem vê a moldura cinzenta e só a barra do modo.
  hangmanEls.screen.classList.toggle("hangman-role-drawer", amLeader);
  hangmanEls.screen.classList.toggle("hangman-role-viewer", !amLeader);
  hangmanEls.penZone.classList.toggle("hidden", !amLeader);
  hangmanEls.modeTitle.textContent = `Quadro — ${BOARD_MODES[mode].label}`;
  hangmanEls.modeHint.textContent = BOARD_MODES[mode].hint;

  // No modo Forca ninguém tem a caneta até a sala votar. Enquanto isso, o
  // quadro pergunta de quem é a vez em vez de ficar mudo.
  // O modo é escolha de quem tem a caneta (ou do anfitrião, para destravar):
  // a quem não manda no quadro, o botão não aparece, em vez de aparecer e não
  // fazer nada ao ser carregado.
  const mandaNoQuadro = canSetBoardMode(room, state.uid);
  const semCaneta = !hangman.leaderId || !room.players?.[hangman.leaderId]?.connected;
  // A escolha da cor vem PRIMEIRO. As duas votações ao mesmo tempo davam dois
  // ecrãs sobrepostos, e o de baixo ficava inalcançável.
  const aVotarCaneta = mode === "forca" && semCaneta && !!hangman.colors?.[state.uid];

  if (aVotarCaneta) {
    hangmanEls.status.textContent = "Votem em quem fica com a caneta.";
  } else if (amLeader) {
    hangmanEls.status.textContent = mode === "forca"
      ? "Tens a caneta — desenha a forca e os espaços da palavra. Os outros pedem a palavra para arriscar."
      : "Tens a caneta — escreve ou desenha. Quando quiseres, passa a caneta a outra pessoa.";
  } else {
    hangmanEls.status.textContent = `${leaderName || "Ninguém"} tem a caneta. ` +
      (mode === "forca" ? "Pede a palavra para arriscar uma letra." : "Combinem as regras em voz alta.");
  }

  hangmanEls.doodleCanvas.classList.toggle("hangman-doodle-canvas-active", amLeader);

  // A folha pessoal é de quem NÃO tem a caneta: quem desenha já escreve no
  // quadro de todos e não precisa de um rascunho por cima do próprio traço.
  hangmanEls.personalTools.classList.toggle("hidden", amLeader);
  hangmanEls.personalCanvas.classList.toggle("hidden", amLeader);
  if (amLeader && personal.on) personalSetOn(false);
  // Uma palavra nova limpa o rascunho: os riscos da palavra anterior só
  // atrapalhariam a seguinte.
  if (hangman.mask !== personalLastMask) {
    personalLastMask = hangman.mask || null;
    if (personal.strokes.length > 0) {
      personal.strokes = [];
      personal.current = null;
    }
  }
  personalRedraw();
  hangmanEls.clearBtn.classList.toggle("hidden", !amLeader);
  hangmanEls.undoBtn.classList.toggle("hidden", !amLeader);
  // O anfitrião também pode passar a caneta: se quem estava a escrever sair
  // ou se distrair, mais ninguém conseguiria destravar o quadro.
  hangmanEls.passPenBtn.classList.toggle("hidden", !amLeader && !host);
  hangmanEls.continueBtn.classList.toggle("hidden", !host);
  // O botão do modo aparece nas duas zonas, mas nunca nas duas ao mesmo
  // tempo: quem desenha tem-no em cima (zona 2), quem vê tem-no em baixo
  // (zona a), que é onde o esboço os põe.
  hangmanEls.modeBtn.classList.toggle("hidden", !(mandaNoQuadro && amLeader));
  hangmanEls.modeBtnViewer.classList.toggle("hidden", !(mandaNoQuadro && !amLeader));
  const temDefinicoes = (BOARD_SETTINGS_SPEC[mode] || []).length > 0;
  hangmanEls.settingsBtn.classList.toggle("hidden", !(mandaNoQuadro && amLeader && temDefinicoes));
  hangmanEls.settingsBtnViewer.classList.toggle("hidden", !(mandaNoQuadro && !amLeader && temDefinicoes));
  if (!hangmanEls.settingsOverlay.classList.contains("hidden") && !temDefinicoes) hangmanCloseSettings();
  // O botão das equipas é de TODOS: quem manda escolhe solo/equipas e quantas,
  // mas quem entra numa equipa é cada jogador. Um botão só para o anfitrião
  // obrigava-o a arrumar os outros à mão.
  hangmanEls.teamsBtn.classList.toggle("hidden", !amLeader);
  hangmanEls.teamsBtnViewer.classList.toggle("hidden", amLeader);
  // Enquanto o ecrã das equipas estiver aberto, acompanha o que os outros
  // fazem: entrar numa equipa tem de aparecer aos outros sem fechar e abrir.
  if (!hangmanEls.teamsOverlay.classList.contains("hidden")) hangmanOpenTeams();
  // Pedir a palavra é de quem NÃO tem a caneta — quem desenha já a tem.
  hangmanEls.handBtn.classList.toggle("hidden", amLeader || mode !== "forca");
  const raised = !!hangman.hands?.[state.uid];
  hangmanEls.handBtn.textContent = raised ? "✋ Baixar o braço" : "✋ Pedir a palavra";
  hangmanEls.handBtn.setAttribute("aria-pressed", String(raised));

  // --- Modo Forca: a palavra e os espaços ---
  const naForca = mode === "forca";
  const mask = hangman.mask || "";
  // Se a palavra se perdeu (um F5 de quem tem a caneta), tenta recuperá-la do
  // browser antes de qualquer outra coisa — senão o resto do ecrã desenha-se
  // com o jogo já morto sem ninguém saber.
  if (naForca && amLeader && mask && !hangmanSecretWord) {
    hangmanSecretWord = recoverSecretWord(state.code, mask);
  }
  const perdiAPalavra = naForca && amLeader && !!mask && !hangmanSecretWord;
  const temPalavra = naForca && !!mask;
  hangmanEls.wordZone.classList.toggle("hidden", !temPalavra);
  // Sem a palavra não se pode arbitrar: mostra-se a caixa de escrever outra vez
  // em vez das ferramentas de arbitrar, que não fariam nada.
  hangmanEls.wordForm.classList.toggle("hidden", !(naForca && amLeader && (!mask || perdiAPalavra)));
  hangmanEls.wordTools.classList.toggle("hidden", !(naForca && amLeader && !!mask && !perdiAPalavra));
  hangmanEls.wordInput.placeholder = perdiAPalavra
    ? "Escreve outra vez a palavra para continuares a arbitrar"
    : "Palavra a adivinhar (só tu a vês)";

  // Cor de cada um: pede-se ao entrar no modo, e só depois de todos terem
  // escolhido é que as letras erradas dizem alguma coisa.
  const jaTenhoCor = !!hangman.colors?.[state.uid];
  const precisaDeCor = naForca && !jaTenhoCor;
  hangmanEls.colorOverlay.classList.toggle("hidden", !precisaDeCor);
  if (naForca) hangmanRenderColorPicker(room);
  // Uma escolha obrigatória fecha os ecrãs opcionais. Sem isto, quem tivesse
  // as equipas ou as definições abertas ficava com a escolha de cor por
  // baixo — visível mas impossível de carregar.
  if (precisaDeCor) {
    hangmanCloseTeams();
    hangmanCloseSettings();
    hangmanCloseModePicker();
  }

  hangmanEls.slotsStrip.classList.toggle("hidden", !temPalavra);
  hangmanEls.slotsStrip.classList.toggle("hangman-slots-interactive", temPalavra && amLeader);
  renderWrongLetters(naForca ? room : { hangman: {} });

  // Em equipas mostram-se as EQUIPAS com o que já acertaram; a jogar cada um
  // por si mostram-se as pessoas, cada uma na sua cor. Mostrar as duas coisas
  // ao mesmo tempo enchia a faixa e não dizia mais nada.
  const daVez = naForca ? currentGuesser(room) : null;
  if (naForca) {
    hangmanEls.players.innerHTML = "";
    if (teamsOn(room)) {
      hangmanEls.players.className = "hangman-players hangman-teams-strip";
      teamList(room).forEach((eq) => {
        const tag = document.createElement("span");
        tag.className = "hangman-team-tag";
        tag.style.color = eq.color;
        tag.dataset.teamTag = eq.id;
        const daVezAqui = eq.members.includes(daVez) ? " ←" : "";
        tag.textContent = `${eq.name}: ${eq.score}${daVezAqui}`;
        hangmanEls.players.appendChild(tag);
      });
    } else {
      hangmanEls.players.className = "hangman-players";
      connectedPlayerIds(room).forEach((uid) => {
        const tag = document.createElement("span");
        tag.className = "hangman-player-tag";
        tag.style.color = playerColor(room, uid);
        tag.dataset.turn = uid === daVez ? "1" : "0";
        tag.dataset.playerTag = uid;
        tag.textContent = (room.players[uid]?.name || "?") + (uid === hangman.leaderId ? " 🖊️" : "");
        hangmanEls.players.appendChild(tag);
      });
    }
  }

  // As duas vias de arriscar, como pedido: quem tem a caneta escreve a letra
  // que ouviu por voz (clicando num espaço), e quem está na vez arrisca ele
  // próprio pela caixinha. Nenhuma exclui a outra.
  const possoArriscar = naForca && canGuessNow(room, state.uid);
  hangmanEls.guessForm.classList.toggle("hidden", !possoArriscar);
  if (naForca && mask && !hangman.solved) {
    const nomeDaVez = room.players?.[daVez]?.name;
    if (freeGuessing(room)) {
      hangmanEls.turnLabel.textContent = amLeader ? "" : "Arrisca quando quiseres.";
    } else {
      hangmanEls.turnLabel.textContent = daVez === state.uid
        ? (hangman.guesses?.[state.uid] ? "A tua letra está a ser verificada..." : "É a tua vez de arriscar.")
        : (nomeDaVez ? `É a vez de ${nomeDaVez}.` : "");
    }
  } else {
    hangmanEls.turnLabel.textContent = "";
  }
  hangmanEls.passTurnBtn.classList.toggle("hidden", !(amLeader && naForca && !!mask));

  // A pista fica na faixa de baixo, fora da folha: à vista de todos sem
  // atrapalhar quem está a desenhar no meio do quadro.
  // A pista pode estar escondida até ao primeiro erro, se assim for definido:
  // dá uma primeira tentativa mais difícil e uma ajuda a quem tropeça.
  const pistaSempre = boardSetting(room, "forca", "showHintAlways") !== 0;
  const podeVerPista = pistaSempre || (hangman.misses || 0) > 0 || amLeader;
  const pista = temPalavra && podeVerPista ? (hangman.hint || "") : "";
  hangmanEls.hintLabel.classList.toggle("hidden", !pista);
  hangmanEls.hintLabel.textContent = pista ? `Pista: ${pista}` : "";

  if (temPalavra) {
    renderHangmanSlots(mask, amLeader);
    const misses = hangman.misses || 0;
    const teto = maxMissesOf(room);
    if (hangman.solved) {
      hangmanEls.missesLabel.textContent = "Acertaram! 🎉";
    } else if (teto > 0) {
      hangmanEls.missesLabel.textContent = `Erros: ${misses}/${teto}${misses >= teto ? " — enforcado!" : ""}`;
    } else {
      // Sem limite: os erros continuam a contar-se, só não acabam o jogo.
      hangmanEls.missesLabel.textContent = `Erros: ${misses}`;
    }
    hangmanEls.missesLabel.dataset.danger = teto > 0 && misses >= teto - 1 && !hangman.solved ? "1" : "0";
  }
  if (perdiAPalavra) {
    hangmanEls.status.textContent =
      "Perdi a palavra ao recarregar a página. Escreve-a outra vez (ou começa outra) para continuar a arbitrar.";
  }
  if (amLeader && mask) {
    // Só quem tem a caneta vê a palavra, e vê-a sempre — depois de a escrever
    // ainda tem de a saber para julgar quem arrisca em voz alta.
    hangmanEls.secretLabel.textContent = hangmanSecretWord ? `Palavra: ${hangmanSecretWord}` : "";
  }

  const fila = handQueue(room).map((uid) => room.players[uid]?.name).filter(Boolean);
  hangmanEls.handQueue.textContent = fila.length
    ? `A pedir a palavra: ${fila.map((n, i) => `${i + 1}. ${n}`).join("  ")}`
    : "";

  // As votações abertas acompanham o estado: se a caneta já foi decidida
  // enquanto o menu estava aberto, a lista mostrada já não quer dizer nada.
  if (aVotarCaneta) {
    // Sem caneta não há quadro: a votação é obrigatória, e por isso não tem
    // "Fechar" — um botão que fechasse e reabrisse à décima de segundo
    // seguinte lia-se como avaria.
    hangmanEls.penVoteCancelBtn.classList.add("hidden");
    hangmanEls.backToFreeBtn.classList.toggle("hidden", !mandaNoQuadro);
    hangmanCloseTeams();
    hangmanCloseSettings();
    hangmanOpenPenVote();
  } else {
    hangmanEls.penVoteCancelBtn.classList.remove("hidden");
    hangmanClosePenVote();
  }
  if (!hangmanEls.modeOverlay.classList.contains("hidden")) {
    if (hangmanModePickerOpenedFor !== null && mode !== hangmanModePickerOpenedFor) {
      hangmanCloseModePicker();
    } else {
      hangmanOpenModePicker();
    }
  }
  if (!amLeader && !host) hangmanClosePenPicker();
  refreshHangmanPenZone(mode);
  hangmanDoodleRedraw();

  narrarQuadro(room, amLeader);

  // Só o anfitrião fecha as votações, como resolve as rondas: dois clientes a
  // aplicarem o mesmo resultado escreveriam duas vezes, e a segunda apagaria
  // os votos já a caminho da votação seguinte.
  //
  // E fica para DEPOIS deste desenho de ecrã, de propósito. Chamado a meio, a
  // escrita disparava um desenho novo lá dentro (que já abria a votação da
  // caneta) e, ao voltar, a segunda metade deste continuava a correr com o
  // retrato ANTIGO da sala e voltava a fechá-la. O ecrã acabava a esconder
  // aquilo que a escrita tinha acabado de tornar necessário.
  if (host) queueMicrotask(() => applyBoardVotes(state.code, state.room));
  // E quem tem a caneta julga as tentativas pendentes, pelo mesmo motivo de
  // ordem: fora do desenho de ecrã, para a escrita não voltar a meio dele.
  if (amLeader && naForca) queueMicrotask(() => hangmanJudgePendingGuesses(state.room));
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
  const points = [...pointsObjectToArray(room?.draw?.doodle?.points), ...drawDoodleState.pending];
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
      btn.innerHTML = avatarImgHtml(p.avatar, "sm", p.name) + escapeHtml(p.name);
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
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p?.avatar, "sm", p?.name)}${name}</span>
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
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
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
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
        <span class="score-round">${detail}</span>
        <span class="score-total">+${battle.roundPoints?.[uid] || 0} pts</span>`;
      battleEls.results.appendChild(row);
    });
    battleEls.continueBtn.classList.toggle("hidden", !isHost(room));
  }
}

// ---------- ESTRADA MALUCA EM EQUIPA ----------
// Este jogo não sincroniza posições como a Fuga/Batalha: cada jogador corre
// na SUA estrada, sem colidir com os outros. O que tem de ser rigorosamente
// igual é a pista — daí a semente partilhada, com a qual cada cliente gera
// localmente a mesma sequência de obstáculos (raceObstacleLane). Assim
// ninguém apanha uma estrada mais fácil, e pela rede só passa uma linha por
// jogador (faixa + tempo aguentado), a cada 250ms, em vez de dezenas de
// carros por segundo.

const raceEls = {
  statusLine: document.getElementById("race-status-line"),
  road: document.getElementById("race-road"),
  standings: document.getElementById("race-standings"),
  results: document.getElementById("race-results"),
  continueBtn: document.getElementById("race-continue-btn"),
};

const raceState = {
  active: false,
  lane: 1,
  elapsedMs: 0,
  crashed: false,
  spawnedCount: 0,
  nextSpawnAtMs: 0,
  obstacles: [],
  obstacleEls: {},
  laneLineEls: [],
  playerEl: null,
  lastFrame: 0,
  lastBroadcastAt: 0,
  keydownHandler: null,
  resizeHandler: null,
  lastFitTop: null,
  lastFitH: null,
  rafId: null,
};

raceEls.continueBtn.addEventListener("click", () => {
  finishRaceRound(state.code, state.room);
});

function raceRoadWidth() {
  return RACE_LANES * (RACE_CAR_W + 24) + 24;
}

function raceLaneCenterX(lane) {
  const laneW = raceRoadWidth() / RACE_LANES;
  return lane * laneW + laneW / 2;
}

function raceHandleKey(e) {
  if (!raceState.active || raceState.crashed) return;
  const left = ["ArrowLeft", "a", "A"].includes(e.key);
  const right = ["ArrowRight", "d", "D"].includes(e.key);
  if (!left && !right) return;
  e.preventDefault();
  if (left && raceState.lane > 0) raceState.lane -= 1;
  else if (right && raceState.lane < RACE_LANES - 1) raceState.lane += 1;
  raceUpdatePlayerX();
}

function raceUpdatePlayerX() {
  if (!raceState.playerEl) return;
  raceState.playerEl.style.left = `${raceLaneCenterX(raceState.lane) - RACE_CAR_W / 2}px`;
}

function raceBuildRoad() {
  raceEls.road.innerHTML = "";
  raceEls.road.style.width = `${raceRoadWidth()}px`;
  raceEls.road.style.height = `${RACE_ROAD_H}px`;
  raceState.laneLineEls = [];
  for (let i = 1; i < RACE_LANES; i++) {
    const line = document.createElement("div");
    line.className = "car-lane-line";
    line.style.left = `${i * (raceRoadWidth() / RACE_LANES)}px`;
    raceEls.road.appendChild(line);
    raceState.laneLineEls.push(line);
  }
  raceState.playerEl = document.createElement("div");
  raceState.playerEl.className = "car-player";
  raceState.playerEl.style.width = `${RACE_CAR_W}px`;
  raceState.playerEl.style.height = `${RACE_CAR_H}px`;
  raceState.playerEl.style.top = `${RACE_PLAYER_Y}px`;
  raceEls.road.appendChild(raceState.playerEl);
  raceUpdatePlayerX();
}

// Encolhe a estrada até o carro do jogador caber no ecrã, com margem para os
// comandos táteis. Chamada ao entrar e sempre que a janela muda de tamanho.
function fitRaceRoad() {
  const wrap = raceEls.road.parentElement;
  if (!wrap) return;
  const top = Math.round(wrap.getBoundingClientRect().top);
  // Recalcula só quando algo acima da estrada mudou de altura (a tira da
  // classificação, por exemplo). renderRace corre várias vezes por segundo e
  // medir/escrever estilos de cada vez custava um reflow por atualização.
  if (top === raceState.lastFitTop && window.innerHeight === raceState.lastFitH) return;
  raceState.lastFitTop = top;
  raceState.lastFitH = window.innerHeight;
  const reserved = 100; // comandos no ecrã + respiro no fundo
  const available = window.innerHeight - top - reserved;
  // A largura disponível vem do PAI: a própria caixa já leva a largura
  // reduzida do cálculo anterior, e medi-la aqui encolhia a estrada um pouco
  // mais a cada redimensionamento, até desaparecer.
  const availableW = wrap.parentElement?.clientWidth || window.innerWidth;
  const scale = Math.max(0.45, Math.min(1, available / RACE_ROAD_H, availableW / raceRoadWidth()));
  raceEls.road.style.transform = `scale(${scale})`;
  wrap.style.height = `${RACE_ROAD_H * scale}px`;
  wrap.style.width = `${raceRoadWidth() * scale}px`;
}

function raceEnter(room) {
  const race = room.race || {};
  raceState.active = true;
  raceState.lane = 1;
  // Quem entrar a meio (recarregou a página, por exemplo) retoma no tempo de
  // corrida já decorrido, para continuar a ver os mesmos carros que os outros.
  raceState.elapsedMs = Math.max(0, serverNow() - (race.startedAt || serverNow()));
  raceState.crashed = !!(race.racers?.[state.uid] && race.racers[state.uid].alive === false);
  raceState.spawnedCount = 0;
  raceState.nextSpawnAtMs = RACE_SPAWN_INTERVAL_START_MS;
  raceState.obstacles = [];
  raceState.obstacleEls = {};
  raceState.lastBroadcastAt = 0;
  raceBuildRoad();
  raceState.lastFitTop = null;
  raceState.lastFitH = null;
  fitRaceRoad();
  raceState.resizeHandler = () => fitRaceRoad();
  window.addEventListener("resize", raceState.resizeHandler);
  raceState.keydownHandler = (e) => raceHandleKey(e);
  document.addEventListener("keydown", raceState.keydownHandler);
  showTouchControls({ axis: "horizontal" });
  raceState.lastFrame = performance.now();
  raceState.rafId = requestAnimationFrame(raceTick);
}

function raceExit() {
  hideTouchControls();
  raceState.active = false;
  if (raceState.rafId) cancelAnimationFrame(raceState.rafId);
  raceState.rafId = null;
  if (raceState.keydownHandler) document.removeEventListener("keydown", raceState.keydownHandler);
  raceState.keydownHandler = null;
  if (raceState.resizeHandler) window.removeEventListener("resize", raceState.resizeHandler);
  raceState.resizeHandler = null;
}

// Sem tons dourados/laranja perto de var(--accent), para o carro do jogador
// nunca se confundir com um obstáculo. A cor sai do índice (e não de
// Math.random) para que todos vejam a mesma estrada até nos detalhes.
const RACE_COLORS = ["#c65d4a", "#5c7e91", "#6c8a4f", "#8a6bb0", "#4a7a8c"];

function raceSpawnObstacle(seed) {
  const index = raceState.spawnedCount++;
  const lane = raceObstacleLane(seed, index);
  raceState.obstacles.push({ id: index, lane, y: -RACE_CAR_H });
  const el = document.createElement("div");
  el.className = "car-obstacle";
  el.style.width = `${RACE_CAR_W}px`;
  el.style.height = `${RACE_CAR_H}px`;
  el.style.background = RACE_COLORS[(index * 3 + lane) % RACE_COLORS.length];
  // O número do carro fica no DOM: é o que permite comparar a estrada de dois
  // jogadores por identidade ("o carro 7 está na mesma faixa nos dois ecrãs")
  // em vez de por posição na lista, que difere quando um cliente vai uns
  // fotogramas à frente do outro.
  el.dataset.index = String(index);
  raceEls.road.appendChild(el);
  raceState.obstacleEls[index] = el;
}

function raceTick(now) {
  if (!raceState.active) return;
  const room = state.room;
  const race = room?.race;
  if (!race || race.resolved) { raceState.rafId = requestAnimationFrame(raceTick); return; }

  const dt = Math.min((now - raceState.lastFrame) / 1000, 0.05);
  raceState.lastFrame = now;
  if (!raceState.crashed) raceState.elapsedMs += dt * 1000;

  const speed = raceSpeedAt(raceState.elapsedMs);

  // Os obstáculos continuam a nascer mesmo depois de bater: quem já bateu
  // fica a ver a estrada correr, e não um ecrã congelado.
  while (raceState.nextSpawnAtMs <= raceState.elapsedMs) {
    raceSpawnObstacle(race.seed || 0);
    raceState.nextSpawnAtMs += raceSpawnIntervalAt(raceState.nextSpawnAtMs);
  }

  let collided = false;
  raceState.obstacles.forEach((o) => {
    o.y += speed * dt;
    const el = raceState.obstacleEls[o.id];
    if (!el) return;
    el.style.left = `${raceLaneCenterX(o.lane) - RACE_CAR_W / 2}px`;
    el.style.top = `${o.y}px`;
    const overlapsY = o.y + RACE_CAR_H > RACE_PLAYER_Y && o.y < RACE_PLAYER_Y + RACE_CAR_H;
    if (overlapsY && o.lane === raceState.lane) collided = true;
  });
  raceState.obstacles = raceState.obstacles.filter((o) => {
    if (o.y > RACE_ROAD_H + RACE_CAR_H) {
      raceState.obstacleEls[o.id]?.remove();
      delete raceState.obstacleEls[o.id];
      return false;
    }
    return true;
  });

  if (collided && !raceState.crashed) {
    raceState.crashed = true;
    raceState.playerEl?.classList.add("car-player-crashed");
    crashRacer(state.code, state.uid, raceState.elapsedMs);
  }

  // Se o servidor já me dá como fora (bati e a escrita chegou, ou reentrei
  // depois de bater), não volto a transmitir — senão um tick atrasado
  // reescrevia um tempo MENOR por cima do tempo com que bati, e a
  // classificação final baixava sozinha.
  if (race.racers?.[state.uid]?.alive === false) raceState.crashed = true;
  if (!raceState.crashed && serverNow() - raceState.lastBroadcastAt > RACE_BROADCAST_MS) {
    raceState.lastBroadcastAt = serverNow();
    updateRacer(state.code, state.uid, raceState.lane, raceState.elapsedMs);
  }

  const laneAnimS = Math.max(0.12, 0.5 * (RACE_BASE_SPEED / speed));
  raceState.laneLineEls.forEach((el) => { el.style.animationDuration = `${laneAnimS}s`; });

  raceState.rafId = requestAnimationFrame(raceTick);
}

// Painel lateral: mostra em tempo real quem ainda está de pé e há quanto
// tempo — é isto que torna a corrida "multijogador" apesar de cada um correr
// na sua estrada.
function raceRenderStandings(room) {
  const race = room.race || {};
  const rows = Object.entries(room.players || {})
    .map(([uid, p]) => {
      const r = race.racers?.[uid] || {};
      const isMe = uid === state.uid;
      const timeMs = isMe ? raceState.elapsedMs : racerTimeMs(r);
      const alive = isMe ? !raceState.crashed : r.alive !== false;
      return { uid, name: p.name, avatar: p.avatar, timeMs, alive, isMe };
    })
    .sort((a, b) => b.timeMs - a.timeMs);
  raceEls.standings.innerHTML = rows
    .map((r, i) => `<div class="race-standing-row${r.isMe ? " race-standing-me" : ""}${r.alive ? "" : " race-standing-out"}">
      <span class="race-standing-place">${i + 1}º</span>
      <span class="score-name">${avatarImgHtml(r.avatar, "sm", r.name)}${escapeHtml(r.name)}</span>
      <span class="race-standing-time">${r.alive ? "" : "💥 "}${(r.timeMs / 1000).toFixed(1)}s</span>
    </div>`)
    .join("");
}

function renderRace(room) {
  const race = room.race;
  if (!race) return;
  if (!raceState.active) raceEnter(room);

  if (!race.resolved) {
    raceEls.statusLine.textContent = raceState.crashed
      ? "Bateste! Vê quem ainda aguenta — a ronda acaba quando o último bater."
      : "Desvia-te! Todos apanham exatamente os mesmos carros.";
    raceEls.results.classList.add("hidden");
    raceEls.continueBtn.classList.add("hidden");
    raceEls.standings.classList.remove("hidden");
    raceEls.road.classList.remove("hidden");
    raceRenderStandings(room);
    fitRaceRoad();
  } else {
    raceEls.statusLine.textContent = "Corrida terminada!";
    raceEls.standings.classList.add("hidden");
    // Acabou a corrida: a estrada já não tem nada para ver e, com 560px de
    // altura, empurrava os resultados e o botão "Continuar" para fora do ecrã.
    raceEls.road.classList.add("hidden");
    raceEls.results.classList.remove("hidden");
    raceEls.results.innerHTML = "";
    const ordered = Object.entries(room.players || {})
      .sort((a, b) => (race.standings?.[a[0]]?.place || 99) - (race.standings?.[b[0]]?.place || 99));
    ordered.forEach(([uid, p]) => {
      const st = race.standings?.[uid] || {};
      const seconds = ((st.timeMs || 0) / 1000).toFixed(1);
      const detail = st.podium
        ? `${st.place}º — ${seconds}s (+${st.podium} de pódio)`
        : `${st.place || "-"}º — ${seconds}s`;
      const row = document.createElement("div");
      row.className = "score-row";
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
        <span class="score-round">${detail}</span>
        <span class="score-total">+${race.roundPoints?.[uid] || 0} pts</span>`;
      raceEls.results.appendChild(row);
    });
    raceEls.continueBtn.classList.toggle("hidden", !isHost(room));
  }
}

// ---------- MINI-GOLFE EM EQUIPA ----------
// Mesmo padrão de tempo real "por confiança" da Fuga/Batalha: cada cliente
// simula e transmite só a SUA bola, e a câmara segue-a. As bolas não colidem
// entre si — o que os jogadores usam uns contra os outros são os power-ups:
// a barreira (parede temporária, estado partilhado, vale para todos) e o
// interruptor (congela os comandos de toda a gente menos de quem o usou).

const GOLF_MP_ACCEL = 470;
const GOLF_MP_DRAG = 1.3;
const GOLF_MP_MAX_SPEED = 330;
const GOLF_MP_BOUNCE_LOSS = 0.7;

const golfMpEls = {
  statusLine: document.getElementById("golf-mp-status-line"),
  timer: document.getElementById("golf-mp-timer"),
  arena: document.getElementById("golf-mp-arena"),
  results: document.getElementById("golf-mp-results"),
  continueBtn: document.getElementById("golf-mp-continue-btn"),
};

const golfMpState = {
  active: false,
  x: 0, y: 0, vx: 0, vy: 0,
  keys: { up: false, down: false, left: false, right: false },
  lastFrame: 0,
  lastBroadcastAt: 0,
  finished: false,
  keydownHandler: null,
  keyupHandler: null,
  rafId: null,
  worldEl: null,
  ballEls: {},
  powerupEls: {},
  barrierEls: {},
};

golfMpEls.continueBtn.addEventListener("click", () => {
  finishGolfRound(state.code, state.room);
});

function golfMpHandleKey(e, isDown) {
  const map = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
  if (e.key === " ") {
    e.preventDefault();
    if (isDown && !golfMpState.finished) useGolfCharge(state.code, state.room, state.uid, golfMpState.x, golfMpState.y);
    return;
  }
  const dir = map[e.key];
  if (!dir) return;
  e.preventDefault();
  golfMpState.keys[dir] = isDown;
}

function golfMpEnter(room) {
  const golf = room.golf || {};
  golfMpState.active = true;
  const myBall = golf.balls?.[state.uid];
  golfMpState.x = myBall?.x ?? GOLF_MP_START.x;
  golfMpState.y = myBall?.y ?? GOLF_MP_START.y;
  golfMpState.vx = 0;
  golfMpState.vy = 0;
  golfMpState.keys = { up: false, down: false, left: false, right: false };
  golfMpState.finished = golf.finished?.[state.uid] !== undefined;
  golfMpState.ballEls = {};
  golfMpState.powerupEls = {};
  golfMpState.barrierEls = {};

  golfMpEls.arena.innerHTML = "";
  golfMpState.worldEl = document.createElement("div");
  golfMpState.worldEl.className = "golf-world";
  golfMpState.worldEl.style.width = `${GOLF_MP_COURSE_W}px`;
  golfMpState.worldEl.style.height = `${GOLF_MP_COURSE_H}px`;
  GOLF_MP_WALLS.forEach((w) => {
    const el = document.createElement("div");
    el.className = "golf-wall";
    el.style.left = `${w.x}px`;
    el.style.top = `${w.y}px`;
    el.style.width = `${w.w}px`;
    el.style.height = `${w.h}px`;
    golfMpState.worldEl.appendChild(el);
  });
  const holeEl = document.createElement("div");
  holeEl.className = "golf-hole golf-mp-hole";
  holeEl.style.left = `${GOLF_MP_HOLE.x - GOLF_MP_HOLE_RADIUS}px`;
  holeEl.style.top = `${GOLF_MP_HOLE.y - GOLF_MP_HOLE_RADIUS}px`;
  holeEl.style.width = `${GOLF_MP_HOLE_RADIUS * 2}px`;
  holeEl.style.height = `${GOLF_MP_HOLE_RADIUS * 2}px`;
  golfMpState.worldEl.appendChild(holeEl);
  golfMpEls.arena.appendChild(golfMpState.worldEl);

  golfMpState.keydownHandler = (e) => golfMpHandleKey(e, true);
  golfMpState.keyupHandler = (e) => golfMpHandleKey(e, false);
  document.addEventListener("keydown", golfMpState.keydownHandler);
  document.addEventListener("keyup", golfMpState.keyupHandler);
  showTouchControls({ action: { key: " ", label: "Usar" } });
  golfMpState.lastFrame = performance.now();
  golfMpState.rafId = requestAnimationFrame(golfMpTick);
}

function golfMpExit() {
  hideTouchControls();
  golfMpState.active = false;
  if (golfMpState.rafId) cancelAnimationFrame(golfMpState.rafId);
  golfMpState.rafId = null;
  if (golfMpState.keydownHandler) document.removeEventListener("keydown", golfMpState.keydownHandler);
  if (golfMpState.keyupHandler) document.removeEventListener("keyup", golfMpState.keyupHandler);
  golfMpState.keydownHandler = null;
  golfMpState.keyupHandler = null;
}

function golfMpBallEl(uid, name) {
  if (golfMpState.ballEls[uid]) return golfMpState.ballEls[uid];
  const el = document.createElement("div");
  el.className = "golf-mp-ball";
  el.style.width = `${GOLF_MP_BALL_RADIUS * 2}px`;
  el.style.height = `${GOLF_MP_BALL_RADIUS * 2}px`;
  const label = document.createElement("span");
  label.className = "golf-mp-ball-name";
  label.textContent = name;
  el.appendChild(label);
  golfMpState.worldEl.appendChild(el);
  golfMpState.ballEls[uid] = el;
  return el;
}

function golfMpTick(now) {
  if (!golfMpState.active) return;
  const room = state.room;
  const golf = room?.golf;
  if (!golf) { golfMpState.rafId = requestAnimationFrame(golfMpTick); return; }

  const dt = Math.min((now - golfMpState.lastFrame) / 1000, 0.05);
  golfMpState.lastFrame = now;
  const serverNowMs = serverNow();
  const frozen = (golf.frozenUntil?.[state.uid] || 0) > serverNowMs;
  if (golf.finished?.[state.uid] !== undefined) golfMpState.finished = true;

  if (!golf.resolved && !golfMpState.finished && !frozen) {
    let ax = 0, ay = 0;
    if (golfMpState.keys.left) ax -= 1;
    if (golfMpState.keys.right) ax += 1;
    if (golfMpState.keys.up) ay -= 1;
    if (golfMpState.keys.down) ay += 1;
    const len = Math.hypot(ax, ay);
    if (len > 0) {
      golfMpState.vx += (ax / len) * GOLF_MP_ACCEL * dt;
      golfMpState.vy += (ay / len) * GOLF_MP_ACCEL * dt;
    }
  }

  const dragFactor = Math.max(0, 1 - GOLF_MP_DRAG * dt);
  golfMpState.vx *= dragFactor;
  golfMpState.vy *= dragFactor;
  const speed = Math.hypot(golfMpState.vx, golfMpState.vy);
  if (speed > GOLF_MP_MAX_SPEED) {
    golfMpState.vx = (golfMpState.vx / speed) * GOLF_MP_MAX_SPEED;
    golfMpState.vy = (golfMpState.vy / speed) * GOLF_MP_MAX_SPEED;
  }

  let newX = golfMpState.x + golfMpState.vx * dt;
  let newY = golfMpState.y + golfMpState.vy * dt;

  // As barreiras largadas por outros jogadores entram aqui, exatamente como
  // as paredes fixas: é o que faz o power-up doer mesmo.
  golfActiveWalls(golf, serverNowMs).forEach((w) => {
    const closestX = Math.max(w.x, Math.min(newX, w.x + w.w));
    const closestY = Math.max(w.y, Math.min(newY, w.y + w.h));
    const dx = newX - closestX;
    const dy = newY - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < GOLF_MP_BALL_RADIUS * GOLF_MP_BALL_RADIUS) {
      const dist = Math.sqrt(distSq) || 0.001;
      const nx = dx / dist;
      const ny = dy / dist;
      newX = closestX + nx * GOLF_MP_BALL_RADIUS;
      newY = closestY + ny * GOLF_MP_BALL_RADIUS;
      const vDotN = golfMpState.vx * nx + golfMpState.vy * ny;
      golfMpState.vx -= 2 * vDotN * nx * GOLF_MP_BOUNCE_LOSS;
      golfMpState.vy -= 2 * vDotN * ny * GOLF_MP_BOUNCE_LOSS;
    }
  });

  if (newX <= GOLF_MP_BALL_RADIUS || newX >= GOLF_MP_COURSE_W - GOLF_MP_BALL_RADIUS) golfMpState.vx *= -0.6;
  if (newY <= GOLF_MP_BALL_RADIUS || newY >= GOLF_MP_COURSE_H - GOLF_MP_BALL_RADIUS) golfMpState.vy *= -0.6;
  golfMpState.x = Math.max(GOLF_MP_BALL_RADIUS, Math.min(GOLF_MP_COURSE_W - GOLF_MP_BALL_RADIUS, newX));
  golfMpState.y = Math.max(GOLF_MP_BALL_RADIUS, Math.min(GOLF_MP_COURSE_H - GOLF_MP_BALL_RADIUS, newY));

  // Apanhar power-ups: deteção local, como as armas da Batalha.
  if (!golfMpState.finished && !golf.resolved && !golf.charges?.[state.uid]) {
    Object.entries(golf.powerups || {}).forEach(([id, p]) => {
      if (Math.hypot(p.x - golfMpState.x, p.y - golfMpState.y) < GOLF_MP_POWERUP_RADIUS + GOLF_MP_BALL_RADIUS) {
        claimGolfPowerup(state.code, state.uid, id, p.type);
      }
    });
  }

  if (!golfMpState.finished && !golf.resolved
      && Math.hypot(GOLF_MP_HOLE.x - golfMpState.x, GOLF_MP_HOLE.y - golfMpState.y) < GOLF_MP_HOLE_RADIUS) {
    golfMpState.finished = true;
    claimGolfFinish(state.code, room, state.uid);
  }

  if (!golfMpState.finished && serverNowMs - golfMpState.lastBroadcastAt > GOLF_MP_BROADCAST_MS) {
    golfMpState.lastBroadcastAt = serverNowMs;
    updateGolfBall(state.code, state.uid, Math.round(golfMpState.x), Math.round(golfMpState.y));
  }

  golfMpRenderWorld(room, serverNowMs);
  golfMpState.rafId = requestAnimationFrame(golfMpTick);
}

function golfMpRenderWorld(room, nowMs) {
  const golf = room.golf || {};
  Object.entries(room.players || {}).forEach(([uid, p]) => {
    const isMe = uid === state.uid;
    const pos = isMe
      ? { x: golfMpState.x, y: golfMpState.y }
      : (golf.balls?.[uid] || GOLF_MP_START);
    const el = golfMpBallEl(uid, p.name);
    el.style.left = `${pos.x - GOLF_MP_BALL_RADIUS}px`;
    el.style.top = `${pos.y - GOLF_MP_BALL_RADIUS}px`;
    el.classList.toggle("golf-mp-ball-me", isMe);
    el.classList.toggle("golf-mp-ball-done", golf.finished?.[uid] !== undefined);
    el.classList.toggle("golf-mp-ball-frozen", (golf.frozenUntil?.[uid] || 0) > nowMs);
  });

  const seenP = new Set();
  Object.entries(golf.powerups || {}).forEach(([id, p]) => {
    seenP.add(id);
    let el = golfMpState.powerupEls[id];
    if (!el) {
      el = document.createElement("div");
      el.className = `golf-mp-powerup golf-mp-powerup-${p.type}`;
      el.textContent = p.type === "barrier" ? "🧱" : "🔌";
      golfMpState.worldEl.appendChild(el);
      golfMpState.powerupEls[id] = el;
    }
    el.style.left = `${p.x - GOLF_MP_POWERUP_RADIUS}px`;
    el.style.top = `${p.y - GOLF_MP_POWERUP_RADIUS}px`;
  });
  Object.keys(golfMpState.powerupEls).forEach((id) => {
    if (!seenP.has(id)) { golfMpState.powerupEls[id].remove(); delete golfMpState.powerupEls[id]; }
  });

  const seenB = new Set();
  Object.entries(golf.barriers || {}).forEach(([id, b]) => {
    if ((b.until || 0) <= nowMs) return;
    seenB.add(id);
    let el = golfMpState.barrierEls[id];
    if (!el) {
      el = document.createElement("div");
      el.className = "golf-wall golf-mp-barrier";
      golfMpState.worldEl.appendChild(el);
      golfMpState.barrierEls[id] = el;
    }
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
  });
  Object.keys(golfMpState.barrierEls).forEach((id) => {
    if (!seenB.has(id)) { golfMpState.barrierEls[id].remove(); delete golfMpState.barrierEls[id]; }
  });

  // Câmara: segue sempre a PRÓPRIA bola.
  const viewportW = golfMpEls.arena.clientWidth;
  const viewportH = golfMpEls.arena.clientHeight;
  const camX = Math.max(0, Math.min(GOLF_MP_COURSE_W - viewportW, golfMpState.x - viewportW / 2));
  const camY = Math.max(0, Math.min(GOLF_MP_COURSE_H - viewportH, golfMpState.y - viewportH / 2));
  golfMpState.worldEl.style.transform = `translate(${-camX}px, ${-camY}px)`;
}

function renderGolfMp(room) {
  const golf = room.golf;
  if (!golf) return;
  if (!golfMpState.active) golfMpEnter(room);

  if (!golf.resolved) {
    const msLeft = Math.max(0, (golf.endAt || 0) - serverNow());
    golfMpEls.timer.textContent = `${Math.ceil(msLeft / 1000)}s`;
    const charge = golf.charges?.[state.uid];
    const frozen = (golf.frozenUntil?.[state.uid] || 0) > serverNow();
    golfMpEls.statusLine.textContent = golf.finished?.[state.uid] !== undefined
      ? "Já meteste! Vê quem ainda anda a bater nas paredes."
      : frozen
        ? "🔌 Alguém te desligou os comandos — aguenta uns segundos!"
        : charge
          ? `Tens ${charge === "barrier" ? "🧱 uma barreira" : "🔌 um interruptor"} — Espaço para usar contra os outros.`
          : "Mete a bola no buraco. Apanha os power-ups pelo caminho.";
    golfMpEls.results.classList.add("hidden");
    golfMpEls.continueBtn.classList.add("hidden");
  } else {
    golfMpEls.timer.textContent = "";
    golfMpEls.statusLine.textContent = "Buraco fechado!";
    golfMpEls.results.classList.remove("hidden");
    golfMpEls.results.innerHTML = "";
    Object.entries(room.players || {})
      .sort((a, b) => (golf.standings?.[a[0]]?.place || 99) - (golf.standings?.[b[0]]?.place || 99))
      .forEach(([uid, p]) => {
        const st = golf.standings?.[uid] || {};
        const detail = st.finished
          ? `${st.place}º — meteu em ${(st.timeMs / 1000).toFixed(1)}s`
          : `não meteu — ficou a ${st.distance || "?"}px do buraco`;
        const row = document.createElement("div");
        row.className = "score-row";
        row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
          <span class="score-round">${escapeHtml(detail)}</span>
          <span class="score-total">+${golf.roundPoints?.[uid] || 0} pts</span>`;
        golfMpEls.results.appendChild(row);
      });
    golfMpEls.continueBtn.classList.toggle("hidden", !isHost(room));
  }
}

// ---------- ONDE FICA ISTO? EM EQUIPA ----------
// Ronda simultânea: todos veem o mesmo desenho (o SVG vem do data.js local, só
// o ID viaja pela rede) e as mesmas opções. A primeira resposta é a que conta.

const landmarkTeamEls = {
  roundInfo: document.getElementById("landmark-team-round-info"),
  timer: document.getElementById("landmark-team-timer"),
  image: document.getElementById("landmark-team-image"),
  options: document.getElementById("landmark-team-options"),
  status: document.getElementById("landmark-team-status"),
  results: document.getElementById("landmark-team-results"),
};

// Guarda o que já está desenhado no ecrã para não recriar os botões a cada
// atualização da sala — senão o rato "perdia" o botão a meio do clique.
const landmarkTeamState = { renderedKey: null };

function renderLandmarkTeam(room) {
  const lm = room.landmark;
  if (!lm) return;
  const landmark = LANDMARKS.find((l) => l.id === lm.landmarkId);
  const myAnswer = lm.answers?.[state.uid]?.option || null;
  const key = `${lm.roundIndex}|${lm.landmarkId}|${myAnswer}|${lm.resolved}`;

  landmarkTeamEls.roundInfo.textContent = `Ronda ${lm.roundIndex}/${lm.roundsTotal}`;

  if (landmarkTeamState.renderedKey !== key) {
    landmarkTeamState.renderedKey = key;
    landmarkTeamEls.image.innerHTML = landmark?.svg || "";
    landmarkTeamEls.options.innerHTML = "";
    (lm.options || []).forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "landmark-option-btn";
      btn.textContent = opt;
      if (lm.resolved) {
        if (opt === lm.correctAnswer) btn.classList.add("correct");
        else if (opt === myAnswer) btn.classList.add("wrong");
        btn.disabled = true;
      } else if (myAnswer) {
        btn.disabled = true;
        if (opt === myAnswer) btn.classList.add("chosen");
      } else {
        btn.addEventListener("click", () => submitLandmarkAnswer(state.code, state.room, state.uid, opt));
      }
      landmarkTeamEls.options.appendChild(btn);
    });
  }

  if (!lm.resolved) {
    const msLeft = Math.max(0, (lm.endAt || 0) - serverNow());
    landmarkTeamEls.timer.textContent = `${Math.ceil(msLeft / 1000)}s`;
    const answered = Object.keys(lm.answers || {}).length;
    const total = Object.keys(room.players || {}).length;
    landmarkTeamEls.status.textContent = myAnswer
      ? `Respondeste "${myAnswer}". Já responderam ${answered}/${total}.`
      : `Onde fica este marco? (${answered}/${total} já responderam)`;
    landmarkTeamEls.results.classList.add("hidden");
  } else {
    landmarkTeamEls.timer.textContent = "";
    landmarkTeamEls.status.textContent = landmark
      ? `É ${landmark.name} — ${lm.correctAnswer}.`
      : `Resposta certa: ${lm.correctAnswer}.`;
    landmarkTeamEls.results.classList.remove("hidden");
    landmarkTeamEls.results.innerHTML = "";
    Object.entries(room.players || {}).forEach(([uid, p]) => {
      const r = lm.roundResults?.[uid] || {};
      const detail = !r.answer
        ? "não respondeu"
        : r.correct
          ? `${r.answer} ✅ em ${(r.elapsedMs / 1000).toFixed(1)}s`
          : `${r.answer} ❌`;
      const pts = r.correct ? LANDMARK_TEAM_POINTS + (r.speedBonus || 0) : 0;
      const row = document.createElement("div");
      row.className = "score-row";
      row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
        <span class="score-round">${escapeHtml(detail)}</span>
        <span class="score-total">+${pts} pts</span>`;
      landmarkTeamEls.results.appendChild(row);
    });
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
      <span class="final-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
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
    row.innerHTML = `<span class="score-name">${i === 0 ? "👑 " : `#${i + 1} `}${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
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
  const points = [...pointsObjectToArray(room?.scratchpad?.points), ...scratchpadState.pending];
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
    } else if (room.state === "race") {
      const race = room.race;
      if (race && !race.resolved) {
        // A corrida acaba quando o último bater (ou ao fim do teto de tempo).
        // Só contam quem está ligado: se alguém fechar o browser a meio, os
        // outros não ficam presos à espera de um carro que já não corre.
        const connectedIds = Object.keys(room.players || {}).filter((uid) => room.players[uid].connected);
        const aliveCount = connectedIds.filter((uid) => race.racers?.[uid]?.alive !== false).length;
        // connectedIds.length > 0 é essencial: numa janela em que ninguém
        // conste como ligado (entrada/saída, reconexão), aliveCount seria 0 e
        // a corrida terminava sozinha logo aos poucos segundos.
        if (now >= (race.endAt || 0) || (connectedIds.length > 0 && aliveCount === 0)) {
          await resolveRaceRound(state.code, room);
        }
      } else if (race && race.resolved) {
        if (now - (race.resolvedAt || 0) > RACE_RESULT_DISPLAY_MS) {
          await finishRaceRound(state.code, room);
        }
      }
    } else if (room.state === "landmark") {
      const lm = room.landmark;
      if (lm && !lm.resolved) {
        const connectedIds = Object.keys(room.players || {}).filter((uid) => room.players[uid].connected);
        const allAnswered = connectedIds.length > 0 && connectedIds.every((uid) => lm.answers?.[uid]);
        if (now >= (lm.endAt || 0) || allAnswered) {
          await resolveLandmarkRound(state.code, room);
        }
      } else if (lm && lm.resolved) {
        if (now - (lm.resolvedAt || 0) > LANDMARK_TEAM_RESULT_DISPLAY_MS) {
          await advanceLandmarkRoundOrFinish(state.code, room);
        }
      }
    } else if (room.state === "golf") {
      const golf = room.golf;
      if (golf && !golf.resolved) {
        const activePowerups = Object.keys(golf.powerups || {}).length;
        if (activePowerups < GOLF_MP_POWERUP_MAX_ACTIVE && now - (golf.lastPowerupSpawnAt || 0) > GOLF_MP_POWERUP_SPAWN_INTERVAL_MS) {
          await spawnGolfPowerup(state.code, room);
        }
        await pruneGolfBarriers(state.code, room);
        const connectedIds = Object.keys(room.players || {}).filter((uid) => room.players[uid].connected);
        const stillPlaying = connectedIds.filter((uid) => golf.finished?.[uid] === undefined).length;
        if (now >= (golf.endAt || 0) || (connectedIds.length > 0 && stillPlaying === 0)) {
          await resolveGolfRound(state.code, room);
        }
      } else if (golf && golf.resolved) {
        if (now - (golf.resolvedAt || 0) > GOLF_MP_RESULT_DISPLAY_MS) {
          await finishGolfRound(state.code, room);
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
