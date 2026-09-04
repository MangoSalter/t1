// Modo single-player: totalmente offline, sem Firebase. Uma "run" é uma
// sequência de rondas com dificuldade crescente (menos tempo, mais
// categorias) até não atingires o mínimo de respostas válidas na ronda.
// Sem outros jogadores para votar, só se valida se a resposta começa pela
// letra certa (decisão tomada para o MVP: sem lista de palavras).

import { CATEGORIES, pickLetters, pickCategories, MIN_ENABLED_CATEGORIES } from "./data.js";

const HIGH_SCORE_KEY = "euSei_soloHighScore";
const ENABLED_CATEGORIES_KEY = "euSei_soloEnabledCategories";
const BEST_REACTION_KEY = "euSei_soloBestReaction";
const SCORE_HISTORY_KEY = "euSei_soloScoreHistory";
const SCORE_HISTORY_MAX = 20;
const ACCOUNT_KEY = "euSei_soloAccount";
const XP_PER_POINT = 1;

const SOLO_BASE_CATEGORIES = 5;
const SOLO_MAX_CATEGORIES = 12;
const SOLO_BASE_TIME = 75;
const SOLO_MIN_TIME = 30;
const SOLO_EXCLUDE_HARD = true;

const MG_MIN_DELAY_MS = 1000;
const MG_MAX_DELAY_MS = 3000;
const MG_MAX_BONUS = 15;

const WF_TIME_SECONDS = 12;
const WF_POINTS_PER_WORD = 3;
const WF_MAX_BONUS = 30;
const WF_MIN_LENGTH = 3;

const BUG_TARGET_POOL = ["🪲", "🦗", "🐜", "🕷️"];
const BUG_DECOY_POOL = ["🐞", "🦋", "🐝", "🐛", "🐌"];
const BUG_GAME_MS = 9000;
const BUG_SPAWN_INTERVAL_MS = 700;
const BUG_VISIBLE_MS = 900;
const BUG_HIT_POINTS = 3;
const BUG_MISS_PENALTY = 2;
const BUG_MAX_BONUS = 24;
const BUG_MAX_COMBO_BONUS = 4;

const MONKEY_GAME_MS = 10000;
const MONKEY_SPAWN_INTERVAL_MS = 800;
const MONKEY_MIN_SPAWN_INTERVAL_MS = 350;
const MONKEY_SPAWN_SPEEDUP_PER_SEC = 40; // ms a menos de intervalo por segundo decorrido
const MONKEY_GOLDEN_CHANCE = 0.15;
const MONKEY_GOLDEN_MULTIPLIER = 2;
const MONKEY_CATCH_POINTS = 4;
const MONKEY_MAX_BONUS = 28;
const MONKEY_CATCHER_HALF_WIDTH = 24;
const MONKEY_BASE_FALL_SPEED = 60; // px/s
const MONKEY_SPEED_INCREASE_PER_SEC = 4; // px/s a mais por cada segundo decorrido
const MONKEY_LIFESAVER_MS = 5000;
const MONKEY_LIFESAVER_MAX_SAVES = 4;
const MONKEY_LIFESAVER_COOLDOWN_MS = 2200;
const MONKEY_LIFESAVER_MAX_ACTIVE = 2;
const MONKEY_LIFESAVER_HALF_WIDTH = 26;

const MEM_PREVIEW_MS = 3000;
const MEM_SHOWN_BASE = 5;
const MEM_SHOWN_MAX = 8;
const MEM_DECOY_COUNT = 5;
const MEM_POINTS_CORRECT = 4;
const MEM_POINTS_WRONG = 2;

const SOLO_HANGMAN_MAX_WRONG = 6;
const SOLO_HANGMAN_CHALLENGE_MAX_WRONG = 4;
const SOLO_HANGMAN_WORD_PENALTY = 2;
const SOLO_HANGMAN_MIN_BONUS = 6;
const SOLO_HANGMAN_POINTS_PER_LIFE = 3;
const SOLO_HANGMAN_CHALLENGE_MULT = 1.5;
const SOLO_HANGMAN_STREAK_MULT_STEP = 0.1;
const SOLO_HANGMAN_STREAK_MULT_CAP = 10;
const HANGMAN_ENABLED_CATEGORIES_KEY = "euSei_hangmanEnabledCategories";
const HANGMAN_MIN_ENABLED_CATEGORIES = 1;

// Banco de palavras por categoria — usado quando ainda não há (ou não
// queres usar) respostas próprias desta sessão como palavra secreta.
const HANGMAN_WORD_BANK = {
  "Países": ["PORTUGAL", "ANGOLA", "BRASIL", "FRANCA", "ALEMANHA", "JAPAO", "CANADA", "MEXICO"],
  "Animais": ["ELEFANTE", "GIRAFA", "LEAO", "TARTARUGA", "GOLFINHO", "PINGUIM", "CANGURU", "CROCODILO"],
  "Frutas": ["MANGA", "BANANA", "MORANGO", "ANANAS", "MELANCIA", "LARANJA", "ABACAXI"],
  "Desportos": ["FUTEBOL", "BASQUETEBOL", "TENIS", "NATACAO", "CICLISMO", "ATLETISMO", "VOLEIBOL"],
  "Profissões": ["PROFESSOR", "MEDICO", "BOMBEIRO", "COZINHEIRO", "ENGENHEIRO", "ADVOGADO", "PILOTO"],
  "Capitais": ["LISBOA", "LUANDA", "PARIS", "MADRID", "LONDRES", "ROMA", "BRASILIA"],
  "Comida": ["PUDIM", "PIZZA", "FEIJOADA", "GELADO", "CHOCOLATE", "LASANHA", "HAMBURGUER"],
};
const HANGMAN_CATEGORY_NAMES = Object.keys(HANGMAN_WORD_BANK);

