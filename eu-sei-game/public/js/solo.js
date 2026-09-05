// Modo single-player: totalmente offline, sem Firebase. Uma "run" é uma
// sequência de rondas com dificuldade crescente (menos tempo, mais
// categorias) até não atingires o mínimo de respostas válidas na ronda.
// Sem outros jogadores para votar, só se valida se a resposta começa pela
// letra certa (decisão tomada para o MVP: sem lista de palavras).

import {
  CATEGORIES, pickLetters, pickCategories, MIN_ENABLED_CATEGORIES,
  MAP_BACKGROUND_SVG, pickMapCriteria, normalizeCountryName, pickLandmarkRound,
  ACHIEVEMENTS, pickMascotIntro, pickChaosEvent,
} from "./data.js";
import { showTouchControls, hideTouchControls } from "./touch-controls.js";
import { sfx, sfxEnabled, setSfxEnabled } from "./sfx.js";

const HIGH_SCORE_KEY = "euSei_soloHighScore";
const ENABLED_CATEGORIES_KEY = "euSei_soloEnabledCategories";
const REFLEX_THEME_KEY = "euSei_reflexTheme";
const SCORE_HISTORY_KEY = "euSei_soloScoreHistory";
const SCORE_HISTORY_MAX = 20;
const ACCOUNT_KEY = "euSei_soloAccount";
const ACHIEVEMENTS_KEY = "euSei_soloAchievements";
const CHAOS_KEY = "euSei_soloChaos";
const XP_PER_POINT = 1;

const SOLO_BASE_CATEGORIES = 5;
const SOLO_MAX_CATEGORIES = 12;
const SOLO_BASE_TIME = 75;
const SOLO_MIN_TIME = 30;
const SOLO_EXCLUDE_HARD = true;

const REFLEX_ROUNDS_COUNT = 8;
const REFLEX_ROUND_MS = 6000;
const REFLEX_ITEMS_ON_SCREEN = 14;
const REFLEX_HIT_BASE_POINTS = 4;
const REFLEX_HIT_SPEED_BONUS_MAX = 4;
const REFLEX_WRONG_PENALTY = 2;
const REFLEX_MAX_BONUS = 45;
const REFLEX_RANDOM_THEME = "Aleatório";

// Temas do "Olho de Lince" — cada um com o seu cenário e conjunto de itens
// (emoji + nome) para procurar. Doodles simples, sem imagens externas.
const REFLEX_THEMES = {
  "Selva": [
    { e: "🐝", n: "abelha" }, { e: "🦋", n: "borboleta" }, { e: "🐞", n: "joaninha" }, { e: "🐛", n: "lagarta" },
    { e: "🕷️", n: "aranha" }, { e: "🦗", n: "gafanhoto" }, { e: "🌺", n: "flor" }, { e: "🍄", n: "cogumelo" },
    { e: "🐒", n: "macaco" }, { e: "🦜", n: "papagaio" }, { e: "🐍", n: "cobra" }, { e: "🦎", n: "lagarto" },
    { e: "🌿", n: "folha" }, { e: "🐆", n: "leopardo" }, { e: "🦔", n: "ouriço" },
  ],
  "Mar": [
    { e: "🐚", n: "concha" }, { e: "🐠", n: "peixe tropical" }, { e: "🐟", n: "peixe" }, { e: "🐡", n: "baiacu" },
    { e: "🦀", n: "caranguejo" }, { e: "🐙", n: "polvo" }, { e: "🦑", n: "lula" }, { e: "🐬", n: "golfinho" },
    { e: "🐳", n: "baleia" }, { e: "🦈", n: "tubarão" }, { e: "⭐", n: "estrela-do-mar" }, { e: "🪸", n: "coral" },
    { e: "🦞", n: "lagosta" }, { e: "🦐", n: "camarão" }, { e: "🐢", n: "tartaruga" },
  ],
  "Casa e Cozinha": [
    { e: "🍽️", n: "prato" }, { e: "🍴", n: "talher" }, { e: "🥄", n: "colher" }, { e: "🍳", n: "ovo estrelado" },
    { e: "🧂", n: "sal" }, { e: "🫖", n: "bule" }, { e: "☕", n: "chávena" }, { e: "🧁", n: "queque" },
    { e: "🍞", n: "pão" }, { e: "🥐", n: "croissant" }, { e: "🧊", n: "gelo" }, { e: "🧽", n: "esponja" },
    { e: "🕯️", n: "vela" }, { e: "📖", n: "livro" }, { e: "🛋️", n: "sofá" },
  ],
};
const REFLEX_THEME_NAMES = [REFLEX_RANDOM_THEME, ...Object.keys(REFLEX_THEMES)];

function loadReflexTheme() {
  try {
    return localStorage.getItem(REFLEX_THEME_KEY) || REFLEX_RANDOM_THEME;
  } catch {
    return REFLEX_RANDOM_THEME;
  }
}

function saveReflexTheme(theme) {
  try {
    localStorage.setItem(REFLEX_THEME_KEY, theme);
  } catch {
    // sem drama, só não fica lembrado entre sessões.
  }
}

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
const MEMORY_THEME_KEY = "euSei_memoryTheme";
const MEMORY_GAME_THEME = "Categorias do jogo";

// Temas alternativos para o mini-jogo de Memória — em vez de memorizar
// sempre as categorias do "Eu sei!", podes escolher outro tipo de palavras.
const MEMORY_THEMES = {
  "Animais": [
    "Leão", "Elefante", "Girafa", "Tartaruga", "Golfinho", "Pinguim", "Canguru", "Crocodilo",
    "Zebra", "Hipopótamo", "Rinoceronte", "Panda", "Coala", "Tigre", "Urso", "Lobo",
    "Raposa", "Coelho", "Esquilo", "Morcego",
  ],
  "Elementos Químicos": [
    "Hidrogénio", "Hélio", "Carbono", "Azoto", "Oxigénio", "Sódio", "Magnésio", "Alumínio",
    "Silício", "Ferro", "Ouro", "Prata", "Cobre", "Zinco", "Chumbo", "Mercúrio",
    "Crómio", "Néon", "Árgon", "Potássio",
  ],
  "Campeões de LoL": [
    "Ahri", "Yasuo", "Jinx", "Lux", "Ezreal", "Garen", "Darius", "Katarina",
    "Lee Sin", "Thresh", "Zed", "Vayne", "Ashe", "Teemo", "Amumu", "Riven",
    "Vi", "Jhin", "Kai'Sa", "Yone",
  ],
  "Harry Potter": [
    "Harry Potter", "Rony Weasley", "Hermione Granger", "Alvo Dumbledore", "Severo Snape",
    "Draco Malfoy", "Rúbeo Hagrid", "Minerva McGonagall", "Voldemort", "Sirius Black",
    "Luna Lovegood", "Gina Weasley", "Neville Longbottom", "Bellatrix Lestrange", "Dobby",
  ],
  "Super-heróis": [
    "Batman", "Super-Homem", "Homem-Aranha", "Homem de Ferro", "Capitã Marvel", "Thor",
    "Hulk", "Viúva Negra", "Flash", "Mulher Maravilha", "Aquaman", "Pantera Negra",
    "Deadpool", "Wolverine",
  ],
};
const MEMORY_THEME_NAMES = [MEMORY_GAME_THEME, ...Object.keys(MEMORY_THEMES)];

function loadMemoryTheme() {
  try {
    return localStorage.getItem(MEMORY_THEME_KEY) || MEMORY_GAME_THEME;
  } catch {
    return MEMORY_GAME_THEME;
  }
}

function saveMemoryTheme(theme) {
  try {
    localStorage.setItem(MEMORY_THEME_KEY, theme);
  } catch {
    // sem drama, só não fica lembrado entre sessões.
  }
}

function currentMemoryPool() {
  const theme = solo.memoryTheme;
  return theme === MEMORY_GAME_THEME || !MEMORY_THEMES[theme] ? CATEGORIES.slice() : MEMORY_THEMES[theme];
}

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

// MAP_COUNTRIES, MAP_BACKGROUND_SVG e pickMapCriteria() agora vivem em
// data.js (partilhados com a versão em equipa deste jogo no multiplayer).

function startHangmanSingle() {
  solo.hangmanStreakMode = false;
  startSoloHangman();
}

// "Descartando Juntos" fica de fora da maratona de propósito — é um jogo
// mais longo e estratégico, pensado para se jogar por inteiro a partir do
// menu principal, não como uma paragem rápida entre outros mini-jogos.
const MARATHON_GAMES = {
  reflex: startReflexMinigame,
  word: startWordFlashMinigame,
  bug: startBugSmashMinigame,
  monkey: startMonkeyRescueMinigame,
  memory: startMemoryMinigame,
  hangman: startHangmanSingle,
  map: startMapMinigame,
  pacman: startPacman,
  golf: startGolf,
  car: startCarGame,
  landmark: startLandmarkMinigame,
};

// --- Kota Corre!: labirinto ao estilo Pac-Man com tema da história de
// Angola — és a bandeira de Angola a fugir das forças estrangeiras da
// guerra civil; come as pastilhas grandes e por uns segundos são elas que
// fogem de ti. Usa os túneis dos lados para escapar. ---
const PAC_COLS = 17;
const PAC_ROWS = 13;
const PAC_CELL_PX = 32;
const PAC_TICK_MS = 160;
const PAC_FRIGHTEN_MS = 6000;
const PAC_LIVES = 3;
const PAC_DOT_POINTS = 1;
const PAC_PELLET_POINTS = 5;
const PAC_GHOST_POINTS = 20;
const PAC_MAX_BONUS = 80;
// Começam perto do centro (junto ao bloco central), não colados ao
// jogador — dá um respiro inicial antes da perseguição começar a sério.
// Bandeiras desenhadas em SVG e não com emoji (🇦🇴): os emoji de bandeira
// simplesmente não aparecem no Windows, e aqui são o elemento central do
// jogo. Ficam recortadas em círculo pelo border-radius do .pac-ghost.
const FLAG_ANGOLA = `<svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
  <rect width="30" height="10" fill="#c8102e"/><rect y="10" width="30" height="10" fill="#111"/>
  <g fill="#ffcf00"><circle cx="15" cy="10" r="3.1" fill="none" stroke="#ffcf00" stroke-width="1.2"/>
  <path d="M15 6.2l0.7 2.1h2.2l-1.8 1.3 0.7 2.1-1.8-1.3-1.8 1.3 0.7-2.1-1.8-1.3h2.2z"/></g>
</svg>`;
const FLAG_SOUTH_AFRICA = `<svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
  <rect width="30" height="20" fill="#fff"/>
  <path d="M0 0h30v6.5H0z" fill="#e03c31"/><path d="M0 13.5h30V20H0z" fill="#001489"/>
  <path d="M0 7.5h30v5H0z" fill="#007749"/>
  <path d="M0 0l12 10L0 20z" fill="#ffb81c"/><path d="M0 3l9 7-9 7z" fill="#001489"/>
</svg>`;
const FLAG_ZAIRE = `<svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
  <rect width="30" height="20" fill="#0b7a3b"/>
  <circle cx="15" cy="10" r="6" fill="#f7d117"/>
  <path d="M14.2 12.5h1.6v-4h-1.6z" fill="#5a3a1a"/>
  <path d="M15 4.5c1.4 1.2 1.6 2.6 0 3.6-1.6-1-1.4-2.4 0-3.6z" fill="#e2542c"/>
</svg>`;
const FLAG_CUBA = `<svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
  <rect width="30" height="20" fill="#fff"/>
  <g fill="#0033a0"><rect width="30" height="4"/><rect y="8" width="30" height="4"/><rect y="16" width="30" height="4"/></g>
  <path d="M0 0l13 10L0 20z" fill="#cb1515"/>
  <path d="M5 6.6l0.9 2.7h2.8l-2.3 1.7 0.9 2.7L5 12l-2.3 1.7 0.9-2.7L1.3 9.3h2.8z" fill="#fff"/>
</svg>`;
const FLAG_USSR = `<svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
  <rect width="30" height="20" fill="#cc0000"/>
  <g fill="#ffd700" transform="translate(6.5 5.5) scale(0.9)">
    <path d="M2.6 0l0.8 2.4h2.5L3.9 3.9l0.8 2.4L2.6 4.8 0.5 6.3l0.8-2.4L-0.7 2.4h2.5z"/>
    <path d="M0 8.5c2.6-1 4.6-3 5-5.4l1.1 0.5C5.6 6 3.3 8 0.4 9.2z"/>
    <path d="M1.4 9.4l4.9-3.2 0.8 1.2-4.9 3.2z"/>
  </g>
</svg>`;

// Forças estrangeiras presentes na Guerra Civil Angolana (1975–2002), que
// aqui perseguem o jogador. Nota histórica: a África do Sul e o Zaire
// entraram mesmo com tropas em 1975; Cuba e a URSS intervieram do lado do
// governo do MPLA, a convite deste. Usa-se a bandeira atual da África do
// Sul (a da época é hoje um símbolo do apartheid).
const PAC_GHOSTS_INFO = [
  { name: "África do Sul", color: "#007749", flag: FLAG_SOUTH_AFRICA, home: { row: 5, col: 7 } },
  { name: "Zaire", color: "#0b7a3b", flag: FLAG_ZAIRE, home: { row: 5, col: 9 } },
  { name: "Cuba", color: "#0033a0", flag: FLAG_CUBA, home: { row: 8, col: 7 } },
  { name: "União Soviética", color: "#cc0000", flag: FLAG_USSR, home: { row: 8, col: 9 } },
];
const PAC_TUNNEL_ROW = Math.floor(PAC_ROWS / 2);
const PAC_DIRS = {
  ArrowUp: { r: -1, c: 0 }, w: { r: -1, c: 0 }, W: { r: -1, c: 0 },
  ArrowDown: { r: 1, c: 0 }, s: { r: 1, c: 0 }, S: { r: 1, c: 0 },
  ArrowLeft: { r: 0, c: -1 }, a: { r: 0, c: -1 }, A: { r: 0, c: -1 },
  ArrowRight: { r: 0, c: 1 }, d: { r: 0, c: 1 }, D: { r: 0, c: 1 },
};

