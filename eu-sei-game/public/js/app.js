import { getUid, serverNow } from "./firebase-init.js";
import { showTouchControls, hideTouchControls } from "./touch-controls.js";
// As ferramentas são as MESMAS do quadro solo, não uma cópia: o que é um
// "marcador" tem de ser a mesma coisa nos dois sítios, senão o mesmo botão
// desenha diferente conforme o ecrã em que se está. Vivem no data.js, que não
// toca no DOM — assim o módulo da rede e os testes puros também lhes chegam.
import { sfx } from "./sfx.js";
import {
  CATEGORIES, DEFAULT_CONFIG, CONFIG_LIMITS, catKey, MIN_ENABLED_CATEGORIES,
  CUSTOM_CAT_OFFSET, MAX_CUSTOM_CATEGORIES, MAX_CUSTOM_CATEGORY_LEN,
  limparCategoriasProprias, nomeDaCategoria, ehCategoriaPropria,
  MAP_BACKGROUND_SVG, LANDMARKS,
} from "./data.js";
import {
  createRoom, joinRoom, rejoinRoom, listenRoom, updateConfig,
  maybeReclaimHost, updatePlayerAvatar, startGame, startQuickBonusGame, backToLobby,
  startBallPhase, claimBallWin, startLetterPick, voteLetter,
  confirmLetter, submitAnswer, finishCategoriesRound, startVoting, castVote,
  finishVoting, nextRoundOrFinal, resetForRematch, leaveRoom, pointsObjectToArray,
  pushDrawDoodlePoints, clearDrawDoodle, selectDrawWinner, skipDrawRound, advanceDrawRound,
  DRAW_WINNER_POINTS, DRAW_DRAWER_BONUS, submitMapTriviaAnswer, resolveMapTriviaRound, advanceMapTriviaRoundOrFinish,
  voteAcceptMapTriviaAnswer, MAP_TRIVIA_RESULT_DISPLAY_MS, updateTagPosition, claimTagInfection, claimTagPowerup,
  spawnTagPowerup, resolveTagRound, finishTagRound, TAG_PLAYER_RADIUS, TAG_POWERUP_RADIUS,
  TAG_WALLS, TAG_ARENA_W, TAG_ARENA_H, tagClampToWalls, tagTravadoPor,
  TAG_POWERUP_MAX_ACTIVE, TAG_POWERUP_SPAWN_INTERVAL_MS, TAG_RESULT_DISPLAY_MS, updateBattlePosition, claimBattleWeapon,
  claimBattleHit, spawnBattleWeapon, resolveBattleRound, finishBattleRound, battleClampToWalls,
  registarGolpe, BATTLE_GOLPE_MS, BATTLE_BAQUE_MS,
  BATTLE_WALLS, BATTLE_PLAYER_RADIUS, BATTLE_WEAPON_RADIUS, BATTLE_WEAPON_MAX_ACTIVE, BATTLE_WEAPON_SPAWN_INTERVAL_MS,
  BATTLE_ATTACK_RADIUS, BATTLE_ATTACK_COOLDOWN_MS, BATTLE_LIVES, BATTLE_RESULT_DISPLAY_MS, updateRacer,
  crashRacer, resolveRaceRound, finishRaceRound, raceObstacleLane, racerTimeMs,
  raceSpawnIntervalAt, raceSpeedAt, RACE_LANES, RACE_CAR_W, RACE_CAR_H,
  RACE_ROAD_H, RACE_PLAYER_Y, RACE_BASE_SPEED, RACE_SPAWN_INTERVAL_START_MS, RACE_BROADCAST_MS,
  RACE_RESULT_DISPLAY_MS, TEMA_MARCOS,
  updateGolfBall, claimGolfFinish, claimGolfPowerup, useGolfCharge,
  spawnGolfPowerup, pruneGolfBarriers, golfActiveWalls, resolveGolfRound, finishGolfRound,
  GOLF_MP_COURSE_W, GOLF_MP_COURSE_H, GOLF_MP_BALL_RADIUS, GOLF_MP_HOLE_RADIUS, GOLF_MP_START,
  GOLF_MP_HOLE, GOLF_MP_WALLS, GOLF_MP_POWERUP_RADIUS, GOLF_MP_POWERUP_MAX_ACTIVE, GOLF_MP_POWERUP_SPAWN_INTERVAL_MS,
  GOLF_MP_BROADCAST_MS, GOLF_MP_RESULT_DISPLAY_MS,
  golfTerreno, golfSaltitao, GOLF_MP_ACELERADORES, GOLF_MP_SALTITOES, GOLF_MP_AREIAS,
  mapaMangaRouba, MAPA_MANGA_CADA_MS,
} from "./room.js";
import { state, screens, isHost } from "./app-state.js";
import { escapeHtml, avatarImgHtml } from "./ui-utils.js";
// O quadro de sala (Forca / desenho livre) vive em módulo próprio: ver a nota
// no topo do board-room.js.
import { renderHangman, esquecerNarracao } from "./board-room.js";
// O mapa de sala, pelo mesmo motivo: o motor e o ecrã do mapa já existem para
// o modo sozinho, e este módulo só os liga à sala.
import { renderMapaSala, esquecerMapaDaSala } from "./mapa-sala.js";
// Os jogos que ainda não estão para se mostrar saem do ecrã aqui — o menu de
// jogos da sala vive neste ficheiro.
import { esconderAOficina } from "./oficina.js";