function loadHangmanEnabledCategories() {
  try {
    const raw = localStorage.getItem(HANGMAN_ENABLED_CATEGORIES_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? new Set(arr) : null;
  } catch {
    return null;
  }
}

function saveHangmanEnabledCategories(names) {
  try {
    localStorage.setItem(HANGMAN_ENABLED_CATEGORIES_KEY, JSON.stringify(names));
  } catch {
    // sem drama, a seleção só não persiste entre sessões.
  }
}

const MAP_ROUNDS_COUNT = 8;
const MAP_ROUND_MS = 7000;
const MAP_HIT_BASE_POINTS = 4;
const MAP_HIT_SPEED_BONUS_MAX = 4;
const MAP_WRONG_PENALTY = 2;
const MAP_MAX_BONUS = 45;

// Posições aproximadas (% da largura/altura de um mapa-múndi equiretangular
// simplificado) — suficientes para um jogo casual, não para um atlas.
const MAP_COUNTRIES = [
  { name: "Portugal", x: 47.8, y: 28.1, continent: "Europa", english: false, euro: true },
  { name: "Espanha", x: 48.9, y: 27.6, continent: "Europa", english: false, euro: true },
  { name: "França", x: 50.6, y: 24.1, continent: "Europa", english: false, euro: true },
  { name: "Alemanha", x: 52.9, y: 21.6, continent: "Europa", english: false, euro: true },
  { name: "Itália", x: 53.5, y: 26.7, continent: "Europa", english: false, euro: true },
  { name: "Reino Unido", x: 49.6, y: 20.8, continent: "Europa", english: true, euro: false },
  { name: "Irlanda", x: 47.8, y: 20.3, continent: "Europa", english: true, euro: true },
  { name: "Suécia", x: 54.2, y: 15.6, continent: "Europa", english: false, euro: false },
  { name: "Polónia", x: 55.3, y: 21.2, continent: "Europa", english: false, euro: false },
  { name: "Rússia", x: 60.4, y: 19.1, continent: "Europa", english: false, euro: false },
  { name: "Estados Unidos", x: 22.8, y: 28.3, continent: "América do Norte", english: true, euro: false },
  { name: "Canadá", x: 20.6, y: 18.9, continent: "América do Norte", english: true, euro: false },
  { name: "México", x: 21.7, y: 37.2, continent: "América do Norte", english: false, euro: false },
  { name: "Brasil", x: 35.8, y: 55.6, continent: "América do Sul", english: false, euro: false },
  { name: "Argentina", x: 32.2, y: 68.9, continent: "América do Sul", english: false, euro: false },
  { name: "Chile", x: 30.3, y: 66.7, continent: "América do Sul", english: false, euro: false },
  { name: "Colômbia", x: 29.4, y: 47.8, continent: "América do Sul", english: false, euro: false },
  { name: "Peru", x: 28.9, y: 55.6, continent: "América do Sul", english: false, euro: false },
  { name: "Egito", x: 58.6, y: 35.6, continent: "África", english: false, euro: false },
  { name: "Nigéria", x: 52.2, y: 45, continent: "África", english: true, euro: false },
  { name: "África do Sul", x: 56.7, y: 66.1, continent: "África", english: true, euro: false },
  { name: "Quénia", x: 60.6, y: 50, continent: "África", english: true, euro: false },
  { name: "Marrocos", x: 48.1, y: 32.2, continent: "África", english: false, euro: false },
  { name: "Angola", x: 55, y: 56.7, continent: "África", english: false, euro: false },
  { name: "China", x: 78.9, y: 30.6, continent: "Ásia", english: false, euro: false },
  { name: "Japão", x: 88.3, y: 30, continent: "Ásia", english: false, euro: false },
  { name: "Índia", x: 71.7, y: 38.3, continent: "Ásia", english: true, euro: false },
  { name: "Austrália", x: 87.2, y: 63.9, continent: "Oceânia", english: true, euro: false },
  { name: "Nova Zelândia", x: 98.3, y: 72.8, continent: "Oceânia", english: true, euro: false },
  { name: "Indonésia", x: 81.4, y: 51.1, continent: "Ásia", english: false, euro: false },
  { name: "Coreia do Sul", x: 85.3, y: 30, continent: "Ásia", english: false, euro: false },
  { name: "Arábia Saudita", x: 62.5, y: 36.7, continent: "Ásia", english: false, euro: false },
];

const MAP_BACKGROUND_SVG = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 14,14 C 10,20 8,30 14,36 C 12,40 18,42 22,38 C 26,42 32,40 30,34 C 36,32 38,24 32,18 C 34,12 26,8 20,12 C 18,8 14,10 14,14 Z" class="map-blob" />
  <path d="M 28,46 C 24,52 22,60 26,66 C 24,70 28,74 32,70 C 36,74 40,68 36,62 C 40,56 38,48 32,46 C 30,44 28,44 28,46 Z" class="map-blob" />
  <path d="M 46,14 C 44,18 44,24 48,26 C 46,30 50,32 54,28 C 58,30 62,26 58,22 C 60,18 56,14 52,16 C 50,12 46,12 46,14 Z" class="map-blob" />
  <path d="M 48,34 C 44,40 44,50 48,56 C 46,62 50,68 56,66 C 60,70 64,64 60,58 C 64,52 62,44 56,40 C 58,36 52,32 48,34 Z" class="map-blob" />
  <path d="M 62,14 C 58,20 60,28 66,26 C 64,32 68,38 74,34 C 78,40 86,38 84,30 C 90,32 94,26 88,20 C 92,14 84,10 78,14 C 74,10 66,10 62,14 Z" class="map-blob" />
  <path d="M 82,60 C 80,64 82,70 88,70 C 90,74 96,72 94,66 C 96,62 90,58 86,60 C 84,58 82,58 82,60 Z" class="map-blob" />
  <path d="M 96,70 C 95,72 96,75 98,74 C 99,76 100,74 99,72 Z" class="map-blob" />
</svg>`;

function pickMapCriteria() {
  const types = ["country", "language", "continent", "currency"];
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === "country") {
    const country = MAP_COUNTRIES[Math.floor(Math.random() * MAP_COUNTRIES.length)];
    return { type, matchSet: new Set([country.name]), promptText: `Onde fica ${country.name}?` };
  }
  if (type === "language") {
    const matchSet = new Set(MAP_COUNTRIES.filter((c) => c.english).map((c) => c.name));
    return { type, matchSet, promptText: "Clica num país onde a maioria fala inglês." };
  }
  if (type === "currency") {
    const matchSet = new Set(MAP_COUNTRIES.filter((c) => c.euro).map((c) => c.name));
    return { type, matchSet, promptText: "Clica num país que usa o Euro." };
  }
  const continents = [...new Set(MAP_COUNTRIES.map((c) => c.continent))];
  const continent = continents[Math.floor(Math.random() * continents.length)];
  const matchSet = new Set(MAP_COUNTRIES.filter((c) => c.continent === continent).map((c) => c.name));
  return { type, matchSet, promptText: `Clica num país da ${continent}.` };
}

function startHangmanSingle() {
  solo.hangmanStreakMode = false;
  startSoloHangman();
}

const MARATHON_GAMES = {
  reflex: startReflexMinigame,
  word: startWordFlashMinigame,
  bug: startBugSmashMinigame,
  monkey: startMonkeyRescueMinigame,
  memory: startMemoryMinigame,
  hangman: startHangmanSingle,
  map: startMapMinigame,
};

function memShownCountForRound(round) {
  return Math.min(MEM_SHOWN_BASE + Math.floor((round - 1) / 3), MEM_SHOWN_MAX);
}

function shuffleArray(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function difficultyForRound(round) {
  const numCategories = Math.min(
    SOLO_BASE_CATEGORIES + Math.floor((round - 1) / 2),
    SOLO_MAX_CATEGORIES
  );
  const timeLimit = Math.max(SOLO_BASE_TIME - (round - 1) * 5, SOLO_MIN_TIME);
  return { numCategories, timeLimit };
}

function loadHighScore() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveHighScore(score, rounds) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify({ score, rounds }));
  } catch {
    // localStorage indisponível (modo privado, etc.) — sem recorde persistente, sem drama.
  }
}

function loadEnabledCategories() {
  try {
    const raw = localStorage.getItem(ENABLED_CATEGORIES_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? new Set(arr) : null;
  } catch {
    return null;
  }
}

function saveEnabledCategories(indexes) {
  try {
    localStorage.setItem(ENABLED_CATEGORIES_KEY, JSON.stringify(indexes));
  } catch {
    // sem persistência entre sessões, sem drama — a sessão atual continua a funcionar.
  }
}

function loadBestReaction() {
  try {
    const raw = localStorage.getItem(BEST_REACTION_KEY);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

function saveBestReaction(ms) {
  try {
    localStorage.setItem(BEST_REACTION_KEY, String(ms));
  } catch {
    // sem drama, só perde o recorde entre sessões.
  }
}

function loadScoreHistory() {
  try {
    const raw = localStorage.getItem(SCORE_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Guarda cada run terminada (clássico ou maratona) numa tabela local dos
// 20 melhores, ordenada por pontuação — dá algo para tentar bater sozinho.
function addScoreHistoryEntry(entry) {
  try {
    const history = loadScoreHistory();
    history.push(entry);
    history.sort((a, b) => b.score - a.score);
    const trimmed = history.slice(0, SCORE_HISTORY_MAX);
    localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // sem drama, a run já foi jogada — só não fica guardada.
  }
}

// --- Conta local (XP): fica guardada no browser, soma-se em todos os
// jogos e mini-jogos. Sem login/servidor — é "a tua conta neste browser",
// pensada para no futuro dar para trocar por cosmética. ---

function loadAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    const acc = raw ? JSON.parse(raw) : {};
    return { xp: acc.xp || 0, gamesPlayed: acc.gamesPlayed || 0, bestCombo: acc.bestCombo || 0 };
  } catch {
    return { xp: 0, gamesPlayed: 0, bestCombo: 0 };
  }
}

function saveAccount() {
  try {
    localStorage.setItem(
      ACCOUNT_KEY,
      JSON.stringify({ xp: account.xp, gamesPlayed: account.gamesPlayed, bestCombo: account.bestCombo })
    );
  } catch {
    // sem drama, a conta só não persiste entre sessões.
  }
}

const account = loadAccount();
account.sessionXp = 0;
account.sessionGamesPlayed = 0;
account.sessionPoints = 0;

// Chamado no fim de cada mini-jogo/run — soma XP à conta e às estatísticas
// desta sessão. gainedPoints pode ser 0 (ex.: perdeste a Forca).
function addXP(gainedPoints, favoriteKey) {
  const gained = Math.max(0, Math.round(gainedPoints * XP_PER_POINT));
  account.xp += gained;
  account.gamesPlayed += 1;
  account.sessionXp += gained;
  account.sessionGamesPlayed += 1;
  account.sessionPoints += Math.max(0, gainedPoints);
  if (favoriteKey) {
    account.favorites = account.favorites || {};
    account.favorites[favoriteKey] = (account.favorites[favoriteKey] || 0) + 1;
  }
  saveAccount();
  return gained;
}

const solo = {
  round: 0,
  runScore: 0,
  usedLetters: new Set(),
  usedCategories: new Set(),
  letter: "",
  categoryIndexes: [],
  answers: {},
  endAt: 0,
  inRound: false,
  mgAppearAt: 0,
  mgResolved: false,
  wfLetter: "",
  wfWords: new Set(),
  wfPoints: 0,
  wfEndAt: 0,
  wfActive: false,
  bugTarget: "",
  bugActive: false,
  bugScore: 0,
  bugCombo: 0,
  bugSpawnIntervalId: null,
  monkeyActive: false,
  monkeyScore: 0,
  monkeyCatcherX: 0,
  monkeys: [],
  monkeySpawnTimeoutId: null,
  monkeyMoveHandler: null,
  monkeyClickHandler: null,
  monkeyLifesavers: [],
  monkeyLastLifesaverAt: 0,
  memActive: false,
  memShownIndexes: new Set(),
  memSelected: new Set(),
  afterMinigame: nextRound,
  pastValidAnswers: [],
  hangmanWord: "",
  hangmanCategoryName: "",
  hangmanGuessedLetters: {},
  hangmanWrongCount: 0,
  hangmanMaxWrong: SOLO_HANGMAN_MAX_WRONG,
  hangmanActive: false,
  hangmanStreakMode: false,
  hangmanStreak: 0,
  hangmanChallengeMode: false,
  hangmanIncludeOwnAnswers: true,
  hangmanUsedWords: new Set(),
  marathonQueue: [],
  marathonTotalGames: 0,
  mapActive: false,
  mapRoundIndex: 0,
  mapScore: 0,
  mapCriteria: null,
  mapRoundStartAt: 0,
  mapRoundEndAt: 0,
  mapMarkerEls: {},
  bugEndAt: 0,
  monkeyStartedAt: 0,
  monkeyEndAt: 0,
  monkeyLastFrame: 0,
  paused: false,
  pauseStartedAt: 0,
  activePauseShift: null,
  activeSkip: null,
  activeCleanup: null,
  hudScoreGetter: null,
};

const els = {
  menuBtn: document.getElementById("solo-menu-btn"),
  classicBtn: document.getElementById("solo-classic-btn"),
  setupStartBtn: document.getElementById("solo-setup-start-btn"),
  marathonMenuBtn: document.getElementById("solo-marathon-menu-btn"),
  marathonStartBtn: document.getElementById("solo-marathon-start-btn"),
  marathonRestartBtn: document.getElementById("marathon-restart-btn"),
  marathonSummary: document.getElementById("marathon-result-summary"),
  leaderboardBtn: document.getElementById("solo-leaderboard-btn"),
  leaderboardList: document.getElementById("solo-leaderboard-list"),
  playReflexBtn: document.getElementById("solo-play-reflex-btn"),
  playWordflashBtn: document.getElementById("solo-play-wordflash-btn"),
  playBugBtn: document.getElementById("solo-play-bug-btn"),
  playMonkeyBtn: document.getElementById("solo-play-monkey-btn"),
  playMemoryBtn: document.getElementById("solo-play-memory-btn"),
  playHangmanBtn: document.getElementById("solo-play-hangman-btn"),
  hangmanSetupStartBtn: document.getElementById("hangman-solo-setup-start-btn"),
  hangmanCatGrid: document.getElementById("hangman-cat-grid"),
  hangmanCatCount: document.getElementById("hangman-cat-count"),
  hangmanCatSelectAll: document.getElementById("hangman-cat-selectall"),
  hangmanCatClear: document.getElementById("hangman-cat-clear"),
  hangmanIncludeOwnCb: document.getElementById("hangman-include-own"),
  hangmanChallengeModeCb: document.getElementById("hangman-challenge-mode"),
  hangmanStreakInfo: document.getElementById("solo-hangman-streak-info"),
  playMapBtn: document.getElementById("solo-play-map-btn"),
  mapArena: document.getElementById("map-arena"),
  mapPrompt: document.getElementById("map-prompt"),
  mapRoundInfo: document.getElementById("map-round-info"),
  mapTimer: document.getElementById("map-timer"),
  mapStatus: document.getElementById("map-status"),
  soloHangmanCategory: document.getElementById("solo-hangman-category"),
  soloHangmanWordDisplay: document.getElementById("solo-hangman-word-display"),
  soloHangmanWrongLetters: document.getElementById("solo-hangman-wrong-letters"),
  soloHangmanLives: document.getElementById("solo-hangman-lives"),
  soloHangmanGuessControls: document.getElementById("solo-hangman-guess-controls"),
  soloHangmanLetterInput: document.getElementById("solo-hangman-letter-input"),
  soloHangmanGuessLetterBtn: document.getElementById("solo-hangman-guess-letter-btn"),
  soloHangmanWordGuessInput: document.getElementById("solo-hangman-word-guess-input"),
  soloHangmanGuessWordBtn: document.getElementById("solo-hangman-guess-word-btn"),
  soloHangmanStatus: document.getElementById("solo-hangman-status"),
  letterInfo: document.getElementById("solo-letter-info"),
  letterButtons: document.getElementById("solo-letter-buttons"),
  catLetter: document.getElementById("solo-cat-letter"),
  catTimer: document.getElementById("solo-cat-timer"),
  roundInfo: document.getElementById("solo-round-info"),
  catList: document.getElementById("solo-cat-list"),
  finishBtn: document.getElementById("solo-finish-btn"),
  resultTitle: document.getElementById("solo-result-title"),
  resultSummary: document.getElementById("solo-result-summary"),
  resultTable: document.getElementById("solo-result-table"),
  continueBtn: document.getElementById("solo-continue-btn"),
  restartBtn: document.getElementById("solo-restart-btn"),
  mgStatus: document.getElementById("solo-mg-status"),
  mgCircle: document.getElementById("solo-mg-circle"),
  wfLetter: document.getElementById("wf-letter"),
  wfTimer: document.getElementById("wf-timer"),
  wfInput: document.getElementById("wf-input"),
  wfFeedback: document.getElementById("wf-feedback"),
  wfWords: document.getElementById("wf-words"),
  wfStatus: document.getElementById("wf-status"),
  bugTargetLabel: document.getElementById("bug-target-label"),
  bugTimer: document.getElementById("bug-timer"),
  bugArena: document.getElementById("bug-arena"),
  bugStatus: document.getElementById("bug-status"),
  monkeyTimer: document.getElementById("monkey-timer"),
  monkeyArena: document.getElementById("monkey-arena"),
  monkeyCatcher: document.getElementById("monkey-catcher"),
  monkeyStatus: document.getElementById("monkey-status"),
  memInstructions: document.getElementById("mem-instructions"),
  memGrid: document.getElementById("mem-grid"),
  memConfirmBtn: document.getElementById("mem-confirm-btn"),
  memStatus: document.getElementById("mem-status"),
  catCount: document.getElementById("solo-cat-count"),
  catGrid: document.getElementById("solo-cat-grid"),
  catSelectAll: document.getElementById("solo-cat-selectall"),
  catClear: document.getElementById("solo-cat-clear"),
  mgeOverlay: document.getElementById("minigame-end-overlay"),
  mgeTitle: document.getElementById("mge-title"),
  mgeQuip: document.getElementById("mge-quip"),
  mgePoints: document.getElementById("mge-points"),
  mgeXp: document.getElementById("mge-xp"),
  mgeContinueBtn: document.getElementById("mge-continue-btn"),
  mgeExitBtn: document.getElementById("mge-exit-btn"),
  gameHud: document.getElementById("game-hud"),
  gameHudScoreValue: document.getElementById("game-hud-score-value"),
  gameHudPauseBtn: document.getElementById("game-hud-pause-btn"),
  gameHudSkipBtn: document.getElementById("game-hud-skip-btn"),
  pauseOverlay: document.getElementById("pause-overlay"),
  pauseResumeBtn: document.getElementById("pause-resume-btn"),
  pauseExitBtn: document.getElementById("pause-exit-btn"),
  accountXpLabel: document.getElementById("solo-account-xp"),
};

const catCheckboxes = CATEGORIES.map((name, i) => {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = true;
  label.appendChild(input);
  label.appendChild(document.createTextNode(name));
  els.catGrid.appendChild(label);
  return input;
});

function refreshCategoryCount() {
  const count = catCheckboxes.filter((cb) => cb.checked).length;
  els.catCount.textContent = String(count);
}

function currentEnabledCategoryIndexes() {
  return catCheckboxes.map((cb, i) => (cb.checked ? i : -1)).filter((i) => i !== -1);
}

(function initCategoryPicker() {
  const saved = loadEnabledCategories();
  if (saved) {
    catCheckboxes.forEach((cb, i) => { cb.checked = saved.has(i); });
  }
  refreshCategoryCount();
})();

catCheckboxes.forEach((cb) => {
  cb.addEventListener("change", () => {
    if (!cb.checked && currentEnabledCategoryIndexes().length < MIN_ENABLED_CATEGORIES) {
      cb.checked = true;
      return;
    }
    refreshCategoryCount();
    saveEnabledCategories(currentEnabledCategoryIndexes());
  });
});

els.catSelectAll.addEventListener("click", () => {
  catCheckboxes.forEach((cb) => { cb.checked = true; });
  refreshCategoryCount();
  saveEnabledCategories(currentEnabledCategoryIndexes());
});

els.catClear.addEventListener("click", () => {
  catCheckboxes.forEach((cb, i) => { cb.checked = i < MIN_ENABLED_CATEGORIES; });
  refreshCategoryCount();
  saveEnabledCategories(currentEnabledCategoryIndexes());
});

const hangmanCatCheckboxes = HANGMAN_CATEGORY_NAMES.map((name) => {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = true;
  input.dataset.hangmanCat = name;
  label.appendChild(input);
  label.appendChild(document.createTextNode(name));
  els.hangmanCatGrid.appendChild(label);
  return input;
});

function refreshHangmanCategoryCount() {
  els.hangmanCatCount.textContent = String(hangmanCatCheckboxes.filter((cb) => cb.checked).length);
}

function currentHangmanEnabledCategoryNames() {
  return hangmanCatCheckboxes.filter((cb) => cb.checked).map((cb) => cb.dataset.hangmanCat);
}

(function initHangmanCategoryPicker() {
  const saved = loadHangmanEnabledCategories();
  if (saved) {
    hangmanCatCheckboxes.forEach((cb) => { cb.checked = saved.has(cb.dataset.hangmanCat); });
  }
  refreshHangmanCategoryCount();
})();

hangmanCatCheckboxes.forEach((cb) => {
  cb.addEventListener("change", () => {
    if (!cb.checked && currentHangmanEnabledCategoryNames().length < HANGMAN_MIN_ENABLED_CATEGORIES) {
      cb.checked = true;
      return;
    }
    refreshHangmanCategoryCount();
    saveHangmanEnabledCategories(currentHangmanEnabledCategoryNames());
  });
});

els.hangmanCatSelectAll.addEventListener("click", () => {
  hangmanCatCheckboxes.forEach((cb) => { cb.checked = true; });
  refreshHangmanCategoryCount();
  saveHangmanEnabledCategories(currentHangmanEnabledCategoryNames());
});

els.hangmanCatClear.addEventListener("click", () => {
  hangmanCatCheckboxes.forEach((cb, i) => { cb.checked = i === 0; });
  refreshHangmanCategoryCount();
  saveHangmanEnabledCategories(currentHangmanEnabledCategoryNames());
});

function showScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === name);
  });
}

function formatSeconds(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

// --- Falas da Dona Manga / Brasa entre mini-jogos da maratona — servem só
// para dar sabor ao ecrã onde o jogador controla o ritmo entre jogos. ---
const MASCOT_QUIPS = [
  { who: "Dona Manga", text: "Miau. Continua a competir — quero ver quem é fraco o suficiente para eu roubar as respostas depois." },
  { who: "Brasa", text: "Psst... não contes à Dona Manga, mas estás a ir bem! (Já disse demais outra vez, não foi?)" },
  { who: "Dona Manga", text: "Outro mini-jogo. Não me dececiones, humano." },
  { who: "Brasa", text: "Tentei fugir dela ontem. Cheguei à porta e lembrei-me que ela tem as chaves da comida. Voltei." },
  { who: "Dona Manga", text: "Continua. Estou a tirar uma soneca com um olho aberto." },
  { who: "Brasa", text: "Dica secreta: ela finge que dorme mas está sempre a contar os teus pontos." },
];
function randomMascotQuip() {
  return MASCOT_QUIPS[Math.floor(Math.random() * MASCOT_QUIPS.length)];
}

function updateAccountXpLabel() {
  if (els.accountXpLabel) {
    els.accountXpLabel.textContent =
      `⭐ ${account.xp} XP — ${account.gamesPlayed} jogos jogados (${account.sessionGamesPlayed} nesta sessão, +${account.sessionXp} XP)`;
  }
}
updateAccountXpLabel();

// --- Ecrã partilhado de fim de mini-jogo: mostra pontos + XP e deixa o
// jogador escolher continuar ou sair, em vez de desaparecer sozinho. ---
function showMinigameEnd({ gameLabel, points, favoriteKey, resultText }) {
  clearActiveGame();
  hideGameHud();
  const gained = addXP(points, favoriteKey);
  updateAccountXpLabel();
  els.mgeTitle.textContent = `${gameLabel} — fim!`;
  els.mgePoints.textContent = resultText || `+${points} pts bónus.`;
  els.mgeXp.textContent = `+${gained} XP — conta: ${account.xp} XP (${account.gamesPlayed} jogos)`;
  if (solo.marathonQueue.length > 0) {
    const quip = randomMascotQuip();
    els.mgeQuip.textContent = `${quip.who}: "${quip.text}"`;
    els.mgeQuip.classList.remove("hidden");
  } else {
    els.mgeQuip.classList.add("hidden");
  }
  els.mgeOverlay.classList.remove("hidden");
}

els.mgeContinueBtn.addEventListener("click", () => {
  els.mgeOverlay.classList.add("hidden");
  solo.afterMinigame();
});
els.mgeExitBtn.addEventListener("click", () => {
  els.mgeOverlay.classList.add("hidden");
  solo.marathonQueue = [];
  solo.inRound = false;
  solo.hangmanActive = false;
  solo.hangmanStreakMode = false;
  returnToSoloMenu();
});

// --- HUD do jogo: pontuação em tempo real + pausar/saltar, partilhado por
// todos os mini-jogos a full-screen. ---
function showGameHud(scoreGetter) {
  solo.hudScoreGetter = scoreGetter;
  els.gameHud.classList.remove("hidden");
  updateGameHudScore();
}
function hideGameHud() {
  els.gameHud.classList.add("hidden");
  solo.hudScoreGetter = null;
}
function updateGameHudScore() {
  if (!solo.hudScoreGetter) return;
  els.gameHudScoreValue.textContent = String(solo.hudScoreGetter());
}

function registerActiveGame({ pauseShift, skip, cleanup }) {
  solo.activePauseShift = pauseShift || null;
  solo.activeSkip = skip || null;
  solo.activeCleanup = cleanup || null;
}
function clearActiveGame() {
  solo.activePauseShift = null;
  solo.activeSkip = null;
  solo.activeCleanup = null;
}

function pauseGame() {
  if (solo.paused || els.gameHud.classList.contains("hidden")) return;
  solo.paused = true;
  solo.pauseStartedAt = Date.now();
  els.pauseOverlay.classList.remove("hidden");
}
function resumeGame() {
  if (!solo.paused) return;
  const pausedMs = Date.now() - solo.pauseStartedAt;
  solo.paused = false;
  els.pauseOverlay.classList.add("hidden");
  if (solo.activePauseShift) solo.activePauseShift(pausedMs);
}
function skipCurrentGame() {
  if (solo.paused) { els.pauseOverlay.classList.add("hidden"); solo.paused = false; }
  if (solo.activeSkip) solo.activeSkip();
}
function exitGameToMenu() {
  solo.paused = false;
  els.pauseOverlay.classList.add("hidden");
  if (solo.activeCleanup) solo.activeCleanup();
  clearActiveGame();
  hideGameHud();
  solo.marathonQueue = [];
  solo.inRound = false;
  solo.hangmanActive = false;
  solo.hangmanStreakMode = false;
  returnToSoloMenu();
}

els.gameHudPauseBtn.addEventListener("click", pauseGame);
els.gameHudSkipBtn.addEventListener("click", skipCurrentGame);
els.pauseResumeBtn.addEventListener("click", resumeGame);
els.pauseExitBtn.addEventListener("click", exitGameToMenu);

els.menuBtn.addEventListener("click", () => showScreen("solo-menu"));
document.querySelectorAll("[data-solo-home]").forEach((btn) => {
  btn.addEventListener("click", () => showScreen("home"));
});
document.querySelectorAll("[data-solo-leave]").forEach((btn) => {
  btn.addEventListener("click", () => {
    solo.inRound = false;
    exitGameToMenu();
  });
});

els.classicBtn.addEventListener("click", () => showScreen("solo-setup"));
els.setupStartBtn.addEventListener("click", () => {
  solo.afterMinigame = nextRound;
  startRun();
});

function launchStandalone(startFn) {
  solo.afterMinigame = returnToSoloMenu;
  solo.runScore = 0;
  solo.round = Math.max(solo.round, 1);
  startFn();
}
function returnToSoloMenu() { showScreen("solo-menu"); }

els.playReflexBtn.addEventListener("click", () => launchStandalone(startReflexMinigame));
els.playWordflashBtn.addEventListener("click", () => launchStandalone(startWordFlashMinigame));
els.playBugBtn.addEventListener("click", () => launchStandalone(startBugSmashMinigame));
els.playMonkeyBtn.addEventListener("click", () => launchStandalone(startMonkeyRescueMinigame));
els.playMemoryBtn.addEventListener("click", () => launchStandalone(startMemoryMinigame));
els.playHangmanBtn.addEventListener("click", () => showScreen("solo-hangman-setup"));
els.hangmanSetupStartBtn.addEventListener("click", () => {
  saveHangmanEnabledCategories(currentHangmanEnabledCategoryNames());
  solo.hangmanIncludeOwnAnswers = els.hangmanIncludeOwnCb.checked;
  solo.hangmanChallengeMode = els.hangmanChallengeModeCb.checked;
  launchStandalone(() => {
    solo.hangmanStreakMode = true;
    solo.hangmanStreak = 0;
    solo.hangmanUsedWords = new Set();
    startSoloHangman();
  });
});
els.playMapBtn.addEventListener("click", () => launchStandalone(startMapMinigame));

els.marathonMenuBtn.addEventListener("click", () => showScreen("solo-marathon-setup"));
els.marathonStartBtn.addEventListener("click", startMarathon);
els.marathonRestartBtn.addEventListener("click", () => showScreen("solo-marathon-setup"));
els.leaderboardBtn.addEventListener("click", () => {
  renderLeaderboard();
  showScreen("solo-leaderboard");
});

els.finishBtn.addEventListener("click", finishRound);
els.continueBtn.addEventListener("click", startMinigame);
els.restartBtn.addEventListener("click", startRun);
els.mgCircle.addEventListener("click", () => {
  if (solo.mgResolved) return;
  resolveMinigame(Date.now());
});
els.wfInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitWfWord();
});
els.memConfirmBtn.addEventListener("click", finishMemory);
els.soloHangmanGuessLetterBtn.addEventListener("click", () => {
  const letter = els.soloHangmanLetterInput.value.trim();
  els.soloHangmanLetterInput.value = "";
  if (letter) soloHangmanGuessLetter(letter);
});
els.soloHangmanGuessWordBtn.addEventListener("click", () => {
  const guess = els.soloHangmanWordGuessInput.value.trim();
  els.soloHangmanWordGuessInput.value = "";
  if (guess) soloHangmanGuessWord(guess);
});

function startRun() {
  solo.round = 0;
  solo.runScore = 0;
  solo.usedLetters = new Set();
  solo.usedCategories = new Set();
  nextRound();
}

function nextRound() {
  solo.round += 1;
  const candidates = pickLetters(3, solo.usedLetters, SOLO_EXCLUDE_HARD);
  solo.pendingCandidates = candidates;
  renderLetterPick();
  showScreen("solo-letterpick");
}

function renderLetterPick() {
  els.letterInfo.textContent = `Ronda ${solo.round} — pontuação atual: ${solo.runScore} pts`;
  els.letterButtons.innerHTML = "";
  solo.pendingCandidates.forEach((letter) => {
    const btn = document.createElement("button");
    btn.className = "letter-btn";
    btn.innerHTML = `<span class="letter-big">${letter}</span>`;
    btn.addEventListener("click", () => pickLetter(letter));
    els.letterButtons.appendChild(btn);
  });
}

function pickLetter(letter) {
  solo.letter = letter;
  solo.usedLetters.add(letter);
  const { numCategories, timeLimit } = difficultyForRound(solo.round);
  const enabledCats = new Set(currentEnabledCategoryIndexes());
  const catIndexes = pickCategories(numCategories, solo.usedCategories, enabledCats);
  catIndexes.forEach((i) => solo.usedCategories.add(i));
  solo.categoryIndexes = catIndexes;
  solo.answers = {};
  solo.endAt = Date.now() + timeLimit * 1000;
  solo.inRound = true;
  renderRound();
  showScreen("solo-round");
}

function minCorrectNeeded(numCategories) {
  return Math.ceil(numCategories / 2);
}

function renderRound() {
  els.catLetter.textContent = solo.letter;
  const needed = minCorrectNeeded(solo.categoryIndexes.length);
  els.roundInfo.textContent = `Precisas de pelo menos ${needed} de ${solo.categoryIndexes.length} respostas válidas para continuar a run.`;
  els.catList.innerHTML = "";
  solo.categoryIndexes.forEach((ci) => {
    const wrapper = document.createElement("label");
    wrapper.className = "cat-item";
    const title = document.createElement("span");
    title.textContent = CATEGORIES[ci];
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.value = solo.answers[ci] || "";
    input.addEventListener("input", () => {
      solo.answers[ci] = input.value;
    });
    wrapper.appendChild(title);
    wrapper.appendChild(input);
    els.catList.appendChild(wrapper);
  });

  function tick() {
    if (!solo.inRound) return;
    const msLeft = solo.endAt - Date.now();
    els.catTimer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    if (msLeft <= 0) {
      finishRound();
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function finishRound() {
  if (!solo.inRound) return;
  solo.inRound = false;

  const letter = solo.letter.toUpperCase();
  let correctCount = 0;
  const rows = solo.categoryIndexes.map((ci) => {
    const text = (solo.answers[ci] || "").trim();
    const valid = text.length > 0 && text[0].toUpperCase() === letter;
    if (valid) {
      correctCount += 1;
      // Guardado para a Forca conseguir mais tarde perguntar-te de volta as
      // tuas próprias respostas desta sessão.
      solo.pastValidAnswers.push({ categoryName: CATEGORIES[ci], word: text.toUpperCase() });
    }
    return { ci, text, valid };
  });

  const needed = minCorrectNeeded(solo.categoryIndexes.length);
  const passed = correctCount >= needed;
  const roundScore = correctCount * 10;
  solo.runScore += roundScore;

  renderResult(rows, correctCount, needed, passed, roundScore);
  showScreen("solo-result");
}

function renderResult(rows, correctCount, needed, passed, roundScore) {
  els.resultTable.innerHTML = "";
  rows.forEach(({ ci, text, valid }) => {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `<span class="score-name">${CATEGORIES[ci]}</span>
      <span class="score-round">${text ? text : "(sem resposta)"}</span>
      <span class="score-total">${valid ? "✓ 10 pts" : "✕ 0 pts"}</span>`;
    els.resultTable.appendChild(row);
  });

  if (passed) {
    els.resultTitle.textContent = `Passaste! ${correctCount}/${rows.length} corretas`;
    els.resultSummary.textContent = `+${roundScore} pts nesta ronda — pontuação da run: ${solo.runScore} pts.`;
    els.continueBtn.classList.remove("hidden");
    els.restartBtn.classList.add("hidden");
  } else {
    const best = loadHighScore();
    const isNewBest = !best || solo.runScore > best.score;
    if (isNewBest) saveHighScore(solo.runScore, solo.round);
    addScoreHistoryEntry({ score: solo.runScore, mode: "Clássico", detail: `${solo.round} ronda(s)`, date: Date.now() });

    els.resultTitle.textContent = `Fim da run — ${correctCount}/${rows.length} corretas (precisavas de ${needed})`;
    let summary = `Pontuação final: ${solo.runScore} pts, em ${solo.round} ronda(s).`;
    summary += isNewBest
      ? " Novo recorde! 🎉"
      : ` Recorde atual: ${best.score} pts (ronda ${best.rounds}).`;
    els.resultSummary.textContent = summary;
    els.continueBtn.classList.add("hidden");
    els.restartBtn.classList.remove("hidden");
  }
}

// --- Mini-jogos bónus entre rondas: escolhido ao acaso a cada ronda, para
// dar variedade em vez de repetir sempre o mesmo. ---

const MINIGAMES = [
  startReflexMinigame, startWordFlashMinigame, startBugSmashMinigame,
  startMonkeyRescueMinigame, startMemoryMinigame,
];

function startMinigame() {
  const chosen = MINIGAMES[Math.floor(Math.random() * MINIGAMES.length)];
  chosen();
}

// --- Reflexos: clica na bola assim que fica vermelha (reaproveita a
// mecânica da bola do multiplayer). ---

function startReflexMinigame() {
  solo.mgResolved = false;
  solo.mgAppearAt = Date.now() + MG_MIN_DELAY_MS + Math.random() * (MG_MAX_DELAY_MS - MG_MIN_DELAY_MS);
  els.mgCircle.classList.remove("visible");
  els.mgStatus.textContent = "Prepara-te...";
  showScreen("solo-minigame");
  showGameHud(() => 0);
  registerActiveGame({
    pauseShift: (ms) => { solo.mgAppearAt += ms; },
    skip: () => resolveMinigame(Math.max(Date.now(), solo.mgAppearAt + 2000)),
    cleanup: () => { solo.mgResolved = true; },
  });

  function tick() {
    if (solo.mgResolved) return;
    if (solo.paused) { requestAnimationFrame(tick); return; }
    if (Date.now() >= solo.mgAppearAt) {
      els.mgCircle.classList.add("visible");
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function resolveMinigame(clickedAt) {
  if (solo.mgResolved) return;
  solo.mgResolved = true;
  els.mgCircle.classList.add("visible");

  let bonus = 0;
  let resultText;
  if (clickedAt < solo.mgAppearAt) {
    resultText = "Cedo demais! +0 pts bónus.";
  } else {
    const reactionMs = clickedAt - solo.mgAppearAt;
    bonus = Math.max(0, Math.round(MG_MAX_BONUS - reactionMs / 100));
    const best = loadBestReaction();
    if (best === null || reactionMs < best) {
      saveBestReaction(reactionMs);
      resultText = `Reagiste em ${reactionMs}ms — +${bonus} pts bónus! Novo recorde pessoal! ⚡`;
    } else {
      resultText = `Reagiste em ${reactionMs}ms — +${bonus} pts bónus! (recorde: ${best}ms)`;
    }
  }
  solo.runScore += bonus;
  showMinigameEnd({ gameLabel: "Reflexos", points: bonus, favoriteKey: "reflex", resultText });
}

// --- Palavra Relâmpago: escreve o máximo de palavras possível numa letra
// aleatória, contra o tempo. ---

function startWordFlashMinigame() {
  solo.wfLetter = pickLetters(1, new Set(), true)[0];
  solo.wfWords = new Set();
  solo.wfPoints = 0;
  solo.wfEndAt = Date.now() + WF_TIME_SECONDS * 1000;
  solo.wfActive = true;

  els.wfLetter.textContent = solo.wfLetter;
  els.wfInput.value = "";
  els.wfFeedback.textContent = "";
  els.wfWords.innerHTML = "";
  els.wfStatus.textContent = "";
  showScreen("solo-minigame-word");
  els.wfInput.focus();
  showGameHud(() => solo.wfPoints);
  registerActiveGame({
    pauseShift: (ms) => { solo.wfEndAt += ms; },
    skip: finishWordFlash,
    cleanup: () => { solo.wfActive = false; },
  });

  function tick() {
    if (!solo.wfActive) return;
    if (solo.paused) { requestAnimationFrame(tick); return; }
    const msLeft = solo.wfEndAt - Date.now();
    els.wfTimer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    if (msLeft <= 0) {
      finishWordFlash();
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function submitWfWord() {
  if (!solo.wfActive || solo.paused) return;
  const raw = els.wfInput.value.trim();
  els.wfInput.value = "";
  if (!raw) return;

  const letter = solo.wfLetter.toUpperCase();
  const key = raw.toLowerCase();
  if (raw[0].toUpperCase() !== letter) {
    els.wfFeedback.textContent = `"${raw}" não começa por ${solo.wfLetter}.`;
    return;
  }
  if (raw.length < WF_MIN_LENGTH) {
    els.wfFeedback.textContent = `"${raw}" é demasiado curta.`;
    return;
  }
  if (solo.wfWords.has(key)) {
    els.wfFeedback.textContent = `Já escreveste "${raw}".`;
    return;
  }

  solo.wfWords.add(key);
  // Palavras mais longas valem mais — recompensa esforço, não só velocidade.
  const lengthBonus = Math.min(raw.length - WF_MIN_LENGTH, 4);
  const points = WF_POINTS_PER_WORD + lengthBonus;
  solo.wfPoints += points;
  els.wfFeedback.textContent = "";
  const chip = document.createElement("span");
  chip.className = "wf-word-chip";
  chip.textContent = `${raw} (+${points})`;
  els.wfWords.appendChild(chip);
  updateGameHudScore();
}

function finishWordFlash() {
  if (!solo.wfActive) return;
  solo.wfActive = false;
  const bonus = Math.min(solo.wfPoints, WF_MAX_BONUS);
  solo.runScore += bonus;
  showMinigameEnd({
    gameLabel: "Palavra Relâmpago",
    points: bonus,
    favoriteKey: "word",
    resultText: `${solo.wfWords.size} palavra(s) válida(s) — +${bonus} pts bónus!`,
  });
}

// --- Mata o Inseto: apanha só o inseto-alvo entre insetos "inocentes"
// que aparecem e desaparecem na arena. ---

function startBugSmashMinigame() {
  solo.bugTarget = BUG_TARGET_POOL[Math.floor(Math.random() * BUG_TARGET_POOL.length)];
  solo.bugScore = 0;
  solo.bugCombo = 0;
  solo.bugActive = true;
  els.bugTargetLabel.textContent = solo.bugTarget;
  els.bugArena.innerHTML = "";
  els.bugStatus.textContent = "";
  showScreen("solo-minigame-bug");
  showGameHud(() => solo.bugScore);
  solo.bugEndAt = Date.now() + BUG_GAME_MS;
  registerActiveGame({
    pauseShift: (ms) => { solo.bugEndAt += ms; },
    skip: finishBugSmash,
    cleanup: () => { solo.bugActive = false; clearInterval(solo.bugSpawnIntervalId); els.bugArena.innerHTML = ""; },
  });

  function spawnBug() {
    if (!solo.bugActive || solo.paused) return;
    const isTarget = Math.random() < 0.4;
    const emoji = isTarget
      ? solo.bugTarget
      : BUG_DECOY_POOL[Math.floor(Math.random() * BUG_DECOY_POOL.length)];

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bug";
    btn.textContent = emoji;
    const areaW = els.bugArena.clientWidth || 320;
    const areaH = els.bugArena.clientHeight || 220;
    const x = 20 + Math.random() * Math.max(areaW - 40, 1);
    const y = 20 + Math.random() * Math.max(areaH - 40, 1);
    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;

    let resolved = false;
    const removeTimeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      btn.remove();
    }, BUG_VISIBLE_MS);

    btn.addEventListener("click", () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(removeTimeout);
      btn.remove();
      if (!solo.bugActive) return;
      if (emoji === solo.bugTarget) {
        const comboBonus = Math.min(solo.bugCombo, BUG_MAX_COMBO_BONUS);
        solo.bugScore += BUG_HIT_POINTS + comboBonus;
        solo.bugCombo += 1;
        els.bugStatus.textContent = solo.bugCombo > 1 ? `Combo x${solo.bugCombo}! 🔥` : "";
      } else {
        solo.bugCombo = 0;
        solo.bugScore = Math.max(0, solo.bugScore - BUG_MISS_PENALTY);
        els.bugStatus.textContent = "Combo perdido!";
      }
      updateGameHudScore();
      if (solo.bugCombo > account.bestCombo) { account.bestCombo = solo.bugCombo; saveAccount(); }
    });

    els.bugArena.appendChild(btn);
  }

  function tick() {
    if (!solo.bugActive) return;
    if (solo.paused) { requestAnimationFrame(tick); return; }
    const msLeft = solo.bugEndAt - Date.now();
    els.bugTimer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    if (msLeft <= 0) {
      finishBugSmash();
      return;
    }
    requestAnimationFrame(tick);
  }

  solo.bugSpawnIntervalId = setInterval(spawnBug, BUG_SPAWN_INTERVAL_MS);
  spawnBug();
  requestAnimationFrame(tick);
}

function finishBugSmash() {
  if (!solo.bugActive) return;
  solo.bugActive = false;
  clearInterval(solo.bugSpawnIntervalId);
  els.bugArena.innerHTML = "";

  const bonus = Math.min(solo.bugScore, BUG_MAX_BONUS);
  solo.runScore += bonus;
  showMinigameEnd({ gameLabel: "Mata o Inseto", points: bonus, favoriteKey: "bug", resultText: `+${bonus} pts bónus!` });
}

// --- Cada Macaco no Seu Galho: apanha os macacos que caem, movendo o
// bombeiro-macaco com o rato. ---

function startMonkeyRescueMinigame() {
  solo.monkeyActive = true;
  solo.monkeyScore = 0;
  solo.monkeys = [];
  els.monkeyStatus.textContent = "";
  showScreen("solo-minigame-monkey");

  const arenaW = els.monkeyArena.clientWidth || 320;
  solo.monkeyCatcherX = arenaW / 2;
  els.monkeyCatcher.style.left = `${solo.monkeyCatcherX}px`;

  function onMove(e) {
    if (!solo.monkeyActive) return;
    const rect = els.monkeyArena.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let x = clientX - rect.left;
    x = Math.max(MONKEY_CATCHER_HALF_WIDTH, Math.min(rect.width - MONKEY_CATCHER_HALF_WIDTH, x));
    solo.monkeyCatcherX = x;
    els.monkeyCatcher.style.left = `${x}px`;
  }
  solo.monkeyMoveHandler = onMove;
  els.monkeyArena.addEventListener("pointermove", onMove);

  solo.monkeyLifesavers = [];
  solo.monkeyLastLifesaverAt = 0;
  function onClick(e) {
    if (!solo.monkeyActive || solo.paused) return;
    const now = Date.now();
    if (now - solo.monkeyLastLifesaverAt < MONKEY_LIFESAVER_COOLDOWN_MS) return;
    if (solo.monkeyLifesavers.length >= MONKEY_LIFESAVER_MAX_ACTIVE) return;
    const rect = els.monkeyArena.getBoundingClientRect();
    const x = Math.max(20, Math.min(rect.width - 20, e.clientX - rect.left));
    const el = document.createElement("div");
    el.className = "monkey-lifesaver";
    el.textContent = "🛟";
    el.style.left = `${x}px`;
    els.monkeyArena.appendChild(el);
    solo.monkeyLifesavers.push({ el, x, savesLeft: MONKEY_LIFESAVER_MAX_SAVES, expiresAt: now + MONKEY_LIFESAVER_MS });
    solo.monkeyLastLifesaverAt = now;
  }
  solo.monkeyClickHandler = onClick;
  els.monkeyArena.addEventListener("click", onClick);

  solo.monkeyStartedAt = Date.now();
  solo.monkeyEndAt = solo.monkeyStartedAt + MONKEY_GAME_MS;
  solo.monkeyLastFrame = solo.monkeyStartedAt;
  showGameHud(() => solo.monkeyScore);
  registerActiveGame({
    pauseShift: (ms) => {
      solo.monkeyEndAt += ms;
      solo.monkeyStartedAt += ms;
      solo.monkeyLastFrame = Date.now();
      solo.monkeyLifesavers.forEach((s) => { s.expiresAt += ms; });
    },
    skip: finishMonkeyRescue,
    cleanup: () => {
      solo.monkeyActive = false;
      clearTimeout(solo.monkeySpawnTimeoutId);
      els.monkeyArena.removeEventListener("pointermove", solo.monkeyMoveHandler);
      els.monkeyArena.removeEventListener("click", solo.monkeyClickHandler);
      solo.monkeys.forEach((m) => m.el.remove());
      solo.monkeys = [];
      solo.monkeyLifesavers.forEach((s) => s.el.remove());
      solo.monkeyLifesavers = [];
    },
  });

  function spawnMonkey() {
    if (!solo.monkeyActive || solo.paused) return;
    const arenaWidth = els.monkeyArena.clientWidth || 320;
    const x = 20 + Math.random() * Math.max(arenaWidth - 40, 1);
    const golden = Math.random() < MONKEY_GOLDEN_CHANCE;
    const el = document.createElement("div");
    el.className = golden ? "falling-monkey golden" : "falling-monkey";
    el.textContent = golden ? "🐵" : "🐒";
    el.style.left = `${x}px`;
    el.style.top = "-20px";
    els.monkeyArena.appendChild(el);
    const elapsedSec = (Date.now() - solo.monkeyStartedAt) / 1000;
    const speed = MONKEY_BASE_FALL_SPEED + elapsedSec * MONKEY_SPEED_INCREASE_PER_SEC;
    solo.monkeys.push({ el, x, y: -20, speed, golden });
  }

  function scheduleNextSpawn() {
    if (!solo.monkeyActive) return;
    if (solo.paused) { solo.monkeySpawnTimeoutId = setTimeout(scheduleNextSpawn, 150); return; }
    spawnMonkey();
    const elapsedSec = (Date.now() - solo.monkeyStartedAt) / 1000;
    const interval = Math.max(
      MONKEY_SPAWN_INTERVAL_MS - elapsedSec * MONKEY_SPAWN_SPEEDUP_PER_SEC,
      MONKEY_MIN_SPAWN_INTERVAL_MS
    );
    solo.monkeySpawnTimeoutId = setTimeout(scheduleNextSpawn, interval);
  }

  function frame() {
    if (!solo.monkeyActive) return;
    if (solo.paused) { solo.monkeyLastFrame = Date.now(); requestAnimationFrame(frame); return; }
    const now = Date.now();
    const dt = (now - solo.monkeyLastFrame) / 1000;
    solo.monkeyLastFrame = now;
    const arenaHeight = els.monkeyArena.clientHeight || 240;

    solo.monkeys = solo.monkeys.filter((m) => {
      m.y += m.speed * dt;
      m.el.style.top = `${m.y}px`;

      const inCatchZone = m.y >= arenaHeight - 40;
      if (inCatchZone) {
        const alignedWithCatcher = Math.abs(m.x - solo.monkeyCatcherX) <= MONKEY_CATCHER_HALF_WIDTH + 14;
        const lifesaverHit = solo.monkeyLifesavers.find((s) => Math.abs(m.x - s.x) <= MONKEY_LIFESAVER_HALF_WIDTH);
        if (alignedWithCatcher || lifesaverHit) {
          solo.monkeyScore += MONKEY_CATCH_POINTS * (m.golden ? MONKEY_GOLDEN_MULTIPLIER : 1);
          if (lifesaverHit && !alignedWithCatcher) lifesaverHit.savesLeft -= 1;
          m.el.remove();
          updateGameHudScore();
          return false;
        }
      }
      if (m.y >= arenaHeight) {
        m.el.remove();
        return false;
      }
      return true;
    });

    solo.monkeyLifesavers = solo.monkeyLifesavers.filter((s) => {
      const expired = now >= s.expiresAt || s.savesLeft <= 0;
      if (expired) s.el.remove();
      return !expired;
    });

    els.monkeyTimer.textContent = formatSeconds(Math.max(0, Math.ceil((solo.monkeyEndAt - now) / 1000)));

    if (now >= solo.monkeyEndAt) {
      finishMonkeyRescue();
      return;
    }
    requestAnimationFrame(frame);
  }

  scheduleNextSpawn();
  requestAnimationFrame(frame);
}

function finishMonkeyRescue() {
  if (!solo.monkeyActive) return;
  solo.monkeyActive = false;
  clearTimeout(solo.monkeySpawnTimeoutId);
  els.monkeyArena.removeEventListener("pointermove", solo.monkeyMoveHandler);
  els.monkeyArena.removeEventListener("click", solo.monkeyClickHandler);
  solo.monkeys.forEach((m) => m.el.remove());
  solo.monkeys = [];
  solo.monkeyLifesavers.forEach((s) => s.el.remove());
  solo.monkeyLifesavers = [];

  const bonus = Math.min(solo.monkeyScore, MONKEY_MAX_BONUS);
  solo.runScore += bonus;
  showMinigameEnd({ gameLabel: "Cada Macaco no Seu Galho", points: bonus, favoriteKey: "monkey", resultText: `+${bonus} pts bónus!` });
}

// --- Memória: memoriza categorias mostradas por breves segundos, depois
// identifica-as entre distratoras. Sem pressão de tempo na escolha. ---

function startMemoryMinigame() {
  solo.memActive = true;
  solo.memSelected = new Set();
  els.memStatus.textContent = "";
  els.memConfirmBtn.classList.add("hidden");
  showScreen("solo-minigame-memory");
  showGameHud(() => solo.memSelected.size);
  registerActiveGame({ skip: finishMemory, cleanup: () => { solo.memActive = false; } });

  const shownCount = memShownCountForRound(solo.round);
  const shuffled = shuffleArray(CATEGORIES.map((_, i) => i));
  const shown = shuffled.slice(0, shownCount);
  const decoys = shuffled.slice(shownCount, shownCount + MEM_DECOY_COUNT);
  solo.memShownIndexes = new Set(shown);
  const gridIndexes = shuffleArray([...shown, ...decoys]);

  els.memInstructions.textContent = "Memoriza estas categorias...";
  els.memGrid.innerHTML = "";
  shown.forEach((ci) => {
    const card = document.createElement("div");
    card.className = "mem-card shown-preview";
    card.textContent = CATEGORIES[ci];
    els.memGrid.appendChild(card);
  });

  setTimeout(() => {
    if (!solo.memActive) return;
    els.memInstructions.textContent = `Clica nas ${shownCount} categorias que estavam lá antes.`;
    els.memGrid.innerHTML = "";
    gridIndexes.forEach((ci) => {
      const card = document.createElement("div");
      card.className = "mem-card";
      card.textContent = CATEGORIES[ci];
      card.addEventListener("click", () => {
        if (!solo.memActive) return;
        if (solo.memSelected.has(ci)) {
          solo.memSelected.delete(ci);
          card.classList.remove("selected");
        } else {
          solo.memSelected.add(ci);
          card.classList.add("selected");
        }
        updateGameHudScore();
      });
      els.memGrid.appendChild(card);
    });
    els.memConfirmBtn.classList.remove("hidden");
  }, MEM_PREVIEW_MS);
}

function finishMemory() {
  if (!solo.memActive) return;
  solo.memActive = false;
  els.memConfirmBtn.classList.add("hidden");

  let correct = 0;
  let wrong = 0;
  solo.memSelected.forEach((ci) => {
    if (solo.memShownIndexes.has(ci)) correct += 1;
    else wrong += 1;
  });
  const bonus = Math.max(0, correct * MEM_POINTS_CORRECT - wrong * MEM_POINTS_WRONG);
  solo.runScore += bonus;
  showMinigameEnd({
    gameLabel: "Memória",
    points: bonus,
    favoriteKey: "memory",
    resultText: `${correct} certa(s), ${wrong} errada(s) — +${bonus} pts bónus!`,
  });
}

// --- Maratona de mini-jogos: escolhes quais entram, jogas-nos um a um por
// ordem sorteada, pontuação soma-se até acabarem todos. ---

function startMarathon() {
  const keys = Array.from(document.querySelectorAll("[data-marathon-game]:checked"))
    .map((cb) => cb.dataset.marathonGame);
  if (keys.length === 0) return;
  solo.marathonQueue = shuffleArray(keys);
  solo.marathonTotalGames = keys.length;
  solo.runScore = 0;
  solo.round = 1;
  solo.afterMinigame = runNextMarathonGame;
  runNextMarathonGame();
}

function runNextMarathonGame() {
  if (solo.marathonQueue.length === 0) {
    showMarathonResult();
    return;
  }
  const key = solo.marathonQueue.shift();
  const startFn = MARATHON_GAMES[key];
  if (startFn) startFn();
  else runNextMarathonGame();
}

function showMarathonResult() {
  addScoreHistoryEntry({
    score: solo.runScore,
    mode: "Maratona",
    detail: `${solo.marathonTotalGames} mini-jogo(s)`,
    date: Date.now(),
  });
  els.marathonSummary.textContent = `Pontuação total: ${solo.runScore} pts.`;
  showScreen("solo-marathon-result");
}

// --- Recordes: tabela local dos 20 melhores resultados de sempre. ---

function formatHistoryDate(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderLeaderboard() {
  const history = loadScoreHistory();
  els.leaderboardList.innerHTML = "";
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Ainda não há pontuações guardadas — joga uma run (clássico ou maratona) para entrares na tabela!";
    els.leaderboardList.appendChild(empty);
    return;
  }
  history.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML = `<span class="leaderboard-pos">${i + 1}º</span>
      <span class="leaderboard-mode">${entry.mode}</span>
      <span class="leaderboard-detail">${entry.detail}</span>
      <span class="leaderboard-score">${entry.score} pts</span>
      <span class="leaderboard-date">${formatHistoryDate(entry.date)}</span>`;
    els.leaderboardList.appendChild(row);
  });
}

// --- Mapa-Múndi: acha, entre vários países marcados no mapa, um que cumpra
// o critério pedido (um país específico, um continente, língua ou moeda). ---

function renderMapMarkers() {
  els.mapArena.innerHTML = "";
  const bg = document.createElement("div");
  bg.className = "map-bg";
  bg.innerHTML = MAP_BACKGROUND_SVG;
  els.mapArena.appendChild(bg);
  solo.mapMarkerEls = {};
  MAP_COUNTRIES.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-pin";
    btn.style.left = `${c.x}%`;
    btn.style.top = `${c.y}%`;
    btn.title = c.name;
    btn.addEventListener("click", () => handleMapPinClick(c));
    els.mapArena.appendChild(btn);
    solo.mapMarkerEls[c.name] = btn;
  });
}

function startMapMinigame() {
  solo.mapActive = true;
  solo.mapRoundIndex = 0;
  solo.mapScore = 0;
  els.mapStatus.textContent = "";
  renderMapMarkers();
  showScreen("solo-minigame-map");
  showGameHud(() => solo.mapScore);
  registerActiveGame({
    pauseShift: (ms) => { solo.mapRoundEndAt += ms; },
    skip: finishMapMinigame,
    cleanup: () => { solo.mapActive = false; solo.mapCriteria = null; },
  });
  nextMapRound();
}

function handleMapPinClick(country) {
  if (!solo.mapActive || !solo.mapCriteria || solo.paused) return;
  const btn = solo.mapMarkerEls[country.name];
  if (solo.mapCriteria.matchSet.has(country.name)) {
    const reactionMs = Date.now() - solo.mapRoundStartAt;
    const speedBonus = Math.max(0, Math.round(MAP_HIT_SPEED_BONUS_MAX - reactionMs / 1500));
    const points = MAP_HIT_BASE_POINTS + speedBonus;
    solo.mapScore += points;
    updateGameHudScore();
    btn.classList.add("correct-flash");
    els.mapStatus.textContent = `Certo! ${country.name} — +${points} pts`;
    solo.mapCriteria = null;
    setTimeout(() => btn.classList.remove("correct-flash"), 600);
    setTimeout(() => nextMapRound(), 700);
  } else {
    solo.mapScore = Math.max(0, solo.mapScore - MAP_WRONG_PENALTY);
    updateGameHudScore();
    btn.classList.add("wrong-flash");
    els.mapStatus.textContent = `"${country.name}" não é isso — -${MAP_WRONG_PENALTY} pts.`;
    setTimeout(() => btn.classList.remove("wrong-flash"), 400);
  }
}

function nextMapRound() {
  if (!solo.mapActive) return;
  solo.mapRoundIndex += 1;
  if (solo.mapRoundIndex > MAP_ROUNDS_COUNT) {
    finishMapMinigame();
    return;
  }
  solo.mapCriteria = pickMapCriteria();
  solo.mapRoundStartAt = Date.now();
  solo.mapRoundEndAt = solo.mapRoundStartAt + MAP_ROUND_MS;
  els.mapPrompt.textContent = solo.mapCriteria.promptText;
  els.mapRoundInfo.textContent = `Ronda ${solo.mapRoundIndex}/${MAP_ROUNDS_COUNT}`;
  els.mapStatus.textContent = "";

  function tick() {
    if (!solo.mapActive || !solo.mapCriteria) return;
    if (solo.paused) { requestAnimationFrame(tick); return; }
    const msLeft = solo.mapRoundEndAt - Date.now();
    els.mapTimer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    if (msLeft <= 0) {
      const missedNames = [...solo.mapCriteria.matchSet].slice(0, 3).join(", ");
      const more = solo.mapCriteria.matchSet.size > 3 ? "..." : "";
      els.mapStatus.textContent = `Tempo esgotado! Era: ${missedNames}${more}`;
      solo.mapCriteria = null;
      setTimeout(() => nextMapRound(), 900);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function finishMapMinigame() {
  if (!solo.mapActive) return;
  solo.mapActive = false;
  solo.mapCriteria = null;
  const bonus = Math.min(solo.mapScore, MAP_MAX_BONUS);
  solo.runScore += bonus;
  els.mapPrompt.textContent = "Jogo terminado!";
  els.mapRoundInfo.textContent = "";
  showMinigameEnd({ gameLabel: "Mapa-Múndi", points: bonus, favoriteKey: "map", resultText: `+${bonus} pts bónus!` });
}

// --- Forca (solo): pode usar uma das tuas próprias respostas válidas desta
// sessão como "palavra secreta" (não te lembras do que escreveste há 4
// rondas?), ou uma palavra da lista de reserva se ainda não jogaste nada. ---

function pickHangmanWord() {
  const includeOwn = solo.hangmanIncludeOwnAnswers !== false;
  if (includeOwn && solo.pastValidAnswers.length > 0 && Math.random() < 0.4) {
    return solo.pastValidAnswers[Math.floor(Math.random() * solo.pastValidAnswers.length)];
  }
  const enabled = loadHangmanEnabledCategories() || new Set(HANGMAN_CATEGORY_NAMES);
  let pool = [];
  HANGMAN_CATEGORY_NAMES.forEach((cat) => {
    if (enabled.has(cat)) HANGMAN_WORD_BANK[cat].forEach((w) => pool.push({ categoryName: cat, word: w }));
  });
  if (pool.length === 0) {
    HANGMAN_CATEGORY_NAMES.forEach((cat) => HANGMAN_WORD_BANK[cat].forEach((w) => pool.push({ categoryName: cat, word: w })));
  }
  const unused = pool.filter((p) => !solo.hangmanUsedWords.has(p.word));
  const finalPool = unused.length > 0 ? unused : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

function startSoloHangman() {
  const { categoryName, word } = pickHangmanWord();
  solo.hangmanUsedWords.add(word);
  solo.hangmanWord = word;
  solo.hangmanCategoryName = categoryName;
  solo.hangmanGuessedLetters = {};
  solo.hangmanWrongCount = 0;
  solo.hangmanMaxWrong = solo.hangmanChallengeMode ? SOLO_HANGMAN_CHALLENGE_MAX_WRONG : SOLO_HANGMAN_MAX_WRONG;
  solo.hangmanActive = true;
  els.soloHangmanStatus.textContent = "";
  els.soloHangmanGuessControls.classList.remove("hidden");
  els.hangmanStreakInfo.textContent = solo.hangmanStreakMode
    ? `Sequência atual: ${solo.hangmanStreak} palavra(s) certa(s)${solo.hangmanChallengeMode ? " — modo desafio 🔥" : ""}`
    : "";
  renderSoloHangman();
  showScreen("solo-hangman");
  showGameHud(() => Math.max(0, (solo.hangmanMaxWrong - solo.hangmanWrongCount) * SOLO_HANGMAN_POINTS_PER_LIFE));
  registerActiveGame({ skip: () => finishSoloHangman(false) });
}

function soloHangmanRevealed() {
  return [...solo.hangmanWord].every((ch) => solo.hangmanGuessedLetters[ch]);
}

function renderSoloHangman() {
  els.soloHangmanCategory.textContent = `Categoria: ${solo.hangmanCategoryName}`;
  const revealAll = !solo.hangmanActive;
  els.soloHangmanWordDisplay.textContent = [...solo.hangmanWord]
    .map((ch) => (revealAll || solo.hangmanGuessedLetters[ch] ? ch : "_"))
    .join(" ");
  const wrong = Object.keys(solo.hangmanGuessedLetters).filter((l) => !solo.hangmanWord.includes(l));
  els.soloHangmanWrongLetters.textContent = wrong.length ? `Letras erradas: ${wrong.join(", ")}` : "";
  els.soloHangmanLives.textContent = `Erros: ${solo.hangmanWrongCount} / ${solo.hangmanMaxWrong}`;
}

function soloHangmanGuessLetter(letterRaw) {
  if (!solo.hangmanActive || solo.paused) return;
  const letter = letterRaw.toUpperCase();
  if (solo.hangmanGuessedLetters[letter]) return;
  solo.hangmanGuessedLetters[letter] = true;
  if (!solo.hangmanWord.includes(letter)) solo.hangmanWrongCount += 1;
  resolveSoloHangmanTurn();
}

function soloHangmanGuessWord(guessRaw) {
  if (!solo.hangmanActive || solo.paused) return;
  const guess = guessRaw.trim().toUpperCase();
  if (guess === solo.hangmanWord) {
    [...solo.hangmanWord].forEach((ch) => { solo.hangmanGuessedLetters[ch] = true; });
  } else {
    solo.hangmanWrongCount += SOLO_HANGMAN_WORD_PENALTY;
  }
  resolveSoloHangmanTurn();
}

function resolveSoloHangmanTurn() {
  renderSoloHangman();
  updateGameHudScore();
  if (soloHangmanRevealed()) {
    finishSoloHangman(true);
  } else if (solo.hangmanWrongCount >= solo.hangmanMaxWrong) {
    finishSoloHangman(false);
  }
}

function finishSoloHangman(won) {
  if (!solo.hangmanActive) return;
  solo.hangmanActive = false;
  els.soloHangmanGuessControls.classList.add("hidden");
  renderSoloHangman();

  const challengeMult = solo.hangmanChallengeMode ? SOLO_HANGMAN_CHALLENGE_MULT : 1;
  let bonus = 0;
  let resultText;

  if (won) {
    const livesLeft = solo.hangmanMaxWrong - solo.hangmanWrongCount;
    const base = Math.max(SOLO_HANGMAN_MIN_BONUS, livesLeft * SOLO_HANGMAN_POINTS_PER_LIFE);
    if (solo.hangmanStreakMode) {
      solo.hangmanStreak += 1;
      const streakMult = 1 + Math.min(solo.hangmanStreak - 1, SOLO_HANGMAN_STREAK_MULT_CAP) * SOLO_HANGMAN_STREAK_MULT_STEP;
      bonus = Math.round(base * streakMult * challengeMult);
      resultText = `Acertaste "${solo.hangmanWord}"! Sequência: ${solo.hangmanStreak} 🔥 — +${bonus} pts.`;
      if (solo.hangmanStreak > (account.bestHangmanStreak || 0)) {
        account.bestHangmanStreak = solo.hangmanStreak;
        saveAccount();
      }
      solo.afterMinigame = startSoloHangman;
    } else {
      bonus = Math.round(base * challengeMult);
      resultText = `Acertaste "${solo.hangmanWord}"! +${bonus} pts bónus!`;
    }
  } else if (solo.hangmanStreakMode) {
    resultText = `A sequência acabou em ${solo.hangmanStreak} palavra(s) — a palavra era "${solo.hangmanWord}". Recorde: ${account.bestHangmanStreak || 0}.`;
    solo.afterMinigame = () => {
      solo.hangmanStreak = 0;
      solo.hangmanUsedWords = new Set();
      startSoloHangman();
    };
  } else {
    resultText = `Não desta vez — a palavra era "${solo.hangmanWord}".`;
  }

  solo.runScore += bonus;
  showMinigameEnd({ gameLabel: "Forca", points: bonus, favoriteKey: "hangman", resultText });
}
