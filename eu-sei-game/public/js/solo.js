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

const MEM_PREVIEW_MS = 3000;
const MEM_SHOWN_BASE = 5;
const MEM_SHOWN_MAX = 8;
const MEM_DECOY_COUNT = 5;
const MEM_POINTS_CORRECT = 4;
const MEM_POINTS_WRONG = 2;

const SOLO_HANGMAN_MAX_WRONG = 6;
const SOLO_HANGMAN_WORD_PENALTY = 2;
const SOLO_HANGMAN_MIN_BONUS = 6;
const SOLO_HANGMAN_POINTS_PER_LIFE = 3;
// Lista de reserva para quando ainda não há respostas próprias nesta sessão
// (ex.: a jogar "Forca" avulso, sem ter feito nenhuma ronda do modo clássico).
const HANGMAN_FALLBACK_WORDS = [
  { categoryName: "Países", word: "PORTUGAL" },
  { categoryName: "Países", word: "ANGOLA" },
  { categoryName: "Cor", word: "AMARELO" },
  { categoryName: "Fruta", word: "MANGA" },
  { categoryName: "Animal", word: "ELEFANTE" },
  { categoryName: "Filme", word: "TITANIC" },
  { categoryName: "Desporto", word: "FUTEBOL" },
  { categoryName: "Bebida", word: "AGUA" },
  { categoryName: "Instrumento musical", word: "GUITARRA" },
  { categoryName: "Profissão", word: "PROFESSOR" },
  { categoryName: "Capital", word: "LISBOA" },
  { categoryName: "Peixe", word: "ATUM" },
  { categoryName: "Rede social", word: "INSTAGRAM" },
  { categoryName: "Sobremesa", word: "PUDIM" },
  { categoryName: "Super-herói", word: "BATMAN" },
];