function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
}


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


function showHomeError(msg) {
  els.homeError.textContent = msg;
}

// Onde é que eu estava. Guardado ao entrar numa sala e apagado ao sair, para
// um recarregamento da página devolver a pessoa ao sítio onde estava em vez de
// a deitar fora do jogo. No telemóvel isto não é um caso raro: os browsers
// recarregam separadores em segundo plano sozinhos, e basta trocar de app e
// voltar para se perder a sala a meio de uma partida.
//
// Por SEPARADOR, e não por browser, porque a identidade de jogador também o é
// (ver getUid no firebase-init.js): com duas pessoas em dois separadores do
// mesmo computador, uma sala guardada em comum mandava a segunda para a sala
// da primeira. A memória da sala dura exatamente o que dura a identidade de
// quem a tinha.
const ROOM_KEY = "euSei_salaAtual";

function lembrarSala(code, name) {
  try {
    sessionStorage.setItem(ROOM_KEY, JSON.stringify({ code, name }));
  } catch { /* sem armazenamento: só não sobrevive ao recarregamento */ }
}

function esquecerSala() {
  try {
    sessionStorage.removeItem(ROOM_KEY);
  } catch { /* ver lembrarSala */ }
}

function salaLembrada() {
  try {
    const g = JSON.parse(sessionStorage.getItem(ROOM_KEY) || "null");
    return g && g.code ? g : null;
  } catch {
    return null;
  }
}

function enterRoom(code) {
  state.code = code;
  showHomeError("");
  lembrarSala(code, state.name);
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
  // Sair do mapa desliga-o da sala. Sem isto, o ecrã do mapa continuava a
  // escrever conquistas numa sala que já ia noutro jogo.
  if (room.state !== "mapa") esquecerMapaDaSala();
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
    case "golf": renderGolfMp(room); showScreen("golf"); break;
    case "mapa": renderMapaSala(room); showScreen("mapa"); break;
    case "final": renderFinal(room); showScreen("final"); break;
    default: showScreen("lobby");
  }

  refreshOptionsIfOpen(room);
  runHostLoopTick(room);
}

function leaveToHome() {
  // Sair é sair: apaga a sala guardada, senão o recarregamento seguinte
  // arrastava a pessoa de volta para uma sala que ela deixou de propósito.
  esquecerSala();
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
  catTotal: document.getElementById("cfg-cat-total"),
  catPropriaForm: document.getElementById("cfg-cat-propria-form"),
  catPropriaInput: document.getElementById("cfg-cat-propria-input"),
  catPropriaLista: document.getElementById("cfg-cat-propria-lista"),
  catPropriaAviso: document.getElementById("cfg-cat-propria-aviso"),
  minigamesHint: document.getElementById("lobby-minigames-hint"),
};

// Menu de escolha de jogo da sala, ao estilo do menu do modo sozinho: cada
// botão salta as rondas clássicas e começa logo nesse mini-jogo.
// Mínimo de jogadores por jogo. Era 3 para todos (herdado da regra da fila
// de bónus de fim de partida), o que deixava os quadros de desenho mortos
// numa sala de teste com 1–2 pessoas: o botão não fazia nada e parecia que
// o jogo "não abria". Só os jogos de perseguição precisam mesmo de 2+.
const MP_GAME_MIN_PLAYERS = { hangman: 1, mapTrivia: 1, draw: 2, tag: 2, battle: 2, race: 2, marcos: 2, golf: 2, mapa: 1 };

esconderAOficina();

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

// Índice -> caixa. Era um array (posição = índice), o que chegava enquanto as
// categorias eram só as 40 de origem; as da casa vivem a partir do 100, e um
// array com um buraco de sessenta lugares não é forma de guardar isto.
let catCheckboxes = new Map();
let propriasDesenhadas = null; // para não redesenhar a grelha a cada atualização da sala