function buildPacmanMaze() {
  const grid = [];
  for (let r = 0; r < PAC_ROWS; r++) {
    const row = [];
    for (let c = 0; c < PAC_COLS; c++) {
      let wall = false;
      if (r === 0 || r === PAC_ROWS - 1) wall = true;
      if (c === 0 || c === PAC_COLS - 1) {
        wall = true;
        if (r === PAC_TUNNEL_ROW) wall = false;
      }
      row.push(wall ? "#" : ".");
    }
    grid.push(row);
  }
  const blocks = [
    [2, 2], [2, 3], [3, 2], [2, 13], [2, 14], [3, 14],
    [4, 5], [4, 6], [4, 10], [4, 11],
    [5, 2], [5, 3], [5, 13], [5, 14],
    [6, 7], [6, 8], [6, 9], [7, 7], [7, 8], [7, 9],
    [7, 2], [7, 3], [7, 13], [7, 14],
    [8, 5], [8, 6], [8, 10], [8, 11],
    [9, 2], [9, 14], [10, 2], [10, 3], [10, 13], [10, 14],
  ];
  blocks.forEach(([r, c]) => { if (grid[r] && grid[r][c] !== undefined) grid[r][c] = "#"; });
  // pastilhas grandes nos quatro cantos jogáveis
  [[1, 1], [1, PAC_COLS - 2], [PAC_ROWS - 2, 1], [PAC_ROWS - 2, PAC_COLS - 2]].forEach(([r, c]) => {
    grid[r][c] = "o";
  });
  return grid;
}

// --- Mini-Golfe: física simples (aceleração + atrito + ressaltos) em 3
// buracos bem maiores do que o ecrã — uma câmara segue a bola, tal como
// num jogo de ação normal, em vez de mostrar o percurso todo espremido
// numa caixinha. Pontuação por rapidez em vez de contar pancadas. ---
const GOLF_BALL_RADIUS = 8;
const GOLF_HOLE_RADIUS = 12;
const GOLF_ACCEL = 460; // px/s²
const GOLF_DRAG = 1.3; // por segundo
const GOLF_MAX_SPEED = 320; // px/s
const GOLF_BOUNCE_LOSS = 0.7;
const GOLF_POINTS_PER_HOLE_MAX = 30;
const GOLF_POINTS_PER_HOLE_MIN = 6;
const GOLF_MAX_BONUS = 80;
const GOLF_HOLES = [
  {
    courseW: 1500, courseH: 700,
    start: { x: 60, y: 350 }, hole: { x: 1440, y: 350 },
    walls: [
      { x: 280, y: 0, w: 26, h: 460 },
      { x: 280, y: 580, w: 26, h: 120 },
      { x: 560, y: 240, w: 26, h: 460 },
      { x: 560, y: 0, w: 26, h: 140 },
      { x: 840, y: 0, w: 26, h: 460 },
      { x: 840, y: 580, w: 26, h: 120 },
      { x: 1120, y: 200, w: 26, h: 500 },
    ],
  },
  {
    courseW: 1700, courseH: 820,
    start: { x: 60, y: 60 }, hole: { x: 1620, y: 760 },
    walls: [
      { x: 220, y: 120, w: 26, h: 620 },
      { x: 460, y: 0, w: 26, h: 620 },
      { x: 700, y: 200, w: 26, h: 620 },
      { x: 940, y: 0, w: 26, h: 620 },
      { x: 1180, y: 200, w: 26, h: 620 },
      { x: 1420, y: 0, w: 26, h: 560 },
    ],
  },
  {
    courseW: 1900, courseH: 900,
    start: { x: 60, y: 450 }, hole: { x: 1820, y: 450 },
    walls: [
      { x: 240, y: 0, w: 26, h: 380 },
      { x: 240, y: 520, w: 26, h: 380 },
      { x: 480, y: 200, w: 26, h: 500 },
      { x: 480, y: 0, w: 26, h: 100 },
      { x: 720, y: 0, w: 26, h: 380 },
      { x: 720, y: 520, w: 26, h: 380 },
      { x: 960, y: 200, w: 26, h: 500 },
      { x: 1200, y: 0, w: 26, h: 380 },
      { x: 1200, y: 520, w: 26, h: 380 },
      { x: 1440, y: 200, w: 26, h: 500 },
      { x: 1680, y: 0, w: 26, h: 400 },
    ],
  },
];

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
    return {
      xp: acc.xp || 0,
      gamesPlayed: acc.gamesPlayed || 0,
      bestCombo: acc.bestCombo || 0,
      bestHangmanStreak: acc.bestHangmanStreak || 0,
      favorites: acc.favorites || {},
    };
  } catch {
    return { xp: 0, gamesPlayed: 0, bestCombo: 0, bestHangmanStreak: 0, favorites: {} };
  }
}

function saveAccount() {
  try {
    // favorites/bestHangmanStreak faziam falta aqui: eram escritos em memória
    // mas nunca guardados, por isso o "jogo favorito" voltava a zero em cada
    // recarregamento — e as conquistas que dependem deles nunca aconteciam.
    localStorage.setItem(
      ACCOUNT_KEY,
      JSON.stringify({
        xp: account.xp,
        gamesPlayed: account.gamesPlayed,
        bestCombo: account.bestCombo,
        bestHangmanStreak: account.bestHangmanStreak || 0,
        favorites: account.favorites || {},
      })
    );
  } catch {
    // sem drama, a conta só não persiste entre sessões.
  }
}

const GAME_LABELS = {
  reflex: "Olho de Lince",
  word: "Palavra Relâmpago",
  bug: "Mata o Inseto",
  monkey: "Cada Macaco no Seu Galho",
  memory: "Memória",
  hangman: "Forca",
  map: "Mapa-Múndi",
  pacman: "Kota Corre!",
  golf: "Mini-Golfe",
  cards: "Descartando Juntos",
  car: "Estrada Maluca",
  landmark: "Onde Fica Isto?",
};

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
  reflexActive: false,
  reflexRoundIndex: 0,
  reflexScore: 0,
  reflexTarget: null,
  reflexRoundStartAt: 0,
  reflexRoundEndAt: 0,
  reflexTheme: loadReflexTheme(),
  reflexAdvanceTimeoutId: null,
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
  memShownLabels: new Set(),
  memSelected: new Set(),
  memoryTheme: loadMemoryTheme(),
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
  inMarathon: false,
  mapActive: false,
  mapRoundIndex: 0,
  mapScore: 0,
  mapCriteria: null,
  mapRoundStartAt: 0,
  mapRoundEndAt: 0,
  mapAdvanceTimeoutId: null,
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
  pacGrid: [],
  pacActive: false,
  pacScore: 0,
  pacLives: PAC_LIVES,
  pacPlayer: null,
  pacGhosts: [],
  pacFrightenUntil: 0,
  pacTickId: null,
  pacDotsRemaining: 0,
  pacKeyHandler: null,
  pacCellEls: {},
  pacPlayerEl: null,
  pacGhostEls: [],
  golfActive: false,
  golfHoleIndex: 0,
  golfScore: 0,
  golfBallX: 0,
  golfBallY: 0,
  golfVX: 0,
  golfVY: 0,
  golfKeys: { up: false, down: false, left: false, right: false },
  golfLastFrame: 0,
  golfHoleStartedAt: 0,
  golfAdvanceTimeoutId: null,
  golfBallEl: null,
  golfWorldEl: null,
  golfKeydownHandler: null,
  golfKeyupHandler: null,
  cardActive: false,
  cardPhase: "playing",
  cardDeck: [],
  cardHand: [],
  cardSelected: new Set(),
  cardBlindIndex: 0,
  cardBlindScore: 0,
  cardPlaysLeft: 0,
  cardDiscardsLeft: 0,
  cardMoney: 0,
  cardJokers: [],
  cardTotalChips: 0,
  cardShopOffers: [],
  cardHandSize: 0,
  carActive: false,
  carLane: 1,
  carScore: 0,
  carSpeed: 0,
  carSpawnIntervalMs: 0,
  carElapsed: 0,
  carLastSpawnAt: 0,
  carLastFrame: 0,
  carObstacles: [],
  carObstacleEls: {},
  carNextObstacleId: 1,
  carPlayerEl: null,
  carKeyHandler: null,
  carLaneLineEls: [],
  landmarkActive: false,
  landmarkScore: 0,
  landmarkUsedIds: new Set(),
  landmarkCurrent: null,
  landmarkAnswered: false,
  landmarkRoundStartAt: 0,
  landmarkAdvanceTimeoutId: null,
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
  achievementsBtn: document.getElementById("solo-achievements-btn"),
  achievementsList: document.getElementById("solo-achievements-list"),
  achievementsCount: document.getElementById("solo-achievements-count"),
  achievementsHint: document.getElementById("solo-achievements-hint"),
  leaderboardStats: document.getElementById("solo-leaderboard-stats"),
  playReflexBtn: document.getElementById("solo-play-reflex-btn"),
  playWordflashBtn: document.getElementById("solo-play-wordflash-btn"),
  playBugBtn: document.getElementById("solo-play-bug-btn"),
  playMonkeyBtn: document.getElementById("solo-play-monkey-btn"),
  playMemoryBtn: document.getElementById("solo-play-memory-btn"),
  memoryThemeSelect: document.getElementById("memory-theme-select"),
  memorySetupStartBtn: document.getElementById("memory-setup-start-btn"),
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
  playPacBtn: document.getElementById("solo-play-pac-btn"),
  pacMaze: document.getElementById("pac-maze"),
  pacLivesLabel: document.getElementById("pac-lives"),
  pacStatus: document.getElementById("pac-status"),
  playGolfBtn: document.getElementById("solo-play-golf-btn"),
  golfCourse: document.getElementById("golf-course"),
  golfHoleInfo: document.getElementById("golf-hole-info"),
  golfStatus: document.getElementById("golf-status"),
  playCardsBtn: document.getElementById("solo-play-cards-btn"),
  cardBlindInfo: document.getElementById("card-blind-info"),
  cardStats: document.getElementById("card-stats"),
  cardHandTypePreview: document.getElementById("card-hand-type-preview"),
  cardTable: document.getElementById("card-table"),
  cardHandArea: document.getElementById("card-hand-area"),
  cardPlayBtn: document.getElementById("card-play-btn"),
  cardDiscardBtn: document.getElementById("card-discard-btn"),
  cardJokerRow: document.getElementById("card-joker-row"),
  cardPlayArea: document.getElementById("card-play-area"),
  cardShopPanel: document.getElementById("card-shop-panel"),
  cardShopMoney: document.getElementById("card-shop-money"),
  cardShopOffers: document.getElementById("card-shop-offers"),
  cardShopContinueBtn: document.getElementById("card-shop-continue-btn"),
  playCarBtn: document.getElementById("solo-play-car-btn"),
  carRoad: document.getElementById("car-road"),
  carStatus: document.getElementById("car-status"),
  playLandmarkBtn: document.getElementById("solo-play-landmark-btn"),
  landmarkImage: document.getElementById("landmark-image"),
  landmarkOptions: document.getElementById("landmark-options"),
  landmarkStatus: document.getElementById("landmark-status"),
  landmarkTimer: document.getElementById("landmark-timer"),
  landmarkRoundInfo: document.getElementById("landmark-round-info"),
  mapArena: document.getElementById("map-arena"),
  mapPrompt: document.getElementById("map-prompt"),
  mapRoundInfo: document.getElementById("map-round-info"),
  mapTimer: document.getElementById("map-timer"),
  mapStatus: document.getElementById("map-status"),
  mapAnswerInput: document.getElementById("map-answer-input"),
  mapAnswerSubmitBtn: document.getElementById("map-answer-submit-btn"),
  soloHangmanCategory: document.getElementById("solo-hangman-category"),
  soloHangmanWordDisplay: document.getElementById("solo-hangman-word-display"),
  soloHangmanWrongLetters: document.getElementById("solo-hangman-wrong-letters"),
  soloHangmanLives: document.getElementById("solo-hangman-lives"),
  soloHangmanGuessControls: document.getElementById("solo-hangman-guess-controls"),
  soloHangmanLetterInput: document.getElementById("solo-hangman-letter-input"),
  soloHangmanGuessLetterBtn: document.getElementById("solo-hangman-guess-letter-btn"),
  soloHangmanWordGuessInput: document.getElementById("solo-hangman-word-guess-input"),
  soloHangmanGuessWordBtn: document.getElementById("solo-hangman-guess-word-btn"),
  soloHangmanGiveupBtn: document.getElementById("solo-hangman-giveup-btn"),
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
  reflexSetupStartBtn: document.getElementById("reflex-setup-start-btn"),
  reflexThemeSelect: document.getElementById("reflex-theme-select"),
  reflexThemeLabel: document.getElementById("reflex-theme-label"),
  reflexPrompt: document.getElementById("reflex-prompt"),
  reflexRoundInfo: document.getElementById("reflex-round-info"),
  reflexTimer: document.getElementById("reflex-timer"),
  reflexScene: document.getElementById("reflex-scene"),
  reflexStatus: document.getElementById("reflex-status"),
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
  readyOverlay: document.getElementById("ready-overlay"),
  readyMascot: document.getElementById("ready-mascot"),
  chaosBanner: document.getElementById("chaos-banner"),
  chaosPaw: document.getElementById("chaos-paw"),
  chaosToggle: document.getElementById("solo-chaos-toggle"),
  sfxToggle: document.getElementById("solo-sfx-toggle"),
  readyTitle: document.getElementById("ready-title"),
  readyStartBtn: document.getElementById("ready-start-btn"),
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
  // Lido ANTES de hideGameHud(), que limpa o estado do caos.
  const chaosBonus = solo.chaosBonus || 0;
  hideGameHud();
  const totalPoints = points + chaosBonus;
  // Também conta para a run, não só para o XP: senão o bónus aparecia no
  // ecrã mas não na tabela de recordes, e lia-se como mentira.
  solo.runScore += chaosBonus;
  const gained = addXP(totalPoints, favoriteKey);
  updateAccountXpLabel();
  els.mgeTitle.textContent = `${gameLabel} — fim!`;
  els.mgePoints.textContent = (resultText || `+${points} pts bónus.`)
    + (chaosBonus > 0 ? ` (+${chaosBonus} que o Brasa te passou por baixo da mesa)` : "");
  els.mgeXp.textContent = `+${gained} XP — conta: ${account.xp} XP (${account.gamesPlayed} jogos)`;
  // Uma conquista nova rouba o lugar à boca do costume: é mais raro e é a
  // única altura em que a Dona Manga admite que reparou em ti.
  const fresh = checkAchievements();
  if (fresh.length > 0) {
    const a = fresh[0];
    const extra = fresh.length > 1 ? ` (+${fresh.length - 1})` : "";
    els.mgeQuip.textContent = `${a.icon} Conquista: ${a.name}${extra} — ${a.who}: “${a.quip}”`;
    // A conquista e a boca da mascote partilham este elemento; marcar qual e
    // qual deixa de ser ambiguo para quem le o ecra (e para os testes, que de
    // outra forma nao distinguem "nao ha boca" de "ha uma conquista").
    els.mgeQuip.dataset.kind = "achievement";
    els.mgeQuip.classList.remove("hidden");
    sfx("conquista");
  } else if (solo.marathonQueue.length > 0 || !solo.inMarathon) {
    // A boca da mascote é uma ponte ENTRE jogos: aparece quando ainda vem
    // mais alguma coisa a seguir (maratona a meio), e também a jogar avulso,
    // onde antes o fim era mudo e os mini-jogos soltos não pareciam do mesmo
    // jogo. No ÚLTIMO jogo da maratona fica calada — a seguir vem o ecrã de
    // resultado da maratona, e uma boca solta ali era só ruído.
    const quip = randomMascotQuip();
    els.mgeQuip.textContent = `${quip.who}: "${quip.text}"`;
    els.mgeQuip.dataset.kind = "mascot";
    els.mgeQuip.classList.remove("hidden");
  } else {
    els.mgeQuip.dataset.kind = "none";
    els.mgeQuip.classList.add("hidden");
  }
  els.mgeOverlay.classList.remove("hidden");
  // A conquista ja tocou o seu proprio som; nao vale a pena sobrepor outro.
  if (fresh.length === 0) sfx("fim");
}