const MARATHON_GAMES = {
  reflex: startReflexMinigame,
  word: startWordFlashMinigame,
  bug: startBugSmashMinigame,
  monkey: startMonkeyRescueMinigame,
  memory: startMemoryMinigame,
  hangman: startSoloHangman,
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
  memActive: false,
  memShownIndexes: new Set(),
  memSelected: new Set(),
  afterMinigame: nextRound,
  pastValidAnswers: [],
  hangmanWord: "",
  hangmanCategoryName: "",
  hangmanGuessedLetters: {},
  hangmanWrongCount: 0,
  hangmanActive: false,
  marathonQueue: [],
  marathonTotalGames: 0,
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

els.menuBtn.addEventListener("click", () => showScreen("solo-menu"));
document.querySelectorAll("[data-solo-home]").forEach((btn) => {
  btn.addEventListener("click", () => showScreen("home"));
});
document.querySelectorAll("[data-solo-leave]").forEach((btn) => {
  btn.addEventListener("click", () => {
    solo.inRound = false;
    solo.hangmanActive = false;
    showScreen("solo-menu");
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
els.playHangmanBtn.addEventListener("click", () => launchStandalone(startSoloHangman));

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

  function tick() {
    if (solo.mgResolved) return;
    if (Date.now() >= solo.mgAppearAt) {
      els.mgCircle.classList.add("visible");
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function resolveMinigame(clickedAt) {
  solo.mgResolved = true;
  els.mgCircle.classList.add("visible");

  let bonus = 0;
  if (clickedAt < solo.mgAppearAt) {
    els.mgStatus.textContent = "Cedo demais! +0 pts bónus.";
  } else {
    const reactionMs = clickedAt - solo.mgAppearAt;
    bonus = Math.max(0, Math.round(MG_MAX_BONUS - reactionMs / 100));
    const best = loadBestReaction();
    if (best === null || reactionMs < best) {
      saveBestReaction(reactionMs);
      els.mgStatus.textContent = `Reagiste em ${reactionMs}ms — +${bonus} pts bónus! Novo recorde pessoal! ⚡`;
    } else {
      els.mgStatus.textContent = `Reagiste em ${reactionMs}ms — +${bonus} pts bónus! (recorde: ${best}ms)`;
    }
  }
  solo.runScore += bonus;

  setTimeout(() => solo.afterMinigame(), 1400);
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

  function tick() {
    if (!solo.wfActive) return;
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
  if (!solo.wfActive) return;
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
}

function finishWordFlash() {
  solo.wfActive = false;
  const bonus = Math.min(solo.wfPoints, WF_MAX_BONUS);
  solo.runScore += bonus;
  els.wfStatus.textContent = `${solo.wfWords.size} palavra(s) válida(s) — +${bonus} pts bónus!`;
  setTimeout(() => solo.afterMinigame(), 1600);
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

  const endAt = Date.now() + BUG_GAME_MS;

  function spawnBug() {
    if (!solo.bugActive) return;
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
    });

    els.bugArena.appendChild(btn);
  }

  function tick() {
    if (!solo.bugActive) return;
    const msLeft = endAt - Date.now();
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
  els.bugStatus.textContent = `+${bonus} pts bónus!`;
  setTimeout(() => solo.afterMinigame(), 1400);
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

  const startedAt = Date.now();
  const endAt = startedAt + MONKEY_GAME_MS;
  let lastFrame = startedAt;

  function spawnMonkey() {
    if (!solo.monkeyActive) return;
    const arenaWidth = els.monkeyArena.clientWidth || 320;
    const x = 20 + Math.random() * Math.max(arenaWidth - 40, 1);
    const golden = Math.random() < MONKEY_GOLDEN_CHANCE;
    const el = document.createElement("div");
    el.className = golden ? "falling-monkey golden" : "falling-monkey";
    el.textContent = golden ? "🐵" : "🐒";
    el.style.left = `${x}px`;
    el.style.top = "-20px";
    els.monkeyArena.appendChild(el);
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const speed = MONKEY_BASE_FALL_SPEED + elapsedSec * MONKEY_SPEED_INCREASE_PER_SEC;
    solo.monkeys.push({ el, x, y: -20, speed, golden });
  }

  function scheduleNextSpawn() {
    if (!solo.monkeyActive) return;
    spawnMonkey();
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const interval = Math.max(
      MONKEY_SPAWN_INTERVAL_MS - elapsedSec * MONKEY_SPAWN_SPEEDUP_PER_SEC,
      MONKEY_MIN_SPAWN_INTERVAL_MS
    );
    solo.monkeySpawnTimeoutId = setTimeout(scheduleNextSpawn, interval);
  }

  function frame() {
    if (!solo.monkeyActive) return;
    const now = Date.now();
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    const arenaHeight = els.monkeyArena.clientHeight || 240;

    solo.monkeys = solo.monkeys.filter((m) => {
      m.y += m.speed * dt;
      m.el.style.top = `${m.y}px`;

      const inCatchZone = m.y >= arenaHeight - 40;
      const alignedWithCatcher = Math.abs(m.x - solo.monkeyCatcherX) <= MONKEY_CATCHER_HALF_WIDTH + 14;
      if (inCatchZone && alignedWithCatcher) {
        solo.monkeyScore += MONKEY_CATCH_POINTS * (m.golden ? MONKEY_GOLDEN_MULTIPLIER : 1);
        m.el.remove();
        return false;
      }
      if (m.y >= arenaHeight) {
        m.el.remove();
        return false;
      }
      return true;
    });

    els.monkeyTimer.textContent = formatSeconds(Math.max(0, Math.ceil((endAt - now) / 1000)));

    if (now >= endAt) {
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
  solo.monkeys.forEach((m) => m.el.remove());
  solo.monkeys = [];

  const bonus = Math.min(solo.monkeyScore, MONKEY_MAX_BONUS);
  solo.runScore += bonus;
  els.monkeyStatus.textContent = `+${bonus} pts bónus!`;
  setTimeout(() => solo.afterMinigame(), 1400);
}

// --- Memória: memoriza categorias mostradas por breves segundos, depois
// identifica-as entre distratoras. Sem pressão de tempo na escolha. ---

function startMemoryMinigame() {
  solo.memActive = true;
  solo.memSelected = new Set();
  els.memStatus.textContent = "";
  els.memConfirmBtn.classList.add("hidden");
  showScreen("solo-minigame-memory");

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
  els.memStatus.textContent = `${correct} certa(s), ${wrong} errada(s) — +${bonus} pts bónus!`;
  setTimeout(() => solo.afterMinigame(), 1600);
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

// --- Forca (solo): pode usar uma das tuas próprias respostas válidas desta
// sessão como "palavra secreta" (não te lembras do que escreveste há 4
// rondas?), ou uma palavra da lista de reserva se ainda não jogaste nada. ---

function pickHangmanWord() {
  if (solo.pastValidAnswers.length > 0 && Math.random() < 0.7) {
    const pick = solo.pastValidAnswers[Math.floor(Math.random() * solo.pastValidAnswers.length)];
    return pick;
  }
  return HANGMAN_FALLBACK_WORDS[Math.floor(Math.random() * HANGMAN_FALLBACK_WORDS.length)];
}

function startSoloHangman() {
  const { categoryName, word } = pickHangmanWord();
  solo.hangmanWord = word;
  solo.hangmanCategoryName = categoryName;
  solo.hangmanGuessedLetters = {};
  solo.hangmanWrongCount = 0;
  solo.hangmanActive = true;
  els.soloHangmanStatus.textContent = "";
  els.soloHangmanGuessControls.classList.remove("hidden");
  renderSoloHangman();
  showScreen("solo-hangman");
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
  els.soloHangmanLives.textContent = `Erros: ${solo.hangmanWrongCount} / ${SOLO_HANGMAN_MAX_WRONG}`;
}

function soloHangmanGuessLetter(letterRaw) {
  if (!solo.hangmanActive) return;
  const letter = letterRaw.toUpperCase();
  if (solo.hangmanGuessedLetters[letter]) return;
  solo.hangmanGuessedLetters[letter] = true;
  if (!solo.hangmanWord.includes(letter)) solo.hangmanWrongCount += 1;
  resolveSoloHangmanTurn();
}

function soloHangmanGuessWord(guessRaw) {
  if (!solo.hangmanActive) return;
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
  if (soloHangmanRevealed()) {
    finishSoloHangman(true);
  } else if (solo.hangmanWrongCount >= SOLO_HANGMAN_MAX_WRONG) {
    finishSoloHangman(false);
  }
}

function finishSoloHangman(won) {
  solo.hangmanActive = false;
  els.soloHangmanGuessControls.classList.add("hidden");
  renderSoloHangman();

  let bonus = 0;
  if (won) {
    const livesLeft = SOLO_HANGMAN_MAX_WRONG - solo.hangmanWrongCount;
    bonus = Math.max(SOLO_HANGMAN_MIN_BONUS, livesLeft * SOLO_HANGMAN_POINTS_PER_LIFE);
    els.soloHangmanStatus.textContent = `Acertaste "${solo.hangmanWord}"! +${bonus} pts bónus!`;
  } else {
    els.soloHangmanStatus.textContent = `Não desta vez — a palavra era "${solo.hangmanWord}".`;
  }
  solo.runScore += bonus;
  setTimeout(() => solo.afterMinigame(), 1800);
}