function desenharGrelhaDeCategorias(proprias) {
  lobbyEls.catGrid.innerHTML = "";
  catCheckboxes = new Map();
  const cria = (indice, nome, daCasa) => {
    const label = document.createElement("label");
    if (daCasa) label.className = "cat-propria";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.dataset.catIndex = String(indice);
    input.addEventListener("change", () => {
      if (!state.room || !isHost(state.room)) return;
      if (!input.checked && getSelectedCategoryIndexes().length < MIN_ENABLED_CATEGORIES) {
        input.checked = true; // não deixa descer abaixo do mínimo
        return;
      }
      sendCategoryUpdate();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(daCasa ? `★ ${nome}` : nome));
    lobbyEls.catGrid.appendChild(label);
    catCheckboxes.set(indice, input);
  };
  CATEGORIES.forEach((nome, i) => cria(i, nome, false));
  proprias.forEach((nome, i) => cria(CUSTOM_CAT_OFFSET + i, nome, true));
  propriasDesenhadas = proprias.join("\u0000");
}
desenharGrelhaDeCategorias([]);
lobbyEls.catPropriaInput.maxLength = MAX_CUSTOM_CATEGORY_LEN;

function getSelectedCategoryIndexes() {
  const out = [];
  catCheckboxes.forEach((cb, i) => { if (cb.checked) out.push(i); });
  return out;
}

function sendCategoryUpdate() {
  if (!state.room || !isHost(state.room)) return;
  const selected = getSelectedCategoryIndexes();
  updateConfig(state.code, { enabledCategories: selected });
}

// --- As categorias da casa, escritas pelo anfitrião ---
//
// Só o anfitrião escreve; toda a gente vê a lista, porque saber com que
// categorias se vai jogar faz parte de decidir se se entra na sala.
function categoriasPropriasDaSala() {
  return limparCategoriasProprias(state.room?.config?.customCategories);
}

function desenharListaDeProprias(proprias, amHost) {
  lobbyEls.catPropriaLista.innerHTML = "";
  proprias.forEach((nome, i) => {
    const li = document.createElement("li");
    li.className = "cat-propria-chip";
    const span = document.createElement("span");
    span.textContent = nome;
    li.appendChild(span);
    if (amHost) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost";
      btn.textContent = "✕";
      btn.setAttribute("aria-label", `Apagar a categoria ${nome}`);
      btn.addEventListener("click", () => apagarCategoriaPropria(i));
      li.appendChild(btn);
    }
    lobbyEls.catPropriaLista.appendChild(li);
  });
  lobbyEls.catPropriaForm.classList.toggle("hidden", !amHost);
  lobbyEls.catPropriaLista.classList.toggle("hidden", proprias.length === 0);
}

function avisarSobreProprias(texto) {
  lobbyEls.catPropriaAviso.textContent = texto || "";
  lobbyEls.catPropriaAviso.classList.toggle("hidden", !texto);
}

// Apagar uma categoria da casa tem de tirá-la TAMBÉM da lista de ativas: se
// ficasse lá, a ronda seguinte podia sortear um índice sem nome nenhum.
// E as que estão depois dela mudam de índice — é por isso que se reescrevem
// as ativas a partir dos nomes, e não dos números.
function apagarCategoriaPropria(posicao) {
  if (!state.room || !isHost(state.room)) return;
  const antes = categoriasPropriasDaSala();
  const nomeApagado = antes[posicao];
  if (!nomeApagado) return;
  const depois = antes.filter((_, i) => i !== posicao);
  const ativasAntes = new Set(state.room?.config?.enabledCategories || []);
  const ativas = [];
  if (ativasAntes.size > 0) {
    ativasAntes.forEach((indice) => {
      if (!ehCategoriaPropria(indice)) { ativas.push(indice); return; }
      const nome = antes[indice - CUSTOM_CAT_OFFSET];
      const novaPos = depois.indexOf(nome);
      if (novaPos >= 0) ativas.push(CUSTOM_CAT_OFFSET + novaPos);
    });
  }
  const patch = { customCategories: depois };
  if (ativasAntes.size > 0) patch.enabledCategories = ativas;
  updateConfig(state.code, patch);
  avisarSobreProprias("");
}

function acrescentarCategoriaPropria(nomeBruto) {
  if (!state.room || !isHost(state.room)) return;
  const antes = categoriasPropriasDaSala();
  if (antes.length >= MAX_CUSTOM_CATEGORIES) {
    avisarSobreProprias(`Já são ${MAX_CUSTOM_CATEGORIES} — apaga uma para pôr outra.`);
    return;
  }
  const depois = limparCategoriasProprias([...antes, nomeBruto]);
  if (depois.length === antes.length) {
    avisarSobreProprias("Essa categoria já existe (ou está vazia).");
    return;
  }
  // Uma categoria acabada de escrever entra LIGADA. O contrário — escrevê-la
  // e ela não sair na ronda seguinte — lê-se como defeito.
  const ativasAntes = state.room?.config?.enabledCategories || [];
  const patch = { customCategories: depois };
  if (ativasAntes.length > 0) {
    patch.enabledCategories = [...ativasAntes, CUSTOM_CAT_OFFSET + depois.length - 1];
  }
  updateConfig(state.code, patch);
  avisarSobreProprias("");
}

lobbyEls.catSelectAll.addEventListener("click", () => {
  if (!state.room || !isHost(state.room)) return;
  catCheckboxes.forEach((cb) => { cb.checked = true; });
  sendCategoryUpdate();
});