els.mgeContinueBtn.addEventListener("click", () => {
  els.mgeOverlay.classList.add("hidden");
  solo.afterMinigame();
});
els.mgeExitBtn.addEventListener("click", () => {
  els.mgeOverlay.classList.add("hidden");
  solo.marathonQueue = [];
  solo.inMarathon = false;
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
  scheduleChaosEvent();
}
function hideGameHud() {
  els.gameHud.classList.add("hidden");
  solo.hudScoreGetter = null;
  clearChaos();
}

// --- Caos da Dona Manga ---
//
// Um evento por mini-jogo, a meio, para nenhuma partida ser igual à
// anterior. Regra que os limita de propósito: NENHUM evento pode tirar
// vidas, tempo ou pontos, nem impedir de ganhar — só mexem no que se vê, e
// um deles até dá pontos. Um evento que te matasse seria a app a jogar
// contra ti, e isso não é variedade, é injustiça. Quem mesmo assim preferir
// jogar limpo desliga no menu.

function loadChaosEnabled() {
  try {
    return localStorage.getItem(CHAOS_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveChaosEnabled(on) {
  try {
    localStorage.setItem(CHAOS_KEY, on ? "on" : "off");
  } catch {
    // sem drama: a preferência só não persiste.
  }
}

function clearChaos() {
  clearTimeout(solo.chaosStartTimeoutId);
  clearTimeout(solo.chaosEndTimeoutId);
  solo.chaosStartTimeoutId = null;
  solo.chaosEndTimeoutId = null;
  els.chaosBanner.classList.add("hidden");
  els.chaosPaw.classList.add("hidden");
  document.querySelectorAll(".chaos-wobble").forEach((el) => el.classList.remove("chaos-wobble"));
}

function scheduleChaosEvent() {
  clearChaos();
  solo.chaosBonus = 0;
  if (!loadChaosEnabled()) return;
  // Entre 6 e 14 segundos: cedo demais e não se percebe que o jogo já
  // estava a correr; tarde demais e a maioria dos jogos já acabou.
  const delay = 6000 + Math.random() * 8000;
  solo.chaosStartTimeoutId = setTimeout(() => {
    if (els.gameHud.classList.contains("hidden")) return; // já não há jogo a correr
    fireChaosEvent(pickChaosEvent());
  }, delay);
}

function fireChaosEvent(ev) {
  sfx("caos");
  els.chaosBanner.textContent = `${ev.who}: “${ev.text}”`;
  els.chaosBanner.classList.remove("hidden");
  const arena = document.querySelector(".screen.active");
  if (ev.kind === "paw") {
    els.chaosPaw.classList.remove("hidden");
  } else if (ev.kind === "wobble") {
    arena?.classList.add("chaos-wobble");
  } else if (ev.kind === "bonus") {
    solo.chaosBonus = (solo.chaosBonus || 0) + (ev.bonus || 0);
  }
  solo.chaosEndTimeoutId = setTimeout(() => {
    els.chaosBanner.classList.add("hidden");
    els.chaosPaw.classList.add("hidden");
    arena?.classList.remove("chaos-wobble");
  }, ev.ms || 4000);
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
  solo.inMarathon = false;
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

// Ecrã partilhado "pronto?" — mostra-se antes de QUALQUER mini-jogo (e antes
// de cada "jogar novamente"/próximo jogo da maratona) e só chama onStart()
// quando o jogador clica em Começar, para o cronómetro nunca correr antes
// de haver tempo de preparação.
function showReadyOverlay(label, onStart, gameKey) {
  els.readyTitle.textContent = label;
  // Uma fala da mascote sobre ESTE jogo: é o que liga os mini-jogos ao mesmo
  // mundo em vez de serem doze coisas soltas com o mesmo botão.
  const intro = gameKey ? pickMascotIntro(gameKey) : null;
  if (intro) {
    els.readyMascot.textContent = `${intro.who}: “${intro.text}”`;
    els.readyMascot.classList.remove("hidden");
  } else {
    els.readyMascot.classList.add("hidden");
  }
  els.readyOverlay.classList.remove("hidden");
  const handler = () => {
    els.readyOverlay.classList.add("hidden");
    els.readyStartBtn.removeEventListener("click", handler);
    onStart();
  };
  els.readyStartBtn.addEventListener("click", handler);
}

function launchStandalone(startFn, gameKey) {
  // "Continuar" no ecrã de fim volta a jogar o mesmo jogo (jogar novamente
  // sem ter de voltar ao menu) — "Sair" continua sempre disponível à parte.
  const label = GAME_LABELS[gameKey] || "Mini-jogo";
  const gated = () => showReadyOverlay(label, startFn, gameKey);
  solo.afterMinigame = gated;
  solo.runScore = 0;
  solo.round = Math.max(solo.round, 1);
  gated();
}
function returnToSoloMenu() { showScreen("solo-menu"); }

els.playReflexBtn.addEventListener("click", () => {
  els.reflexThemeSelect.value = solo.reflexTheme;
  showScreen("solo-reflex-setup");
});
els.reflexSetupStartBtn.addEventListener("click", () => {
  solo.reflexTheme = els.reflexThemeSelect.value;
  saveReflexTheme(solo.reflexTheme);
  launchStandalone(startReflexMinigame, "reflex");
});
els.playWordflashBtn.addEventListener("click", () => launchStandalone(startWordFlashMinigame, "word"));
els.playBugBtn.addEventListener("click", () => launchStandalone(startBugSmashMinigame, "bug"));
els.playMonkeyBtn.addEventListener("click", () => launchStandalone(startMonkeyRescueMinigame, "monkey"));
els.playMemoryBtn.addEventListener("click", () => {
  els.memoryThemeSelect.value = solo.memoryTheme;
  showScreen("solo-memory-setup");
});
els.memorySetupStartBtn.addEventListener("click", () => {
  solo.memoryTheme = els.memoryThemeSelect.value;
  saveMemoryTheme(solo.memoryTheme);
  launchStandalone(startMemoryMinigame, "memory");
});
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
  }, "hangman");
});
els.playMapBtn.addEventListener("click", () => launchStandalone(startMapMinigame, "map"));
els.mapAnswerSubmitBtn.addEventListener("click", submitMapAnswer);
els.mapAnswerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitMapAnswer();
});
els.playPacBtn.addEventListener("click", () => launchStandalone(startPacman, "pacman"));
els.playGolfBtn.addEventListener("click", () => launchStandalone(startGolf, "golf"));
els.playCardsBtn.addEventListener("click", () => launchStandalone(startCardGame, "cards"));
els.playCarBtn.addEventListener("click", () => launchStandalone(startCarGame, "car"));
els.playLandmarkBtn.addEventListener("click", () => launchStandalone(startLandmarkMinigame, "landmark"));
els.cardPlayBtn.addEventListener("click", () => cardPlaySelected());
els.cardDiscardBtn.addEventListener("click", () => cardDiscardSelected());

els.marathonMenuBtn.addEventListener("click", () => showScreen("solo-marathon-setup"));
els.marathonStartBtn.addEventListener("click", startMarathon);
els.marathonRestartBtn.addEventListener("click", () => showScreen("solo-marathon-setup"));
els.leaderboardBtn.addEventListener("click", () => {
  renderLeaderboard();
  showScreen("solo-leaderboard");
});
els.achievementsBtn.addEventListener("click", () => {
  renderAchievements();
  showScreen("solo-achievements");
});

els.sfxToggle.checked = sfxEnabled();
els.sfxToggle.addEventListener("change", () => {
  setSfxEnabled(els.sfxToggle.checked);
  // Toca um som ao ligar, para se ouvir logo o que se acabou de escolher.
  if (els.sfxToggle.checked) sfx("toque");
});

els.chaosToggle.checked = loadChaosEnabled();
els.chaosToggle.addEventListener("change", () => {
  saveChaosEnabled(els.chaosToggle.checked);
  // Desligar a meio de um jogo tem de valer já, não só no próximo.
  if (!els.chaosToggle.checked) clearChaos();
});

els.finishBtn.addEventListener("click", finishRound);
els.continueBtn.addEventListener("click", startMinigame);
els.restartBtn.addEventListener("click", startRun);
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
els.soloHangmanGiveupBtn.addEventListener("click", () => finishSoloHangman(false));

// Enter entrega o palpite, sem obrigar a ir ao rato buscar o botão.
els.soloHangmanLetterInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); els.soloHangmanGuessLetterBtn.click(); }
});
els.soloHangmanWordGuessInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); els.soloHangmanGuessWordBtn.click(); }
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
    // Enter salta para a categoria seguinte; no último campo, entrega a
    // ronda — evita ter de ir ao rato a meio de uma ronda cronometrada.
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const inputs = [...els.catList.querySelectorAll(".cat-item input")];
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) next.focus();
      else els.finishBtn.click();
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

// --- Olho de Lince: mostra o item a encontrar, depois espalha-o entre
// muitos outros num cenário temático — acha-o o mais depressa possível. ---

function themeSlug(name) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
}

function pickReflexTheme() {
  if (solo.reflexTheme === REFLEX_RANDOM_THEME || !REFLEX_THEMES[solo.reflexTheme]) {
    const names = Object.keys(REFLEX_THEMES);
    return names[Math.floor(Math.random() * names.length)];
  }
  return solo.reflexTheme;
}

function renderReflexScene(shown, themeName) {
  els.reflexScene.innerHTML = "";
  els.reflexScene.className = `reflex-scene theme-${themeSlug(themeName)}`;

  // Posições distribuídas por uma grelha com pequeno jitter (em vez de
  // 100% aleatórias) — evita itens a sobrepor-se e ficarem impossíveis
  // de clicar com precisão.
  const cols = 5;
  const rows = Math.ceil(shown.length / cols);
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const cellOrder = shuffleArray(Array.from({ length: cols * rows }, (_, i) => i)).slice(0, shown.length);

  shown.forEach((item, i) => {
    const col = cellOrder[i] % cols;
    const row = Math.floor(cellOrder[i] / cols);
    const jitterX = (Math.random() - 0.5) * cellW * 0.5;
    const jitterY = (Math.random() - 0.5) * cellH * 0.5;
    const x = Math.max(4, Math.min(96, col * cellW + cellW / 2 + jitterX));
    const y = Math.max(6, Math.min(92, row * cellH + cellH / 2 + jitterY));

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reflex-item";
    btn.textContent = item.e;
    btn.title = item.n;
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;
    btn.addEventListener("click", () => handleReflexItemClick(item, btn));
    els.reflexScene.appendChild(btn);
  });
}