lobbyEls.catPropriaForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const nome = lobbyEls.catPropriaInput.value;
  acrescentarCategoriaPropria(nome);
  lobbyEls.catPropriaInput.value = "";
  lobbyEls.catPropriaInput.focus();
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

  const proprias = limparCategoriasProprias(room.config?.customCategories);
  if (proprias.join("\u0000") !== propriasDesenhadas) {
    desenharGrelhaDeCategorias(proprias);
    desenharListaDeProprias(proprias, isHost(room));
  }
  const enabledCats = room.config?.enabledCategories;
  const hasCustomSelection = Array.isArray(enabledCats) && enabledCats.length > 0;
  const enabledSet = hasCustomSelection ? new Set(enabledCats) : null;
  catCheckboxes.forEach((cb, i) => {
    cb.checked = enabledSet ? enabledSet.has(i) : true;
  });
  lobbyEls.catCount.textContent = hasCustomSelection ? enabledCats.length : catCheckboxes.size;
  lobbyEls.catTotal.textContent = catCheckboxes.size;

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
  regras: document.getElementById("cat-regras"),
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
  // Com a letra lá dentro, em vez de uma regra genérica: é a letra desta
  // ronda que se está a esquecer quando se escreve depressa.
  if (catEls.regras) {
    catEls.regras.textContent = `Todas as respostas começam por ${cr.letter}. `
      + "Uma resposta que mais ninguém escreva vale a dobrar (10 pontos); repetida vale 5.";
  }

  if (catRenderedKey === cr.endAt) return; // mesma ronda; não recriar os inputs enquanto o jogador escreve
  catRenderedKey = cr.endAt;

  catEls.list.innerHTML = "";
  cr.categoryIndexes.forEach((ci) => {
    const wrapper = document.createElement("label");
    wrapper.className = "cat-item";
    const title = document.createElement("span");
    title.textContent = nomeDaCategoria(ci, categoriasPropriasDaSala());
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
  // Esconder o botão não é o mesmo que o proteger. Entre o momento em que o
  // anfitrião muda e o momento em que o ecrã se redesenha, o botão continua
  // lá clicável — e fechar a votação por engano acaba a ronda para toda a
  // gente. A verificação é do lado de quem age, como nas outras escritas.
  if (!state.room || !isHost(state.room)) return;
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
    p.textContent = `${nomeDaCategoria(ci, categoriasPropriasDaSala())}: ${text || "(sem resposta)"}`;
    voteEls.myAnswers.appendChild(p);
  });

  const scrollTop = voteEls.list.scrollTop;
  voteEls.list.innerHTML = "";
  const others = Object.keys(room.players || {}).filter((uid) => uid !== state.uid);
  cr.categoryIndexes.forEach((ci) => {
    const section = document.createElement("div");
    section.className = "vote-category";
    const h = document.createElement("h4");
    h.textContent = nomeDaCategoria(ci, categoriasPropriasDaSala());
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
  // Ver o comentário do botão de fechar a votação: avançar a ronda por engano
  // arrasta a sala inteira.
  if (!state.room || !isHost(state.room)) return;
  nextRoundOrFinal(state.code, state.room);
});

// PORQUÊ estes pontos. A queixa que mais se repete nas críticas dos jogos
// deste género é "pontuação pouco clara, dá para fazer batota": vê-se o
// número e não se vê a razão, e o que sobra é desconfiança de quem votou.
// Os dados já estavam todos guardados na ronda — faltava dizê-los.
function razaoDaResposta(res, letra) {
  const texto = (res?.text || "").trim();
  if (!texto) return "em branco";
  switch (res.status) {
    case "valida-unica":
      return res.gloriaVotes > 0 && res.points > 10 ? "só tu, e com Glória" : "só tu";
    case "valida-repetida":
      return "alguém escreveu o mesmo";
    case "engracada":
      return "não conta, mas fez rir";
    case "invalida":
      // Distinguir as duas maneiras de chumbar importa: uma é regra do jogo,
      // a outra é a mesa a decidir, e quem perde os pontos merece saber qual
      // das duas foi.
      return letra && texto[0].toUpperCase() !== letra.toUpperCase()
        ? `não começa por ${letra.toUpperCase()}`
        : "chumbada pela maioria";
    default:
      return "";
  }
}

function renderRoundScore(room) {
  const rr = room.roundResults;
  const players = Object.entries(room.players || {});
  players.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
  const letra = room.categoriesRound?.letter || "";
  const indices = room.categoriesRound?.categoryIndexes || [];
  const proprias = categoriasPropriasDaSala();

  roundScoreEls.table.innerHTML = "";
  players.forEach(([uid, p]) => {
    const row = document.createElement("div");
    row.className = "score-row";
    const roundPts = rr?.roundPoints?.[uid] || 0;
    row.innerHTML = `<span class="score-name">${avatarImgHtml(p.avatar, "sm", p.name)}${escapeHtml(p.name)}</span>
      <span class="score-round">+${roundPts} nesta ronda</span>
      <span class="score-total">${p.score || 0} pts</span>`;
    roundScoreEls.table.appendChild(row);

    const respostas = rr?.byPlayer?.[uid];
    if (!respostas || indices.length === 0) return;
    const det = document.createElement("details");
    det.className = "score-porque";
    // A tua própria conta abre sozinha; as dos outros abrem-se se se quiser
    // conferir. Abrir dez de uma vez num telemóvel dava um ecrã inteiro de
    // texto e ninguém lia nenhum.
    if (uid === state.uid) det.open = true;
    const sum = document.createElement("summary");
    sum.textContent = uid === state.uid ? "Porquê estes pontos" : `Ver as respostas de ${p.name}`;
    det.appendChild(sum);
    indices.forEach((ci) => {
      const res = respostas[catKey(ci)];
      if (!res) return;
      const linha = document.createElement("p");
      linha.className = "score-porque-linha";
      const razao = razaoDaResposta(res, letra);
      linha.innerHTML = `<span class="score-porque-cat">${escapeHtml(nomeDaCategoria(ci, proprias))}</span>`
        + `<span class="score-porque-resp">${escapeHtml(res.text || "—")}</span>`
        + `<span class="score-porque-pts">${razao} · ${res.points} pts</span>`;
      det.appendChild(linha);
    });
    roundScoreEls.table.appendChild(det);
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
  title: document.getElementById("draw-title"),
  status: document.getElementById("draw-status"),
  reveal: document.getElementById("draw-reveal"),
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
  // O mesmo ecrã serve os dois baralhos: palavras soltas ("Girafa") e
  // monumentos ("Torre Eiffel", e o que se adivinha é o PAÍS).
  const marcos = draw.tema === TEMA_MARCOS;
  const marco = marcos ? LANDMARKS.find((l) => l.id === draw.landmarkId) : null;
  drawEls.title.textContent = marcos ? "Onde Fica Isto?" : "Desenha e Adivinha";

  if (!draw.resolved) {
    // A palavra secreta só aparece a quem desenha; os outros só sabem de
    // quem é a vez (e adivinham em voz alta).
    drawEls.reveal.classList.add("hidden");
    drawEls.status.textContent = amDrawer
      ? (marcos
        ? `${roundLabel} — desenha: “${draw.secretWord || "?"}” (fica ${marco?.onde || "?"})`
        : `${roundLabel} — desenha: “${draw.secretWord || "?"}”`)
      : (marcos
        ? `${roundLabel} — ${drawerName} está a desenhar um monumento. Digam o PAÍS em voz alta!`
        : `${roundLabel} — ${drawerName} está a desenhar. Adivinhem em voz alta!`);
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
    // No tema dos marcos o desenho da casa aparece AQUI, no fim — é a
    // resposta, não a pergunta. Quem nunca viu o monumento fica a saber
    // como é e onde fica; quem já sabia não ganhou vantagem nenhuma.
    drawEls.reveal.classList.toggle("hidden", !marco);
    if (marco) drawEls.reveal.innerHTML = marco.svg;
    // A frase vem escrita à mão no baralho, não montada aqui: em português o
    // artigo muda com o nome ("o Big Ben", "as Pirâmides") e a preposição
    // muda com o país ("em França", "no Egito", "na Índia"). Por regra saía
    // "Era a Big Ben, em Reino Unido".
    const word = marco
      ? `${marco.frase} `
      : draw.secretWord ? `Era “${draw.secretWord}”. ` : "";
    if (draw.roundWinnerId) {
      const winnerName = room.players?.[draw.roundWinnerId]?.name || "Alguém";
      drawEls.result.textContent = `🎉 ${word}${winnerName} acertou! +${DRAW_WINNER_POINTS} pts (e +${DRAW_DRAWER_BONUS} para ${drawerName})`;
    } else {
      drawEls.result.textContent = `${word}Ninguém acertou desta vez...`;
    }
  }
  drawDoodleRedraw();
  if (draw.resolved) guardarNoAlbum(room, draw, marco);
}

// --- O ÁLBUM DA NOITE ---
//
// O que faz as pessoas mandarem print aos amigos no dia seguinte não é a
// classificação, é o desenho. Os jogos vizinhos que têm isto (o "álbum" do
// Gartic Phone) fazem dele o fim da partida.
//
// Vive no browser de cada um, não na sala: cada cliente já recebeu os traços
// enquanto eram feitos, por isso a fotografia sai de graça e a sala não
// engorda com imagens. O preço honesto: quem recarregar a página a meio perde
// o que veio antes, e quem chegou tarde só tem de onde chegou.
const albumDaNoite = [];
const albumJaVistos = new Set();
const ALBUM_LARGURA = 320;

function guardarNoAlbum(room, draw, marco) {
  const chave = `${draw.turnIndex}:${draw.drawerId}:${draw.secretWord || draw.landmarkId || ""}`;
  if (albumJaVistos.has(chave)) return;
  const origem = drawEls.doodleCanvas;
  if (!origem || !origem.width || !origem.height) return;
  albumJaVistos.add(chave);
  const escala = ALBUM_LARGURA / origem.width;
  const mini = document.createElement("canvas");
  mini.width = ALBUM_LARGURA;
  mini.height = Math.max(1, Math.round(origem.height * escala));
  const ctx = mini.getContext("2d");
  // Fundo branco: o quadro é transparente, e um PNG transparente guardado no
  // telemóvel aparece como um borrão preto na galeria.
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, mini.width, mini.height);
  ctx.drawImage(origem, 0, 0, mini.width, mini.height);
  albumDaNoite.push({
    imagem: mini.toDataURL("image/png"),
    palavra: marco ? marco.name : (draw.secretWord || ""),
    autor: room.players?.[draw.drawerId]?.name || "Alguém",
    acertou: draw.roundWinnerId ? (room.players?.[draw.roundWinnerId]?.name || null) : null,
  });
}

function desenharAlbum() {
  if (!finalEls.album || !finalEls.albumGrid) return;
  finalEls.album.classList.toggle("hidden", albumDaNoite.length === 0);
  if (albumDaNoite.length === 0) return;
  finalEls.albumGrid.innerHTML = "";
  albumDaNoite.forEach((f, i) => {
    const fig = document.createElement("figure");
    fig.className = "album-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "album-guardar";
    btn.title = `Guardar o desenho de ${f.autor}`;
    const img = document.createElement("img");
    img.src = f.imagem;
    img.alt = f.palavra ? `Desenho de ${f.palavra}, por ${f.autor}` : `Desenho de ${f.autor}`;
    btn.appendChild(img);
    btn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.download = `eu-sei-${(f.palavra || "desenho").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.png`;
      a.href = f.imagem;
      a.click();
    });
    const cap = document.createElement("figcaption");
    cap.textContent = f.acertou
      ? `${f.palavra || "?"} — ${f.autor} desenhou, ${f.acertou} acertou`
      : `${f.palavra || "?"} — ${f.autor} desenhou, ninguém acertou`;
    fig.appendChild(btn);
    fig.appendChild(cap);
    finalEls.albumGrid.appendChild(fig);
    if (i === 0) fig.classList.add("album-primeiro");
  });
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
  tagState.worldEl.style.width = `${room.tag?.arenaW || TAG_ARENA_W}px`;
  tagState.worldEl.style.height = `${room.tag?.arenaH || TAG_ARENA_H}px`;
  // As paredes da arena. São uma constante partilhada (como as do Labirinto),
  // não viajam na sala: desenham-se uma vez ao entrar e ficam.
  TAG_WALLS.forEach((w) => {
    const el = document.createElement("div");
    el.className = "tag-wall";
    el.style.left = `${w.x}px`;
    el.style.top = `${w.y}px`;
    el.style.width = `${w.w}px`;
    el.style.height = `${w.h}px`;
    tagState.worldEl.appendChild(el);
  });
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
  // Cortado: com a letra do tamanho certo no ecrã, um nome comprido passa a
  // ser uma tira maior do que o próprio jogador e tapa quem está ao lado.
  // Oito letras chegam para se saber de quem se está a fugir.
  label.textContent = name.length > 8 ? `${name.slice(0, 8)}…` : name;
  label.title = name;
  el.appendChild(label);
  tagState.worldEl.appendChild(el);
  tagState.playerEls[uid] = el;
  return el;
}