function startReflexMinigame() {
  clearTimeout(solo.reflexAdvanceTimeoutId);
  solo.reflexActive = true;
  solo.reflexRoundIndex = 0;
  solo.reflexScore = 0;
  els.reflexStatus.textContent = "";
  showScreen("solo-minigame");
  showGameHud(() => solo.reflexScore);
  registerActiveGame({
    pauseShift: (ms) => { solo.reflexRoundEndAt += ms; },
    skip: finishReflexMinigame,
    cleanup: () => {
      solo.reflexActive = false;
      solo.reflexTarget = null;
      clearTimeout(solo.reflexAdvanceTimeoutId);
    },
  });
  nextReflexRound();
}

function nextReflexRound() {
  if (!solo.reflexActive) return;
  solo.reflexRoundIndex += 1;
  if (solo.reflexRoundIndex > REFLEX_ROUNDS_COUNT) {
    finishReflexMinigame();
    return;
  }

  const themeName = pickReflexTheme();
  const items = REFLEX_THEMES[themeName];
  const shown = shuffleArray(items).slice(0, Math.min(REFLEX_ITEMS_ON_SCREEN, items.length));
  const target = shown[Math.floor(Math.random() * shown.length)];
  solo.reflexTarget = target;
  solo.reflexRoundStartAt = Date.now();
  solo.reflexRoundEndAt = solo.reflexRoundStartAt + REFLEX_ROUND_MS;

  els.reflexThemeLabel.textContent = themeName;
  els.reflexPrompt.innerHTML = `Encontra: <strong>${target.e} ${target.n}</strong>`;
  els.reflexRoundInfo.textContent = `Ronda ${solo.reflexRoundIndex}/${REFLEX_ROUNDS_COUNT}`;
  els.reflexStatus.textContent = "";
  renderReflexScene(shown, themeName);

  function tick() {
    if (!solo.reflexActive || !solo.reflexTarget) return;
    if (solo.paused) { requestAnimationFrame(tick); return; }
    const msLeft = solo.reflexRoundEndAt - Date.now();
    els.reflexTimer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    if (msLeft <= 0) {
      els.reflexStatus.textContent = `Tempo esgotado! Era: ${target.e} ${target.n}`;
      solo.reflexTarget = null;
      clearTimeout(solo.reflexAdvanceTimeoutId);
      solo.reflexAdvanceTimeoutId = setTimeout(() => nextReflexRound(), 900);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function handleReflexItemClick(item, btn) {
  if (!solo.reflexActive || !solo.reflexTarget || solo.paused) return;
  if (item.n === solo.reflexTarget.n) {
    const reactionMs = Date.now() - solo.reflexRoundStartAt;
    const speedBonus = Math.max(0, Math.round(REFLEX_HIT_SPEED_BONUS_MAX - reactionMs / 1500));
    const points = REFLEX_HIT_BASE_POINTS + speedBonus;
    solo.reflexScore += points;
    updateGameHudScore();
    btn.classList.add("correct-flash");
    sfx("certo");
    els.reflexStatus.textContent = `Encontraste! +${points} pts`;
    solo.reflexTarget = null;
    clearTimeout(solo.reflexAdvanceTimeoutId);
    solo.reflexAdvanceTimeoutId = setTimeout(() => nextReflexRound(), 700);
  } else {
    solo.reflexScore = Math.max(0, solo.reflexScore - REFLEX_WRONG_PENALTY);
    updateGameHudScore();
    btn.classList.add("wrong-flash");
    sfx("errado");
    els.reflexStatus.textContent = `Isso é "${item.n}" — não é o que procuras.`;
    setTimeout(() => btn.classList.remove("wrong-flash"), 400);
  }
}

function finishReflexMinigame() {
  if (!solo.reflexActive) return;
  clearTimeout(solo.reflexAdvanceTimeoutId);
  solo.reflexActive = false;
  solo.reflexTarget = null;
  const bonus = Math.min(solo.reflexScore, REFLEX_MAX_BONUS);
  solo.runScore += bonus;
  showMinigameEnd({ gameLabel: "Olho de Lince", points: bonus, favoriteKey: "reflex", resultText: `+${bonus} pts bónus!` });
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

  const pool = currentMemoryPool();
  const shownCount = Math.min(memShownCountForRound(solo.round), Math.max(1, pool.length - MEM_DECOY_COUNT));
  const shuffled = shuffleArray(pool);
  const shown = shuffled.slice(0, shownCount);
  const decoys = shuffled.slice(shownCount, shownCount + MEM_DECOY_COUNT);
  solo.memShownLabels = new Set(shown);
  const gridItems = shuffleArray([...shown, ...decoys]);

  els.memInstructions.textContent = "Memoriza isto...";
  els.memGrid.innerHTML = "";
  shown.forEach((label) => {
    const card = document.createElement("div");
    card.className = "mem-card shown-preview";
    card.textContent = label;
    els.memGrid.appendChild(card);
  });

  setTimeout(() => {
    if (!solo.memActive) return;
    els.memInstructions.textContent = `Clica nas ${shownCount} que estavam lá antes.`;
    els.memGrid.innerHTML = "";
    gridItems.forEach((label) => {
      const card = document.createElement("div");
      card.className = "mem-card";
      card.textContent = label;
      card.addEventListener("click", () => {
        if (!solo.memActive) return;
        if (solo.memSelected.has(label)) {
          solo.memSelected.delete(label);
          card.classList.remove("selected");
        } else {
          solo.memSelected.add(label);
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
  solo.memSelected.forEach((label) => {
    if (solo.memShownLabels.has(label)) correct += 1;
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
  solo.inMarathon = true;
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
  if (startFn) showReadyOverlay(GAME_LABELS[key] || "Mini-jogo", startFn, key);
  else runNextMarathonGame();
}

function showMarathonResult() {
  solo.inMarathon = false;
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

// --- Conquistas ---
//
// São recalculadas a partir da conta local no fim de cada mini-jogo. Guardar
// só os IDs desbloqueados (e não o estado inteiro) faz com que acrescentar
// uma conquista nova a atribua retroativamente a quem já cumpriu o critério —
// ninguém tem de rejogar o que já jogou.

function loadUnlockedAchievements() {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveUnlockedAchievements(set) {
  try {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify([...set]));
  } catch {
    // sem drama: as conquistas só não persistem entre sessões.
  }
}

function achievementContext() {
  const history = loadScoreHistory();
  const favorites = account.favorites || {};
  return {
    xp: account.xp,
    gamesPlayed: account.gamesPlayed,
    bestCombo: account.bestCombo || 0,
    bestHangmanStreak: account.bestHangmanStreak || 0,
    favorites,
    distinctGames: Object.keys(favorites).length,
    totalGames: Object.keys(GAME_LABELS).length,
    runs: history.length,
    bestScore: history.length ? Math.max(...history.map((h) => h.score || 0)) : 0,
  };
}

// Devolve as conquistas desbloqueadas AGORA (para as anunciar), não todas.
function checkAchievements() {
  const unlocked = loadUnlockedAchievements();
  const ctx = achievementContext();
  const fresh = ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.check(ctx));
  if (fresh.length > 0) {
    fresh.forEach((a) => unlocked.add(a.id));
    saveUnlockedAchievements(unlocked);
  }
  return fresh;
}

function renderAchievements() {
  // Avalia ao abrir, não só no fim de um jogo: quem já cumpre o critério (ou
  // quem cumpriu antes de a conquista existir) via-a como bloqueada até
  // jogar mais uma vez sem razão nenhuma.
  checkAchievements();
  const unlocked = loadUnlockedAchievements();
  const ctx = achievementContext();
  els.achievementsCount.textContent = `${unlocked.size} de ${ACHIEVEMENTS.length} conquistas`;
  els.achievementsList.innerHTML = "";
  ACHIEVEMENTS.forEach((a) => {
    const got = unlocked.has(a.id);
    const row = document.createElement("div");
    row.className = `achievement-row${got ? "" : " achievement-locked"}`;
    row.innerHTML = `<span class="achievement-icon">${got ? a.icon : "🔒"}</span>
      <span class="achievement-text">
        <strong>${a.name}</strong>
        <span class="hint small">${a.desc}</span>
        ${got ? `<span class="achievement-quip">${a.who}: “${a.quip}”</span>` : ""}
      </span>`;
    els.achievementsList.appendChild(row);
  });
  // Uma pista do que falta, para não ser só uma parede de cadeados.
  const next = ACHIEVEMENTS.find((a) => !unlocked.has(a.id));
  els.achievementsHint.textContent = next
    ? `A seguir: ${next.name} — ${next.desc}`
    : "Apanhaste tudo. A Dona Manga finge que não reparou.";
}

function renderLeaderboard() {
  if (els.leaderboardStats) {
    const favEntries = Object.entries(account.favorites || {});
    const favLabel = favEntries.length
      ? favEntries.sort((a, b) => b[1] - a[1])[0][0]
      : "—";
    els.leaderboardStats.innerHTML = `
      <div class="stat-chip">⭐ ${account.xp} XP</div>
      <div class="stat-chip">🎮 ${account.gamesPlayed} jogos (${account.sessionGamesPlayed} nesta sessão)</div>
      <div class="stat-chip">🔥 combo recorde: ${account.bestCombo || 0}</div>
      <div class="stat-chip">🪢 sequência recorde na Forca: ${account.bestHangmanStreak || 0}</div>
      <div class="stat-chip">🏅 jogo favorito: ${GAME_LABELS[favLabel] || favLabel}</div>
    `;
  }
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

// --- Mapa-Múndi: o jogador ESCREVE o nome de um país que cumpra o critério
// pedido (um continente, língua ou moeda — há sempre mais do que uma
// resposta certa possível). O mapa é só contexto visual, não é clicável. ---

function renderMapBackground() {
  els.mapArena.innerHTML = "";
  const bg = document.createElement("div");
  bg.className = "map-bg";
  bg.innerHTML = MAP_BACKGROUND_SVG;
  els.mapArena.appendChild(bg);
}

function startMapMinigame() {
  clearTimeout(solo.mapAdvanceTimeoutId);
  solo.mapActive = true;
  solo.mapRoundIndex = 0;
  solo.mapScore = 0;
  els.mapStatus.textContent = "";
  renderMapBackground();
  showScreen("solo-minigame-map");
  showGameHud(() => solo.mapScore);
  registerActiveGame({
    pauseShift: (ms) => { solo.mapRoundEndAt += ms; },
    skip: finishMapMinigame,
    cleanup: () => {
      solo.mapActive = false;
      solo.mapCriteria = null;
      clearTimeout(solo.mapAdvanceTimeoutId);
    },
  });
  nextMapRound();
}

function submitMapAnswer() {
  if (!solo.mapActive || !solo.mapCriteria || solo.paused) return;
  const raw = els.mapAnswerInput.value;
  els.mapAnswerInput.value = "";
  if (!raw.trim()) return;
  const normalized = normalizeCountryName(raw);
  const match = solo.mapCriteria.matchNames.find((n) => normalizeCountryName(n) === normalized);
  if (match) {
    const reactionMs = Date.now() - solo.mapRoundStartAt;
    const speedBonus = Math.max(0, Math.round(MAP_HIT_SPEED_BONUS_MAX - reactionMs / 1500));
    const points = MAP_HIT_BASE_POINTS + speedBonus;
    solo.mapScore += points;
    updateGameHudScore();
    els.mapStatus.textContent = `Certo! ${match} — +${points} pts`;
    solo.mapCriteria = null;
    clearTimeout(solo.mapAdvanceTimeoutId);
    solo.mapAdvanceTimeoutId = setTimeout(() => nextMapRound(), 900);
  } else {
    solo.mapScore = Math.max(0, solo.mapScore - MAP_WRONG_PENALTY);
    updateGameHudScore();
    els.mapStatus.textContent = `"${raw}" não é isso — -${MAP_WRONG_PENALTY} pts. Tenta outra vez!`;
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
  els.mapAnswerInput.value = "";
  els.mapAnswerInput.focus();

  function tick() {
    if (!solo.mapActive || !solo.mapCriteria) return;
    if (solo.paused) { requestAnimationFrame(tick); return; }
    const msLeft = solo.mapRoundEndAt - Date.now();
    els.mapTimer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    if (msLeft <= 0) {
      const missedNames = solo.mapCriteria.matchNames.slice(0, 3).join(", ");
      const more = solo.mapCriteria.matchNames.length > 3 ? "..." : "";
      els.mapStatus.textContent = `Tempo esgotado! Era: ${missedNames}${more}`;
      solo.mapCriteria = null;
      clearTimeout(solo.mapAdvanceTimeoutId);
      solo.mapAdvanceTimeoutId = setTimeout(() => nextMapRound(), 900);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function finishMapMinigame() {
  if (!solo.mapActive) return;
  clearTimeout(solo.mapAdvanceTimeoutId);
  solo.mapActive = false;
  solo.mapCriteria = null;
  const bonus = Math.min(solo.mapScore, MAP_MAX_BONUS);
  solo.runScore += bonus;
  els.mapPrompt.textContent = "Jogo terminado!";
  els.mapRoundInfo.textContent = "";
  showMinigameEnd({ gameLabel: "Mapa-Múndi", points: bonus, favoriteKey: "map", resultText: `+${bonus} pts bónus!` });
}

// --- "Onde Fica Isto?": identifica um marco famoso a partir de um desenho
// simples (não é foto real), por escolha múltipla. ---
const LANDMARK_ROUNDS_COUNT = 8;
const LANDMARK_ROUND_MS = 10000;
const LANDMARK_HIT_BASE_POINTS = 6;
const LANDMARK_HIT_SPEED_BONUS_MAX = 6;
const LANDMARK_MAX_BONUS = 60;

function landmarkRenderRound() {
  const { landmark, options } = pickLandmarkRound(solo.landmarkUsedIds);
  solo.landmarkUsedIds.add(landmark.id);
  solo.landmarkCurrent = landmark;
  solo.landmarkAnswered = false;
  solo.landmarkRoundStartAt = Date.now();
  els.landmarkImage.innerHTML = landmark.svg;
  els.landmarkOptions.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "landmark-option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => landmarkChoose(opt, btn));
    els.landmarkOptions.appendChild(btn);
  });
  els.landmarkStatus.textContent = "";
  els.landmarkRoundInfo.textContent = `Ronda ${solo.landmarkUsedIds.size}/${LANDMARK_ROUNDS_COUNT}`;
}

function landmarkChoose(chosen, btnEl) {
  if (!solo.landmarkActive || solo.landmarkAnswered || solo.paused) return;
  solo.landmarkAnswered = true;
  clearTimeout(solo.landmarkAdvanceTimeoutId);
  const correct = chosen === solo.landmarkCurrent.answer;
  sfx(correct ? "certo" : "errado");
  els.landmarkOptions.querySelectorAll(".landmark-option-btn").forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent === solo.landmarkCurrent.answer) btn.classList.add("correct-flash");
    else if (btn === btnEl) btn.classList.add("wrong-flash");
  });
  if (correct) {
    const reactionMs = Date.now() - solo.landmarkRoundStartAt;
    const speedBonus = Math.max(0, Math.round(LANDMARK_HIT_SPEED_BONUS_MAX - reactionMs / 1500));
    const points = LANDMARK_HIT_BASE_POINTS + speedBonus;
    solo.landmarkScore += points;
    updateGameHudScore();
    els.landmarkStatus.textContent = `Certo! ${solo.landmarkCurrent.name} é em ${solo.landmarkCurrent.answer}! +${points} pts`;
  } else {
    els.landmarkStatus.textContent = `Não é isso — ${solo.landmarkCurrent.name} é em ${solo.landmarkCurrent.answer}.`;
  }
  solo.landmarkAdvanceTimeoutId = setTimeout(() => landmarkNextRound(), 1400);
}

function landmarkNextRound() {
  if (!solo.landmarkActive) return;
  if (solo.landmarkUsedIds.size >= LANDMARK_ROUNDS_COUNT) {
    finishLandmarkMinigame();
    return;
  }
  landmarkRenderRound();

  function tick() {
    if (!solo.landmarkActive || solo.landmarkAnswered) return;
    if (solo.paused) { requestAnimationFrame(tick); return; }
    const msLeft = solo.landmarkRoundStartAt + LANDMARK_ROUND_MS - Date.now();
    els.landmarkTimer.textContent = formatSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    if (msLeft <= 0) {
      solo.landmarkAnswered = true;
      els.landmarkOptions.querySelectorAll(".landmark-option-btn").forEach((btn) => {
        btn.disabled = true;
        if (btn.textContent === solo.landmarkCurrent.answer) btn.classList.add("correct-flash");
      });
      els.landmarkStatus.textContent = `Tempo esgotado! ${solo.landmarkCurrent.name} é em ${solo.landmarkCurrent.answer}.`;
      clearTimeout(solo.landmarkAdvanceTimeoutId);
      solo.landmarkAdvanceTimeoutId = setTimeout(() => landmarkNextRound(), 1400);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function startLandmarkMinigame() {
  clearTimeout(solo.landmarkAdvanceTimeoutId);
  solo.landmarkActive = true;
  solo.landmarkScore = 0;
  solo.landmarkUsedIds = new Set();
  showScreen("solo-landmark");
  showGameHud(() => solo.landmarkScore);
  registerActiveGame({
    pauseShift: (ms) => { solo.landmarkRoundStartAt += ms; },
    skip: finishLandmarkMinigame,
    cleanup: () => {
      solo.landmarkActive = false;
      clearTimeout(solo.landmarkAdvanceTimeoutId);
    },
  });
  landmarkNextRound();
}

function finishLandmarkMinigame() {
  if (!solo.landmarkActive) return;
  clearTimeout(solo.landmarkAdvanceTimeoutId);
  solo.landmarkActive = false;
  const bonus = Math.min(solo.landmarkScore, LANDMARK_MAX_BONUS);
  solo.runScore += bonus;
  showMinigameEnd({ gameLabel: "Onde Fica Isto?", points: bonus, favoriteKey: "landmark", resultText: `+${bonus} pts bónus!` });
}

// --- Kota Corre!: renderiza o labirinto uma vez (paredes/pastilhas fixas),
// depois só atualiza a posição do jogador/fantasmas a cada tick. ---

// O labirinto tem tamanho fixo em píxeis (as paredes/pastilhas são
// posicionadas em absoluto), por isso num telemóvel estreito saía fora do
// ecrã. Encolhe-o proporcionalmente para caber na largura disponível.
function fitPacmanMaze() {
  const mazeW = PAC_COLS * PAC_CELL_PX;
  const mazeH = PAC_ROWS * PAC_CELL_PX;
  const parent = els.pacMaze.parentElement;
  // clientWidth inclui o padding do cartão — descontá-lo, senão a escala
  // fica otimista e o labirinto sai cortado do lado direito.
  let available = mazeW;
  if (parent) {
    const cs = getComputedStyle(parent);
    available = parent.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  }
  const scale = Math.min(1, available / mazeW);
  els.pacMaze.style.transformOrigin = "top left";
  els.pacMaze.style.transform = scale < 1 ? `scale(${scale})` : "";
  // O transform não altera o espaço ocupado no layout: reserva-o à mão para
  // o resto do cartão não ficar por cima do labirinto encolhido.
  els.pacMaze.style.marginBottom = scale < 1 ? `${-(mazeH * (1 - scale))}px` : "";
}

function renderPacmanMaze() {
  els.pacMaze.innerHTML = "";
  els.pacMaze.style.width = `${PAC_COLS * PAC_CELL_PX}px`;
  els.pacMaze.style.height = `${PAC_ROWS * PAC_CELL_PX}px`;
  fitPacmanMaze();
  solo.pacCellEls = {};

  for (let r = 0; r < PAC_ROWS; r++) {
    for (let c = 0; c < PAC_COLS; c++) {
      const ch = solo.pacGrid[r][c];
      if (ch === "#") {
        const wall = document.createElement("div");
        wall.className = "pac-wall";
        wall.style.left = `${c * PAC_CELL_PX}px`;
        wall.style.top = `${r * PAC_CELL_PX}px`;
        wall.style.width = `${PAC_CELL_PX}px`;
        wall.style.height = `${PAC_CELL_PX}px`;
        els.pacMaze.appendChild(wall);
      } else if (ch === "." || ch === "o") {
        const dot = document.createElement("div");
        dot.className = ch === "o" ? "pac-pellet" : "pac-dot";
        dot.style.left = `${c * PAC_CELL_PX + PAC_CELL_PX / 2}px`;
        dot.style.top = `${r * PAC_CELL_PX + PAC_CELL_PX / 2}px`;
        els.pacMaze.appendChild(dot);
        solo.pacCellEls[`${r},${c}`] = dot;
      }
    }
  }

  solo.pacPlayerEl = document.createElement("div");
  solo.pacPlayerEl.className = "pac-player";
  solo.pacPlayerEl.innerHTML = FLAG_ANGOLA;
  solo.pacPlayerEl.title = "Angola";
  els.pacMaze.appendChild(solo.pacPlayerEl);

  solo.pacGhostEls = PAC_GHOSTS_INFO.map((info) => {
    const el = document.createElement("div");
    el.className = "pac-ghost";
    el.style.background = info.color;
    el.title = info.name;
    el.innerHTML = info.flag;
    els.pacMaze.appendChild(el);
    return el;
  });
}

function pacIsWall(row, col) {
  const c = ((col % PAC_COLS) + PAC_COLS) % PAC_COLS;
  return solo.pacGrid[row][c] === "#";
}

// Devolve a posição resultante se o movimento for válido (paredes e túnel
// nas pontas incluídos), ou null se não se pode mover para lá.
function pacMoveEntity(entity, dir) {
  if (dir.r === 0 && dir.c === 0) return null;
  const newRow = entity.row + dir.r;
  let newCol = entity.col + dir.c;
  if (newRow < 0 || newRow >= PAC_ROWS) return null;
  if (newCol < 0) {
    if (newRow === PAC_TUNNEL_ROW) newCol = PAC_COLS - 1;
    else return null;
  } else if (newCol >= PAC_COLS) {
    if (newRow === PAC_TUNNEL_ROW) newCol = 0;
    else return null;
  }
  if (pacIsWall(newRow, newCol)) return null;
  return { row: newRow, col: newCol };
}

function pacUpdateEntityEl(el, entity) {
  el.style.left = `${entity.col * PAC_CELL_PX + PAC_CELL_PX / 2}px`;
  el.style.top = `${entity.row * PAC_CELL_PX + PAC_CELL_PX / 2}px`;
}

function pacEatAt(row, col) {
  const key = `${row},${col}`;
  const ch = solo.pacGrid[row][col];
  if (ch === "." || ch === "o") {
    solo.pacGrid[row][col] = " ";
    const el = solo.pacCellEls[key];
    if (el) el.remove();
    delete solo.pacCellEls[key];
    solo.pacDotsRemaining -= 1;
    if (ch === "o") {
      solo.pacScore += PAC_PELLET_POINTS;
      solo.pacFrightenUntil = Date.now() + PAC_FRIGHTEN_MS;
    } else {
      solo.pacScore += PAC_DOT_POINTS;
    }
    updateGameHudScore();
  }
}

function pacValidDirs(entity, excludeReverse) {
  const dirs = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
  return dirs.filter((d) => {
    if (excludeReverse && d.r === -excludeReverse.r && d.c === -excludeReverse.c) return false;
    return pacMoveEntity(entity, d) !== null;
  });
}

// IA simples: a maior parte do tempo persegue (ou foge, se assustado) o
// jogador por distância de Manhattan; de vez em quando escolhe ao acaso
// para não ficar previsível demais.
function pacGhostChooseDir(ghost) {
  const frightened = Date.now() < solo.pacFrightenUntil;
  let candidates = pacValidDirs(ghost, ghost.dir);
  if (candidates.length === 0) candidates = pacValidDirs(ghost, null);
  if (candidates.length === 0) return { r: 0, c: 0 };

  if (Math.random() < 0.25) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let best = candidates[0];
  let bestDist = frightened ? -Infinity : Infinity;
  candidates.forEach((d) => {
    const next = pacMoveEntity(ghost, d);
    if (!next) return;
    const dist = Math.abs(next.row - solo.pacPlayer.row) + Math.abs(next.col - solo.pacPlayer.col);
    if (frightened ? dist > bestDist : dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  });
  return best;
}

function pacCheckCollisions() {
  const frightened = Date.now() < solo.pacFrightenUntil;
  solo.pacGhosts.forEach((ghost, i) => {
    if (ghost.row === solo.pacPlayer.row && ghost.col === solo.pacPlayer.col) {
      if (frightened) {
        solo.pacScore += PAC_GHOST_POINTS;
        updateGameHudScore();
        ghost.row = ghost.home.row;
        ghost.col = ghost.home.col;
        ghost.dir = { r: 0, c: 0 };
        pacUpdateEntityEl(solo.pacGhostEls[i], ghost);
        els.pacStatus.textContent = `Expulsaste ${ghost.name}! +${PAC_GHOST_POINTS} pts`;
      } else {
        pacLoseLife();
      }
    }
  });
}

function pacLoseLife() {
  solo.pacLives -= 1;
  els.pacLivesLabel.textContent = `Vidas: ${"❤️".repeat(Math.max(0, solo.pacLives))}`;
  if (solo.pacLives <= 0) {
    finishPacman(false);
    return;
  }
  els.pacStatus.textContent = "Apanhado! Cuidado da próxima vez...";
  solo.pacPlayer.row = PAC_ROWS - 2;
  solo.pacPlayer.col = Math.floor(PAC_COLS / 2);
  solo.pacPlayer.dir = { r: 0, c: 0 };
  solo.pacPlayer.nextDir = { r: 0, c: 0 };
  solo.pacGhosts.forEach((g, i) => {
    g.row = g.home.row;
    g.col = g.home.col;
    g.dir = { r: 0, c: 0 };
    pacUpdateEntityEl(solo.pacGhostEls[i], g);
  });
  pacUpdateEntityEl(solo.pacPlayerEl, solo.pacPlayer);
}

function pacTick() {
  if (!solo.pacActive || solo.paused) return;

  let moved = pacMoveEntity(solo.pacPlayer, solo.pacPlayer.nextDir);
  if (moved) {
    solo.pacPlayer.dir = solo.pacPlayer.nextDir;
  } else {
    moved = pacMoveEntity(solo.pacPlayer, solo.pacPlayer.dir);
  }
  if (moved) {
    solo.pacPlayer.row = moved.row;
    solo.pacPlayer.col = moved.col;
    pacEatAt(moved.row, moved.col);
    pacUpdateEntityEl(solo.pacPlayerEl, solo.pacPlayer);
  }

  els.pacMaze.classList.toggle("frighten-mode", Date.now() < solo.pacFrightenUntil);

  solo.pacGhosts.forEach((ghost, i) => {
    const dir = pacGhostChooseDir(ghost);
    const next = pacMoveEntity(ghost, dir);
    if (next) {
      ghost.dir = dir;
      ghost.row = next.row;
      ghost.col = next.col;
      pacUpdateEntityEl(solo.pacGhostEls[i], ghost);
    }
  });

  pacCheckCollisions();

  if (solo.pacActive && solo.pacDotsRemaining <= 0) {
    finishPacman(true);
  }
}

function handlePacmanKeydown(e) {
  if (!solo.pacActive) return;
  const dir = PAC_DIRS[e.key];
  if (!dir) return;
  e.preventDefault();
  solo.pacPlayer.nextDir = dir;
}

function startPacman() {
  solo.pacGrid = buildPacmanMaze();
  solo.pacDotsRemaining = 0;
  solo.pacGrid.forEach((row) => row.forEach((ch) => {
    if (ch === "." || ch === "o") solo.pacDotsRemaining += 1;
  }));
  solo.pacScore = 0;
  solo.pacLives = PAC_LIVES;
  solo.pacFrightenUntil = 0;
  solo.pacPlayer = { row: PAC_ROWS - 2, col: Math.floor(PAC_COLS / 2), dir: { r: 0, c: 0 }, nextDir: { r: 0, c: 0 } };
  solo.pacGhosts = PAC_GHOSTS_INFO.map((info) => ({
    name: info.name, home: info.home, row: info.home.row, col: info.home.col, dir: { r: 0, c: 0 },
  }));
  solo.pacActive = true;

  els.pacStatus.textContent = "";
  els.pacLivesLabel.textContent = `Vidas: ${"❤️".repeat(PAC_LIVES)}`;
  showScreen("solo-pacman");
  renderPacmanMaze();
  pacUpdateEntityEl(solo.pacPlayerEl, solo.pacPlayer);
  solo.pacGhosts.forEach((g, i) => pacUpdateEntityEl(solo.pacGhostEls[i], g));

  showGameHud(() => solo.pacScore);
  solo.pacKeyHandler = handlePacmanKeydown;
  showTouchControls();
  solo.pacResizeHandler = () => { if (solo.pacActive) fitPacmanMaze(); };
  window.addEventListener("resize", solo.pacResizeHandler);
  document.addEventListener("keydown", solo.pacKeyHandler);
  clearInterval(solo.pacTickId);
  solo.pacTickId = setInterval(pacTick, PAC_TICK_MS);

  registerActiveGame({
    pauseShift: (ms) => { solo.pacFrightenUntil += ms; },
    skip: () => finishPacman(false),
    cleanup: () => {
      solo.pacActive = false;
      clearInterval(solo.pacTickId);
      document.removeEventListener("keydown", solo.pacKeyHandler);
      window.removeEventListener("resize", solo.pacResizeHandler);
      hideTouchControls();
    },
  });
}

function finishPacman(won) {
  if (!solo.pacActive) return;
  solo.pacActive = false;
  clearInterval(solo.pacTickId);
  document.removeEventListener("keydown", solo.pacKeyHandler);
  window.removeEventListener("resize", solo.pacResizeHandler);
  hideTouchControls();

  const bonus = Math.min(solo.pacScore, PAC_MAX_BONUS);
  solo.runScore += bonus;
  const resultText = won
    ? `Comeste tudo! +${bonus} pts bónus!`
    : `As comidas apanharam-te — +${bonus} pts bónus mesmo assim.`;
  showMinigameEnd({ gameLabel: "Kota Corre!", points: bonus, favoriteKey: "pacman", resultText });
}

// --- Mini-Golfe: 3 buracos, aceleração pelas setas/WASD (mantidas
// premidas), atrito e ressaltos nas paredes; pontuação por rapidez. ---

function golfRenderHole() {
  const hole = GOLF_HOLES[solo.golfHoleIndex];
  els.golfCourse.innerHTML = "";
  solo.golfWorldEl = document.createElement("div");
  solo.golfWorldEl.className = "golf-world";
  solo.golfWorldEl.style.width = `${hole.courseW}px`;
  solo.golfWorldEl.style.height = `${hole.courseH}px`;
  els.golfCourse.appendChild(solo.golfWorldEl);

  hole.walls.forEach((w) => {
    const el = document.createElement("div");
    el.className = "golf-wall";
    el.style.left = `${w.x}px`;
    el.style.top = `${w.y}px`;
    el.style.width = `${w.w}px`;
    el.style.height = `${w.h}px`;
    solo.golfWorldEl.appendChild(el);
  });
  const holeEl = document.createElement("div");
  holeEl.className = "golf-hole";
  holeEl.style.left = `${hole.hole.x}px`;
  holeEl.style.top = `${hole.hole.y}px`;
  solo.golfWorldEl.appendChild(holeEl);

  solo.golfBallEl = document.createElement("div");
  solo.golfBallEl.className = "golf-ball";
  solo.golfWorldEl.appendChild(solo.golfBallEl);
}

// Move a bola dentro do mundo E desloca a câmara (o .golf-world inteiro)
// para a bola ficar sempre centrada na parte visível do ecrã — o percurso
// é maior do que o ecrã, tal como um jogo de ação normal.
function golfUpdateBallEl() {
  solo.golfBallEl.style.left = `${solo.golfBallX}px`;
  solo.golfBallEl.style.top = `${solo.golfBallY}px`;

  const hole = GOLF_HOLES[solo.golfHoleIndex];
  const viewportW = els.golfCourse.clientWidth;
  const viewportH = els.golfCourse.clientHeight;
  const camX = Math.max(0, Math.min(solo.golfBallX - viewportW / 2, hole.courseW - viewportW));
  const camY = Math.max(0, Math.min(solo.golfBallY - viewportH / 2, hole.courseH - viewportH));
  solo.golfWorldEl.style.transform = `translate(${-camX}px, ${-camY}px)`;
}

function golfStartHole() {
  const hole = GOLF_HOLES[solo.golfHoleIndex];
  solo.golfBallX = hole.start.x;
  solo.golfBallY = hole.start.y;
  solo.golfVX = 0;
  solo.golfVY = 0;
  solo.golfHoleStartedAt = Date.now();
  els.golfHoleInfo.textContent = `Buraco ${solo.golfHoleIndex + 1}/${GOLF_HOLES.length}`;
  els.golfStatus.textContent = "";
  golfRenderHole();
  golfUpdateBallEl();
  solo.golfLastFrame = performance.now();
  requestAnimationFrame(golfTick);
}

function golfTick(now) {
  if (!solo.golfActive) return;
  if (solo.paused) {
    solo.golfLastFrame = now;
    requestAnimationFrame(golfTick);
    return;
  }
  const dt = Math.min((now - solo.golfLastFrame) / 1000, 0.05);
  solo.golfLastFrame = now;

  let ax = 0, ay = 0;
  if (solo.golfKeys.up) ay -= 1;
  if (solo.golfKeys.down) ay += 1;
  if (solo.golfKeys.left) ax -= 1;
  if (solo.golfKeys.right) ax += 1;
  if (ax !== 0 || ay !== 0) {
    const len = Math.hypot(ax, ay);
    solo.golfVX += (ax / len) * GOLF_ACCEL * dt;
    solo.golfVY += (ay / len) * GOLF_ACCEL * dt;
  }

  const dragFactor = Math.max(0, 1 - GOLF_DRAG * dt);
  solo.golfVX *= dragFactor;
  solo.golfVY *= dragFactor;

  const speed = Math.hypot(solo.golfVX, solo.golfVY);
  if (speed > GOLF_MAX_SPEED) {
    solo.golfVX = (solo.golfVX / speed) * GOLF_MAX_SPEED;
    solo.golfVY = (solo.golfVY / speed) * GOLF_MAX_SPEED;
  }

  let newX = solo.golfBallX + solo.golfVX * dt;
  let newY = solo.golfBallY + solo.golfVY * dt;

  const hole = GOLF_HOLES[solo.golfHoleIndex];
  hole.walls.forEach((w) => {
    const closestX = Math.max(w.x, Math.min(newX, w.x + w.w));
    const closestY = Math.max(w.y, Math.min(newY, w.y + w.h));
    const dx = newX - closestX;
    const dy = newY - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < GOLF_BALL_RADIUS * GOLF_BALL_RADIUS) {
      const dist = Math.sqrt(distSq) || 0.01;
      const nx = dx / dist, ny = dy / dist;
      newX = closestX + nx * GOLF_BALL_RADIUS;
      newY = closestY + ny * GOLF_BALL_RADIUS;
      const vDotN = solo.golfVX * nx + solo.golfVY * ny;
      solo.golfVX -= 2 * vDotN * nx * GOLF_BOUNCE_LOSS;
      solo.golfVY -= 2 * vDotN * ny * GOLF_BOUNCE_LOSS;
    }
  });

  if (newX <= GOLF_BALL_RADIUS || newX >= hole.courseW - GOLF_BALL_RADIUS) solo.golfVX *= -0.6;
  if (newY <= GOLF_BALL_RADIUS || newY >= hole.courseH - GOLF_BALL_RADIUS) solo.golfVY *= -0.6;
  newX = Math.max(GOLF_BALL_RADIUS, Math.min(hole.courseW - GOLF_BALL_RADIUS, newX));
  newY = Math.max(GOLF_BALL_RADIUS, Math.min(hole.courseH - GOLF_BALL_RADIUS, newY));

  solo.golfBallX = newX;
  solo.golfBallY = newY;
  golfUpdateBallEl();

  const distToHole = Math.hypot(newX - hole.hole.x, newY - hole.hole.y);
  if (distToHole < GOLF_HOLE_RADIUS) {
    golfCompleteHole();
    return;
  }

  requestAnimationFrame(golfTick);
}

function golfCompleteHole() {
  const elapsed = (Date.now() - solo.golfHoleStartedAt) / 1000;
  const points = Math.max(GOLF_POINTS_PER_HOLE_MIN, Math.round(GOLF_POINTS_PER_HOLE_MAX - elapsed * 1.2));
  solo.golfScore += points;
  updateGameHudScore();
  els.golfStatus.textContent = `Buraco ${solo.golfHoleIndex + 1} em ${elapsed.toFixed(1)}s — +${points} pts!`;
  solo.golfHoleIndex += 1;

  clearTimeout(solo.golfAdvanceTimeoutId);
  if (solo.golfHoleIndex >= GOLF_HOLES.length) {
    solo.golfAdvanceTimeoutId = setTimeout(() => finishGolf(true), 1200);
  } else {
    solo.golfAdvanceTimeoutId = setTimeout(() => golfStartHole(), 1200);
  }
}

function golfHandleKey(e, isDown) {
  if (!solo.golfActive) return;
  const dir = PAC_DIRS[e.key];
  if (!dir) return;
  e.preventDefault();
  if (dir.r < 0) solo.golfKeys.up = isDown;
  else if (dir.r > 0) solo.golfKeys.down = isDown;
  else if (dir.c < 0) solo.golfKeys.left = isDown;
  else if (dir.c > 0) solo.golfKeys.right = isDown;
}

function startGolf() {
  solo.golfActive = true;
  solo.golfHoleIndex = 0;
  solo.golfScore = 0;
  solo.golfKeys = { up: false, down: false, left: false, right: false };
  showScreen("solo-golf");
  showGameHud(() => solo.golfScore);

  solo.golfKeydownHandler = (e) => golfHandleKey(e, true);
  showTouchControls();
  solo.golfKeyupHandler = (e) => golfHandleKey(e, false);
  document.addEventListener("keydown", solo.golfKeydownHandler);
  document.addEventListener("keyup", solo.golfKeyupHandler);

  registerActiveGame({
    skip: () => finishGolf(false),
    cleanup: () => {
      solo.golfActive = false;
      clearTimeout(solo.golfAdvanceTimeoutId);
      document.removeEventListener("keydown", solo.golfKeydownHandler);
      hideTouchControls();
      document.removeEventListener("keyup", solo.golfKeyupHandler);
    },
  });

  golfStartHole();
}

function finishGolf(wonAll) {
  if (!solo.golfActive) return;
  solo.golfActive = false;
  clearTimeout(solo.golfAdvanceTimeoutId);
  document.removeEventListener("keydown", solo.golfKeydownHandler);
  hideTouchControls();
  document.removeEventListener("keyup", solo.golfKeyupHandler);

  const bonus = Math.min(solo.golfScore, GOLF_MAX_BONUS);
  solo.runScore += bonus;
  const resultText = wonAll
    ? `Acabaste os ${GOLF_HOLES.length} buracos! +${bonus} pts bónus!`
    : `+${bonus} pts bónus pelos buracos que fizeste.`;
  showMinigameEnd({ gameLabel: "Mini-Golfe", points: bonus, favoriteKey: "golf", resultText });
}

// --- "Descartando Juntos": mini-jogo de cartas inspirado no Balatro. Junta
// cartas de um baralho de 52 para formar combinações de póquer, ganha
// fichas para bater a pontuação-alvo de cada "blind" antes de esgotares
// as jogadas, e usa o dinheiro ganho para comprar coringas que reforçam a
// pontuação das jogadas seguintes. ---
const CARD_SUITS = [
  { key: "espadas", symbol: "♠", color: "dark" },
  { key: "copas", symbol: "♥", color: "red" },
  { key: "ouros", symbol: "♦", color: "red" },
  { key: "paus", symbol: "♣", color: "dark" },
];
const CARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function cardChipValue(rank) {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}

const CARD_HAND_TYPES = [
  { key: "high", label: "Carta Alta", baseChips: 5, baseMult: 1 },
  { key: "pair", label: "Par", baseChips: 10, baseMult: 2 },
  { key: "twopair", label: "Duplo Par", baseChips: 20, baseMult: 2 },
  { key: "trips", label: "Trinca", baseChips: 30, baseMult: 3 },
  { key: "straight", label: "Sequência", baseChips: 30, baseMult: 4 },
  { key: "flush", label: "Flush", baseChips: 35, baseMult: 4 },
  { key: "fullhouse", label: "Full House", baseChips: 40, baseMult: 4 },
  { key: "quads", label: "Poker (4 iguais)", baseChips: 60, baseMult: 7 },
  { key: "straightflush", label: "Straight Flush", baseChips: 100, baseMult: 8 },
];
function cardHandTypeByKey(key) {
  return CARD_HAND_TYPES.find((h) => h.key === key);
}

const CARD_BLINDS = [90, 180, 320, 480, 700];
const CARD_HAND_SIZE = 7;
const CARD_MAX_PLAYS = 4;
const CARD_MAX_DISCARDS = 3;
const CARD_MAX_SELECT = 5;
const CARD_JOKER_PRICE = 4;
const CARD_JOKER_SLOTS = 5;
const CARD_MAX_BONUS = 150;

const CARD_JOKER_POOL = [
  {
    key: "ganancioso", name: "Palhaço Ganancioso",
    desc: "+4 de mult. se a jogada tiver par ou melhor.",
    apply: (ctx) => { if (ctx.handType.key !== "high") ctx.mult += 4; },
  },
  {
    key: "rei", name: "Rei do Ouro",
    desc: "+20 fichas em cada jogada.",
    apply: (ctx) => { ctx.chips += 20; },
  },
  {
    key: "sorte", name: "Sorte do Principiante",
    desc: "x1.5 no mult. em jogadas de Flush.",
    apply: (ctx) => { if (ctx.handType.key === "flush" || ctx.handType.key === "straightflush") ctx.mult *= 1.5; },
  },
  {
    key: "ases", name: "Colecionador de Ases",
    desc: "+3 de mult. por cada Ás que contar para a jogada.",
    apply: (ctx) => { ctx.mult += 3 * ctx.scoringCards.filter((c) => c.rank === "A").length; },
  },
  {
    key: "parceiro", name: "Parceiro Fiel",
    desc: "+1 de mult. por cada carta jogada.",
    apply: (ctx) => { ctx.mult += ctx.cards.length; },
  },
  {
    key: "sortudo", name: "Sortudo",
    desc: "15% de hipótese de duplicar o mult. em cada jogada.",
    apply: (ctx) => { if (Math.random() < 0.15) ctx.mult *= 2; },
  },
  // Coringas que mudam as REGRAS do blind (não só a pontuação) — aplicados
  // uma vez no início de cada blind, em cardComputeBlindSetup().
  {
    key: "turbo", name: "Baralho Turbo",
    desc: "+1 jogada em cada blind.",
    setupModifier: (setup) => { setup.plays += 1; },
  },
  {
    key: "reciclagem", name: "Reciclagem Rápida",
    desc: "+1 descarte em cada blind.",
    setupModifier: (setup) => { setup.discards += 1; },
  },
  {
    key: "maomaior", name: "Mão Maior",
    desc: "+2 cartas na mão em cada blind.",
    setupModifier: (setup) => { setup.handSize += 2; },
  },
];

// Aplica os coringas que mudam as regras (jogadas/descartes/tamanho da
// mão) para o blind que está a começar — chamado uma vez por blind.
function cardComputeBlindSetup() {
  const setup = { plays: CARD_MAX_PLAYS, discards: CARD_MAX_DISCARDS, handSize: CARD_HAND_SIZE };
  solo.cardJokers.forEach((key) => {
    const joker = CARD_JOKER_POOL.find((j) => j.key === key);
    if (joker?.setupModifier) joker.setupModifier(setup);
  });
  return setup;
}

function cardBuildDeck() {
  const deck = [];
  CARD_SUITS.forEach((suit) => {
    CARD_RANKS.forEach((rank) => {
      deck.push({ suit: suit.key, symbol: suit.symbol, color: suit.color, rank });
    });
  });
  return shuffleArray(deck);
}

// Avalia exatamente as cartas selecionadas (não a melhor combinação de 5
// dentro da mão inteira) — tal como no Balatro, cabe ao jogador escolher
// bem o que joga.
function cardEvaluateHand(cards) {
  const counts = {};
  cards.forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  const groups = Object.values(counts).sort((a, b) => b - a);
  const isFlush = cards.length >= 5 && cards.every((c) => c.suit === cards[0].suit);
  const orders = [...new Set(cards.map((c) => CARD_RANKS.indexOf(c.rank)))].sort((a, b) => a - b);
  let isStraight = false;
  if (cards.length >= 5 && orders.length === cards.length) {
    isStraight = orders[orders.length - 1] - orders[0] === cards.length - 1;
  }

  let key;
  if (isStraight && isFlush) key = "straightflush";
  else if (groups[0] === 4) key = "quads";
  else if (groups[0] === 3 && groups[1] === 2) key = "fullhouse";
  else if (isFlush) key = "flush";
  else if (isStraight) key = "straight";
  else if (groups[0] === 3) key = "trips";
  else if (groups[0] === 2 && groups[1] === 2) key = "twopair";
  else if (groups[0] === 2) key = "pair";
  else key = "high";

  return cardHandTypeByKey(key);
}

// Tal como no Balatro, só as cartas que FORMAM a combinação contam fichas
// — um kicker que não faz parte do par/trinca/etc. não soma nada.
function cardScoringCards(cards, handType) {
  const key = handType.key;
  if (key === "straight" || key === "flush" || key === "fullhouse" || key === "straightflush") {
    return cards; // a mão inteira faz parte da combinação
  }
  const counts = {};
  cards.forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  if (key === "quads" || key === "trips" || key === "pair") {
    const n = key === "quads" ? 4 : key === "trips" ? 3 : 2;
    const rank = Object.keys(counts).find((r) => counts[r] === n);
    return cards.filter((c) => c.rank === rank);
  }
  if (key === "twopair") {
    const ranks = Object.keys(counts).filter((r) => counts[r] === 2);
    return cards.filter((c) => ranks.includes(c.rank));
  }
  // carta alta: só a carta de maior valor conta
  const best = [...cards].sort((a, b) => cardChipValue(b.rank) - cardChipValue(a.rank))[0];
  return [best];
}

function cardScorePlay(cards) {
  const handType = cardEvaluateHand(cards);
  const scoringCards = cardScoringCards(cards, handType);
  const ctx = { cards, scoringCards, handType, chips: handType.baseChips, mult: handType.baseMult };
  scoringCards.forEach((c) => { ctx.chips += cardChipValue(c.rank); });
  solo.cardJokers.forEach((jokerKey) => {
    const joker = CARD_JOKER_POOL.find((j) => j.key === jokerKey);
    if (joker?.apply) joker.apply(ctx);
  });
  const total = Math.round(ctx.chips * ctx.mult);
  return { handType, chips: ctx.chips, mult: ctx.mult, total, scoringCards };
}

function cardRenderCardEl(card, index, { selectable, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `playing-card ${card.color === "red" ? "playing-card-red" : "playing-card-dark"}`;
  btn.innerHTML = `<span class="playing-card-rank">${card.rank}</span><span class="playing-card-suit">${card.symbol}</span>`;
  if (selectable) {
    btn.classList.toggle("selected", solo.cardSelected.has(index));
    btn.addEventListener("click", () => onClick(index));
  }
  return btn;
}

function cardRenderHandTypePreview() {
  const selectedCards = [...solo.cardSelected].map((i) => solo.cardHand[i]);
  if (selectedCards.length === 0) {
    els.cardHandTypePreview.textContent = "Seleciona até 5 cartas.";
    return;
  }
  const preview = cardScorePlay(selectedCards);
  const countLabel = preview.scoringCards.length < selectedCards.length
    ? ` (${preview.scoringCards.length}/${selectedCards.length} cartas contam)`
    : "";
  els.cardHandTypePreview.textContent =
    `${preview.handType.label}${countLabel} — ${preview.chips} fichas x ${preview.mult.toFixed(1).replace(/\.0$/, "")} mult. = ${preview.total} pts`;
}

function cardRenderJokerRow() {
  els.cardJokerRow.innerHTML = "";
  if (solo.cardJokers.length === 0) {
    els.cardJokerRow.classList.add("hidden");
    return;
  }
  els.cardJokerRow.classList.remove("hidden");
  solo.cardJokers.forEach((key) => {
    const joker = CARD_JOKER_POOL.find((j) => j.key === key);
    if (!joker) return;
    const chip = document.createElement("span");
    chip.className = "joker-chip";
    chip.title = joker.desc;
    chip.textContent = joker.name;
    els.cardJokerRow.appendChild(chip);
  });
}

function cardRenderHand() {
  els.cardHandArea.innerHTML = "";
  solo.cardHand.forEach((card, i) => {
    const el = cardRenderCardEl(card, i, { selectable: true, onClick: cardToggleSelect });
    els.cardHandArea.appendChild(el);
  });
  cardRenderHandTypePreview();
  cardRenderJokerRow();
  els.cardPlayBtn.disabled = solo.cardSelected.size === 0 || solo.cardPlaysLeft <= 0;
  els.cardDiscardBtn.disabled = solo.cardSelected.size === 0 || solo.cardDiscardsLeft <= 0;
}

function cardRenderStats() {
  const target = CARD_BLINDS[solo.cardBlindIndex];
  els.cardBlindInfo.textContent = `Blind ${solo.cardBlindIndex + 1}/${CARD_BLINDS.length} — alvo: ${target} pts`;
  els.cardStats.textContent =
    `Pontos: ${solo.cardBlindScore}/${target} · Jogadas: ${solo.cardPlaysLeft} · Descartes: ${solo.cardDiscardsLeft} · 💰 ${solo.cardMoney}`;
}

function cardToggleSelect(index) {
  if (solo.cardSelected.has(index)) {
    solo.cardSelected.delete(index);
  } else if (solo.cardSelected.size < CARD_MAX_SELECT) {
    solo.cardSelected.add(index);
  }
  cardRenderHand();
}

function cardDrawUpToHandSize() {
  const handSize = solo.cardHandSize || CARD_HAND_SIZE;
  while (solo.cardHand.length < handSize && solo.cardDeck.length > 0) {
    solo.cardHand.push(solo.cardDeck.pop());
  }
}

function cardPlaySelected() {
  if (!solo.cardActive || solo.cardPhase !== "playing") return;
  if (solo.cardSelected.size === 0 || solo.cardPlaysLeft <= 0) return;
  const indexes = [...solo.cardSelected].sort((a, b) => b - a);
  const playedCards = indexes.map((i) => solo.cardHand[i]).reverse();
  const result = cardScorePlay(playedCards);

  indexes.forEach((i) => solo.cardHand.splice(i, 1));
  solo.cardSelected.clear();
  solo.cardPlaysLeft -= 1;
  solo.cardBlindScore += result.total;
  solo.cardTotalChips += result.total;
  updateGameHudScore();

  els.cardPlayArea.innerHTML = "";
  const summary = document.createElement("p");
  summary.className = "hint";
  summary.textContent = `${result.handType.label}: ${result.chips} fichas x ${result.mult.toFixed(1).replace(/\.0$/, "")} = +${result.total} pts`;
  els.cardPlayArea.appendChild(summary);
  cardRenderStats();

  if (solo.cardBlindScore >= CARD_BLINDS[solo.cardBlindIndex]) {
    cardWinBlind();
    return;
  }
  if (solo.cardPlaysLeft <= 0) {
    finishCardGame(false);
    return;
  }
  cardDrawUpToHandSize();
  cardRenderHand();
}

function cardDiscardSelected() {
  if (!solo.cardActive || solo.cardPhase !== "playing") return;
  if (solo.cardSelected.size === 0 || solo.cardDiscardsLeft <= 0) return;
  const indexes = [...solo.cardSelected].sort((a, b) => b - a);
  indexes.forEach((i) => solo.cardHand.splice(i, 1));
  solo.cardSelected.clear();
  solo.cardDiscardsLeft -= 1;
  cardDrawUpToHandSize();
  cardRenderHand();
  cardRenderStats();
}

function cardWinBlind() {
  const money = 3 + solo.cardPlaysLeft + solo.cardDiscardsLeft;
  solo.cardMoney += money;
  if (solo.cardBlindIndex >= CARD_BLINDS.length - 1) {
    finishCardGame(true);
    return;
  }
  cardOpenShop(money);
}

function cardOpenShop(moneyEarned) {
  solo.cardPhase = "shop";
  const available = CARD_JOKER_POOL.filter((j) => !solo.cardJokers.includes(j.key));
  solo.cardShopOffers = shuffleArray(available).slice(0, 2);
  els.cardShopMoney.textContent = `Ganhaste 💰 ${moneyEarned} por vencer o blind. Tens 💰 ${solo.cardMoney} no total.`;
  els.cardShopOffers.innerHTML = "";
  if (solo.cardShopOffers.length === 0 || solo.cardJokers.length >= CARD_JOKER_SLOTS) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = solo.cardJokers.length >= CARD_JOKER_SLOTS
      ? "Já tens o máximo de coringas — segue em frente!"
      : "Sem coringas novos disponíveis desta vez.";
    els.cardShopOffers.appendChild(p);
  } else {
    solo.cardShopOffers.forEach((joker) => {
      const card = document.createElement("div");
      card.className = "joker-shop-card";
      const canAfford = solo.cardMoney >= CARD_JOKER_PRICE;
      card.innerHTML = `<strong>${joker.name}</strong><p class="hint small">${joker.desc}</p>`;
      const buyBtn = document.createElement("button");
      buyBtn.textContent = `Comprar (💰 ${CARD_JOKER_PRICE})`;
      buyBtn.disabled = !canAfford;
      buyBtn.addEventListener("click", () => cardBuyJoker(joker.key));
      card.appendChild(buyBtn);
      els.cardShopOffers.appendChild(card);
    });
  }
  els.cardTable.classList.add("hidden");
  els.cardShopPanel.classList.remove("hidden");
}

function cardBuyJoker(key) {
  if (solo.cardMoney < CARD_JOKER_PRICE || solo.cardJokers.length >= CARD_JOKER_SLOTS) return;
  if (solo.cardJokers.includes(key)) return;
  solo.cardMoney -= CARD_JOKER_PRICE;
  solo.cardJokers.push(key);
  cardRenderJokerRow();
  cardOpenShop(0);
  els.cardShopMoney.textContent = `Tens 💰 ${solo.cardMoney} no total.`;
}

els.cardShopContinueBtn.addEventListener("click", () => {
  els.cardShopPanel.classList.add("hidden");
  els.cardTable.classList.remove("hidden");
  solo.cardPhase = "playing";
  solo.cardBlindIndex += 1;
  solo.cardBlindScore = 0;
  const setup = cardComputeBlindSetup();
  solo.cardPlaysLeft = setup.plays;
  solo.cardDiscardsLeft = setup.discards;
  solo.cardHandSize = setup.handSize;
  solo.cardDeck = cardBuildDeck();
  solo.cardHand = [];
  solo.cardSelected.clear();
  cardDrawUpToHandSize();
  els.cardPlayArea.innerHTML = "";
  cardRenderHand();
  cardRenderStats();
});

function startCardGame() {
  solo.cardActive = true;
  solo.cardPhase = "playing";
  solo.cardBlindIndex = 0;
  solo.cardBlindScore = 0;
  solo.cardMoney = 0;
  solo.cardJokers = [];
  solo.cardTotalChips = 0;
  const setup = cardComputeBlindSetup(); // sem coringas ainda no 1º blind, mas mantém a lógica única
  solo.cardPlaysLeft = setup.plays;
  solo.cardDiscardsLeft = setup.discards;
  solo.cardHandSize = setup.handSize;
  solo.cardDeck = cardBuildDeck();
  solo.cardHand = [];
  solo.cardSelected = new Set();
  els.cardShopPanel.classList.add("hidden");
  els.cardTable.classList.remove("hidden");
  els.cardPlayArea.innerHTML = "";
  cardDrawUpToHandSize();
  showScreen("solo-cards");
  showGameHud(() => solo.cardTotalChips);
  cardRenderHand();
  cardRenderStats();

  registerActiveGame({
    skip: () => finishCardGame(false),
    cleanup: () => { solo.cardActive = false; },
  });
}

function finishCardGame(wonAll) {
  if (!solo.cardActive) return;
  solo.cardActive = false;
  const bonus = Math.min(Math.round(solo.cardTotalChips / 10), CARD_MAX_BONUS);
  solo.runScore += bonus;
  const resultText = wonAll
    ? `Venceste todos os ${CARD_BLINDS.length} blinds! ${solo.cardTotalChips} pts em jogadas — +${bonus} pts bónus!`
    : `Chegaste ao blind ${solo.cardBlindIndex + 1}/${CARD_BLINDS.length}. ${solo.cardTotalChips} pts em jogadas — +${bonus} pts bónus.`;
  showMinigameEnd({ gameLabel: "Descartando Juntos", points: bonus, favoriteKey: "cards", resultText });
}

// --- "Estrada Maluca": corrida sem fim em 3 faixas — desvia dos carros que
// vêm na tua direção, a velocidade sobe com o tempo. Pontos por sobreviver
// e por cada carro que ultrapassas. ---
const CAR_LANES = 3;
const CAR_ROAD_H = 640;
const CAR_WIDTH = 56;
const CAR_HEIGHT = 88;
const CAR_PLAYER_Y = 500;
const CAR_BASE_SPEED = 240; // px/s
const CAR_MAX_SPEED = 620;
const CAR_SPEED_RAMP = 4.5; // px/s por segundo
const CAR_SPAWN_INTERVAL_START_MS = 950;
const CAR_SPAWN_INTERVAL_MIN_MS = 380;
const CAR_SPAWN_RAMP_MS_PER_S = 12;
const CAR_POINTS_PER_SECOND = 2;
const CAR_DODGE_BONUS = 3;
const CAR_MAX_BONUS = 140;
// Sem tons dourados/laranja perto de var(--accent), para o carro do
// jogador nunca se confundir visualmente com um obstáculo.
const CAR_COLORS = ["#c65d4a", "#5c7e91", "#6c8a4f", "#8a6bb0", "#4a7a8c"];

function carRoadWidth() {
  return CAR_LANES * (CAR_WIDTH + 24) + 24;
}

function carRenderRoad() {
  els.carRoad.innerHTML = "";
  els.carRoad.style.width = `${carRoadWidth()}px`;
  els.carRoad.style.height = `${CAR_ROAD_H}px`;
  solo.carLaneLineEls = [];
  for (let i = 1; i < CAR_LANES; i++) {
    const line = document.createElement("div");
    line.className = "car-lane-line";
    line.style.left = `${i * (carRoadWidth() / CAR_LANES)}px`;
    els.carRoad.appendChild(line);
    solo.carLaneLineEls.push(line);
  }
  solo.carPlayerEl = document.createElement("div");
  solo.carPlayerEl.className = "car-player";
  solo.carPlayerEl.style.width = `${CAR_WIDTH}px`;
  solo.carPlayerEl.style.height = `${CAR_HEIGHT}px`;
  solo.carPlayerEl.style.top = `${CAR_PLAYER_Y}px`;
  els.carRoad.appendChild(solo.carPlayerEl);
  carUpdatePlayerX();
}

function carLaneCenterX(lane) {
  const laneW = carRoadWidth() / CAR_LANES;
  return lane * laneW + laneW / 2;
}

function carUpdatePlayerX() {
  solo.carPlayerEl.style.left = `${carLaneCenterX(solo.carLane) - CAR_WIDTH / 2}px`;
}

function carHandleKey(e, isDown) {
  if (!solo.carActive || !isDown) return;
  const dir = PAC_DIRS[e.key];
  if (!dir) return;
  e.preventDefault();
  if (dir.c < 0 && solo.carLane > 0) { solo.carLane -= 1; carUpdatePlayerX(); }
  else if (dir.c > 0 && solo.carLane < CAR_LANES - 1) { solo.carLane += 1; carUpdatePlayerX(); }
}

function startCarGame() {
  solo.carActive = true;
  solo.carLane = 1;
  solo.carScore = 0;
  solo.carSpeed = CAR_BASE_SPEED;
  solo.carSpawnIntervalMs = CAR_SPAWN_INTERVAL_START_MS;
  solo.carElapsed = 0;
  solo.carLastSpawnAt = 0;
  solo.carObstacles = [];
  solo.carObstacleEls = {};
  solo.carNextObstacleId = 1;
  els.carStatus.textContent = "";
  carRenderRoad();
  showScreen("solo-cargame");
  showGameHud(() => Math.round(solo.carScore));

  solo.carKeyHandler = (e) => carHandleKey(e, true);
  showTouchControls({ axis: "horizontal" });
  document.addEventListener("keydown", solo.carKeyHandler);

  registerActiveGame({
    skip: () => finishCarGame(),
    cleanup: () => {
      solo.carActive = false;
      document.removeEventListener("keydown", solo.carKeyHandler);
      hideTouchControls();
    },
  });

  solo.carLastFrame = performance.now();
  requestAnimationFrame(carTick);
}

function carSpawnObstacle() {
  const lane = Math.floor(Math.random() * CAR_LANES);
  const id = solo.carNextObstacleId++;
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  solo.carObstacles.push({ id, lane, y: -CAR_HEIGHT, passed: false });
  const el = document.createElement("div");
  el.className = "car-obstacle";
  el.style.width = `${CAR_WIDTH}px`;
  el.style.height = `${CAR_HEIGHT}px`;
  el.style.background = color;
  els.carRoad.appendChild(el);
  solo.carObstacleEls[id] = el;
}

function carTick(now) {
  if (!solo.carActive) return;
  if (solo.paused) {
    solo.carLastFrame = now;
    requestAnimationFrame(carTick);
    return;
  }
  const dt = Math.min((now - solo.carLastFrame) / 1000, 0.05);
  solo.carLastFrame = now;
  solo.carElapsed += dt;

  solo.carSpeed = Math.min(CAR_MAX_SPEED, CAR_BASE_SPEED + solo.carElapsed * CAR_SPEED_RAMP);
  solo.carSpawnIntervalMs = Math.max(CAR_SPAWN_INTERVAL_MIN_MS, CAR_SPAWN_INTERVAL_START_MS - solo.carElapsed * CAR_SPAWN_RAMP_MS_PER_S);

  if (now - solo.carLastSpawnAt > solo.carSpawnIntervalMs) {
    solo.carLastSpawnAt = now;
    carSpawnObstacle();
  }

  let collided = false;
  solo.carObstacles.forEach((o) => {
    o.y += solo.carSpeed * dt;
    const el = solo.carObstacleEls[o.id];
    el.style.left = `${carLaneCenterX(o.lane) - CAR_WIDTH / 2}px`;
    el.style.top = `${o.y}px`;

    const overlapsY = o.y + CAR_HEIGHT > CAR_PLAYER_Y && o.y < CAR_PLAYER_Y + CAR_HEIGHT;
    if (overlapsY && o.lane === solo.carLane) collided = true;

    if (!o.passed && o.y > CAR_PLAYER_Y + CAR_HEIGHT) {
      o.passed = true;
      solo.carScore += CAR_DODGE_BONUS;
    }
  });

  if (collided) {
    finishCarGame();
    return;
  }

  solo.carObstacles = solo.carObstacles.filter((o) => {
    if (o.y > CAR_ROAD_H + CAR_HEIGHT) {
      solo.carObstacleEls[o.id]?.remove();
      delete solo.carObstacleEls[o.id];
      return false;
    }
    return true;
  });

  solo.carScore += CAR_POINTS_PER_SECOND * dt;
  updateGameHudScore();
  els.carStatus.textContent = `${Math.floor(solo.carElapsed)}s — velocidade ${Math.round(solo.carSpeed)}`;
  // As linhas da estrada "correm" a uma velocidade ligada à do jogo, para
  // reforçar a sensação de aceleração, não só os carros a mexerem-se.
  const laneAnimS = Math.max(0.12, 0.5 * (CAR_BASE_SPEED / solo.carSpeed));
  solo.carLaneLineEls.forEach((el) => { el.style.animationDuration = `${laneAnimS}s`; });

  requestAnimationFrame(carTick);
}

function finishCarGame() {
  if (!solo.carActive) return;
  solo.carActive = false;
  document.removeEventListener("keydown", solo.carKeyHandler);
  hideTouchControls();
  const scoreRounded = Math.round(solo.carScore);
  const bonus = Math.min(scoreRounded, CAR_MAX_BONUS);
  solo.runScore += bonus;
  const resultText = `Aguentaste ${Math.floor(solo.carElapsed)}s na estrada — +${bonus} pts bónus!`;
  showMinigameEnd({ gameLabel: "Estrada Maluca", points: bonus, favoriteKey: "car", resultText });
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
      solo.afterMinigame = () => showReadyOverlay(GAME_LABELS.hangman, startSoloHangman, "hangman");
    } else {
      bonus = Math.round(base * challengeMult);
      resultText = `Acertaste "${solo.hangmanWord}"! +${bonus} pts bónus!`;
    }
  } else if (solo.hangmanStreakMode) {
    resultText = `A sequência acabou em ${solo.hangmanStreak} palavra(s) — a palavra era "${solo.hangmanWord}". Recorde: ${account.bestHangmanStreak || 0}.`;
    solo.afterMinigame = () => showReadyOverlay(GAME_LABELS.hangman, () => {
      solo.hangmanStreak = 0;
      solo.hangmanUsedWords = new Set();
      startSoloHangman();
    }, "hangman");
  } else {
    resultText = `Não desta vez — a palavra era "${solo.hangmanWord}".`;
  }

  solo.runScore += bonus;
  showMinigameEnd({ gameLabel: "Forca", points: bonus, favoriteKey: "hangman", resultText });
}