// Cada apanhado com a sua cara: a correr não há tempo para ler nada, e um
// símbolo que não se distingue à primeira é o mesmo que não haver símbolo.
const TAG_ICONES = { shield: "🛡", speed: "⚡", teleporte: "🌀", lentidao: "🐌" };

function tagRenderPowerups(powerups) {
  const seen = new Set();
  Object.entries(powerups || {}).forEach(([id, p]) => {
    seen.add(id);
    let el = tagState.powerupEls[id];
    if (!el) {
      el = document.createElement("div");
      el.className = `tag-powerup tag-powerup-${p.type}`;
      el.textContent = TAG_ICONES[p.type] || "⚡";
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
    // A lentidão trava toda a gente menos quem a apanhou.
    const travado = tagTravadoPor(tag, state.uid, serverNow());
    const maxSpeed = TAG_MAX_SPEED
      * (speedBoosted ? TAG_SPEED_BOOST_MULT : 1)
      * (travado ? 0.45 : 1);
    const speed = Math.hypot(tagState.vx, tagState.vy);
    if (speed > maxSpeed) {
      tagState.vx = (tagState.vx / speed) * maxSpeed;
      tagState.vy = (tagState.vy / speed) * maxSpeed;
    }

    const arenaW = tag.arenaW || TAG_ARENA_W;
    const arenaH = tag.arenaH || TAG_ARENA_H;
    const px = Math.max(TAG_PLAYER_RADIUS, Math.min(arenaW - TAG_PLAYER_RADIUS, tagState.x + tagState.vx * dt));
    const py = Math.max(TAG_PLAYER_RADIUS, Math.min(arenaH - TAG_PLAYER_RADIUS, tagState.y + tagState.vy * dt));
    // As paredes empurram, como no Labirinto — é a mesma função, para as duas
    // arenas não divergirem à primeira correção.
    const livre = tagClampToWalls(px, py, TAG_PLAYER_RADIUS);
    tagState.x = livre.x;
    tagState.y = livre.y;
    // O teletransporte muda a posição na SALA; o ecrã de quem saltou tem de
    // ir buscá-la, senão continuava a andar de onde estava e o salto não se
    // via a quem o apanhou.
    const minha = tag.positions?.[state.uid];
    if (minha?.saltouEm && minha.saltouEm !== tagState.ultimoSalto) {
      tagState.ultimoSalto = minha.saltouEm;
      tagState.x = minha.x;
      tagState.y = minha.y;
      tagState.vx = 0;
      tagState.vy = 0;
    }

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

  // A ARENA INTEIRA NO ECRÃ. Antes a câmara seguia o jogador e via-se um
  // terço do mapa: não se sabia de onde vinha a infeção nem para onde fugir, e
  // a perseguição era às cegas. Agora encolhe-se o mundo até caber, e toda a
  // gente vê toda a gente — que é o que faz uma apanhada valer a pena.
  const viewportW = tagEls.arena.clientWidth;
  const viewportH = tagEls.arena.clientHeight;
  const arenaW = tag.arenaW || TAG_ARENA_W;
  const arenaH = tag.arenaH || TAG_ARENA_H;
  const escala = Math.min(viewportW / arenaW, viewportH / arenaH) || 1;
  const sobraX = (viewportW - arenaW * escala) / 2;
  const sobraY = (viewportH - arenaH * escala) / 2;
  tagState.worldEl.style.transformOrigin = "0 0";
  tagState.worldEl.style.transform = `translate(${sobraX}px, ${sobraY}px) scale(${escala})`;
  // A escala vai para o CSS porque há uma coisa que NÃO pode encolher com o
  // resto: o anel que diz qual dos pontos és tu. O mapa inteiro cabe no ecrã
  // (foi o que se pediu), e num telemóvel isso mete 1200px em 342 — a 0,28,
  // um anel de 3px fica a 0,85px, ou seja, desaparece exatamente onde é mais
  // preciso. Escrito em unidades do mundo a dividir pela escala, mede sempre
  // o mesmo no ecrã, seja qual for o tamanho dele.
  tagState.worldEl.style.setProperty("--escala-arena", escala);

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
  battleState.swingUntil = now + BATTLE_GOLPE_MS;
  // O golpe vai para a sala para os OUTROS o verem. Sem isto, o ataque era um
  // acontecimento privado de quem carregava na tecla.
  registarGolpe(state.code, state.uid);
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
  // Um só relógio por desenho: chamar o da sala por jogador dava tempos
  // diferentes dentro do mesmo quadro de imagem.
  const agoraDaSala = serverNow();
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
    // O GOLPE E O BAQUE. O ataque era invisível: quem batia via um contador
    // interno mexer e mais nada, e quem levava via as vidas a descer sem
    // perceber de onde. Agora vê-se o braço a girar em quem bate e o
    // encolher em quem leva — nos dois ecrãs, porque os dois viajam na sala.
    //
    // O próprio jogador usa o relógio LOCAL: o golpe dele tem de aparecer no
    // instante em que carrega na tecla, não quando a sala responder.
    const golpeEm = isMe
      ? (battleState.swingUntil > performance.now() ? agoraDaSala : 0)
      : (battle.golpes?.[uid] || 0);
    el.classList.toggle("battle-player-golpe", agoraDaSala - golpeEm < BATTLE_GOLPE_MS);
    const baque = battle.baques?.[uid]?.em || 0;
    el.classList.toggle("battle-player-baque", agoraDaSala - baque < BATTLE_BAQUE_MS);
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
    crashRacer(state.code, state.uid, raceState.elapsedMs, state.room);
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
  // O TERRENO desenha-se por baixo de tudo o resto: é chão, não obstáculo.
  // Cada tipo tem de se ler de relance a passar por cima a toda a velocidade
  // — um terreno que só se percebe parando não serve para nada num jogo de
  // velocidade.
  GOLF_MP_AREIAS.forEach((a) => {
    const el = document.createElement("div");
    el.className = "golf-areia";
    el.style.left = `${a.x}px`;
    el.style.top = `${a.y}px`;
    el.style.width = `${a.w}px`;
    el.style.height = `${a.h}px`;
    golfMpState.worldEl.appendChild(el);
  });
  GOLF_MP_ACELERADORES.forEach((a) => {
    const el = document.createElement("div");
    el.className = "golf-acelerador";
    el.style.left = `${a.x}px`;
    el.style.top = `${a.y}px`;
    el.style.width = `${a.w}px`;
    el.style.height = `${a.h}px`;
    // A seta diz para onde empurra. Sem ela, o acelerador é um tapete de cor
    // que atira a bola para um sítio qualquer.
    el.textContent = a.dx > 0 ? "»" : a.dx < 0 ? "«" : a.dy < 0 ? "⌃" : "⌄";
    golfMpState.worldEl.appendChild(el);
  });
  GOLF_MP_SALTITOES.forEach((b) => {
    const el = document.createElement("div");
    el.className = "golf-saltitao";
    el.style.left = `${b.x - b.r}px`;
    el.style.top = `${b.y - b.r}px`;
    el.style.width = `${b.r * 2}px`;
    el.style.height = `${b.r * 2}px`;
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

  // O TERRENO entra ANTES do movimento: os aceleradores empurram, a areia
  // trava, e só depois se anda com a velocidade que ficou.
  const terreno = golfTerreno(golfMpState.x, golfMpState.y, golfMpState.vx, golfMpState.vy, dt);
  golfMpState.vx = terreno.vx;
  golfMpState.vy = terreno.vy;

  let newX = golfMpState.x + golfMpState.vx * dt;
  let newY = golfMpState.y + golfMpState.vy * dt;

  // Os saltitões devolvem a bola com mais do que levou. Vêm depois de andar e
  // antes das paredes: a bola tem de sair de dentro do saltitão no mesmo
  // quadro em que lhe bate, senão fica lá a bater sem parar.
  const salto = golfSaltitao(newX, newY, golfMpState.vx, golfMpState.vy, GOLF_MP_BALL_RADIUS);
  if (salto.bateu) {
    newX = salto.x;
    newY = salto.y;
    golfMpState.vx = salto.vx;
    golfMpState.vy = salto.vy;
    sfx("bump");
  }

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

// ---------- FINAL ----------

const finalEls = {
  ranking: document.getElementById("final-ranking"),
  rematchBtn: document.getElementById("final-rematch-btn"),
  album: document.getElementById("final-album"),
  albumGrid: document.getElementById("final-album-grid"),
};

finalEls.rematchBtn.addEventListener("click", () => {
  // O terceiro do mesmo tipo: o botão é escondido a quem não é anfitrião, mas
  // esconder não protege. Recomeçar a partida apaga a pontuação de todos.
  if (!state.room || !isHost(state.room)) return;
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
  desenharAlbum();
}

// ---------- OPÇÕES (classificação + rabisco coletivo) ----------
// Botão flutuante disponível em qualquer ecrã dentro de uma sala — mostra
// a classificação em tempo real e um quadro de rabisco só por diversão
// (cada jogador na sua cor, sem "vez"/dono — ao contrário do Desenha e
// Adivinha, aqui todos podem escrever ao mesmo tempo, não vale pontos).

// ---------- OPÇÕES DA SALA ----------
//
// O botão de engrenagem aparece em qualquer ecrã dentro de uma sala. Tinha
// dois separadores: a classificação e um "rabisco" — uma folha de desenho por
// diversão dentro do menu de pausa de todos os jogos. O rabisco saiu: quem
// quer desenhar tem o quadro branco, que é um jogo inteiro e melhor em tudo,
// e ali só ocupava o espaço do que se vai mesmo lá fazer.
//
// O que faltava era a SAÍDA. De dentro de um jogo não havia maneira de voltar
// ao lobby: para sair do quadro era preciso deixar a sala e pôr o código
// outra vez, o que na prática desfazia o grupo. Agora está aqui, ao lado da
// classificação, que é onde uma pessoa vai procurar quando quer parar.

const optionsEls = {
  fab: document.getElementById("options-fab"),
  overlay: document.getElementById("options-overlay"),
  panelLeaderboard: document.getElementById("options-panel-leaderboard"),
  leaderboardList: document.getElementById("options-leaderboard-list"),
  backBtn: document.getElementById("options-back-btn"),
  backHint: document.getElementById("options-back-hint"),
  closeBtn: document.getElementById("options-close-btn"),
};

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

// Voltar ao lobby é uma coisa que muda o ecrã DE TODA A GENTE, por isso é de
// quem manda. Aos outros diz-se porquê, em vez de se esconder o botão e os
// deixar à procura dele — foi a falta de qualquer coisa aqui que fez alguém
// sair da sala para conseguir sair do quadro.
function refreshOptionsBack(room) {
  const noLobby = !room || room.state === "lobby";
  const souAnfitriao = isHost(room);
  optionsEls.backBtn.classList.toggle("hidden", noLobby || !souAnfitriao);
  const mostrarAviso = !noLobby && !souAnfitriao;
  optionsEls.backHint.classList.toggle("hidden", !mostrarAviso);
  if (mostrarAviso) {
    const anfitriao = room.players?.[room.hostId]?.name || "quem criou a sala";
    optionsEls.backHint.textContent = `Para voltar ao lobby sem desfazer a sala, pede a ${anfitriao}.`;
  }
}

optionsEls.backBtn.addEventListener("click", async () => {
  const room = state.room;
  if (!room || !isHost(room)) return;
  optionsEls.overlay.classList.add("hidden");
  await backToLobby(state.code, room);
});

optionsEls.fab.addEventListener("click", () => {
  if (!state.room) return;
  renderOptionsLeaderboard(state.room);
  refreshOptionsBack(state.room);
  optionsEls.overlay.classList.remove("hidden");
});
optionsEls.closeBtn.addEventListener("click", () => {
  optionsEls.overlay.classList.add("hidden");
});

// Chamado a cada atualização da sala, para a classificação e o botão de sair
// acompanharem o que está a acontecer enquanto o painel está aberto.
function refreshOptionsIfOpen(room) {
  if (optionsEls.overlay.classList.contains("hidden")) return;
  renderOptionsLeaderboard(room);
  refreshOptionsBack(room);
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
    } else if (room.state === "mapa") {
      // A Dona Manga rouba um país de vez em quando. É a única coisa no mapa
      // que não depende de ninguém escrever nada, e serve para o mapa nunca
      // ficar "arrumado" a meio: um país que já era de alguém volta a estar
      // por conquistar, e quem o souber outra vez fica com ele.
      const ultima = room.mapa?.manga?.quando || room.mapa?.comecouEm || 0;
      if (now - ultima > MAPA_MANGA_CADA_MS) await mapaMangaRouba(state.code, room);
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

  // Voltar sozinho à sala onde se estava. Só acontece se a sala ainda existir
  // E o lugar ainda for desta pessoa — senão fica-se no ecrã inicial, como
  // antes, em vez de aparecer um erro por uma sala que já acabou.
  const anterior = salaLembrada();
  if (anterior) {
    try {
      state.name = anterior.name || state.name;
      if (state.name) els.nameInput.value = state.name;
      const voltou = await rejoinRoom(anterior.code, state.uid, state.name);
      if (voltou) enterRoom(voltou);
      else esquecerSala();
    } catch {
      esquecerSala();
    }
  }
  // Verificação periódica: garante que transições por tempo (fim de ronda,
  // fim de votação, bola sem resposta) acontecem mesmo que ninguém escreva
  // nada na base de dados entretanto.
  setInterval(() => {
    if (state.room) runHostLoopTick(state.room);
  }, 1000);
}

init();
