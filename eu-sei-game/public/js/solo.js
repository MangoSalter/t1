// Modo single-player: totalmente offline, sem Firebase. Uma "run" é uma
// sequência de rondas com dificuldade crescente (menos tempo, mais
// categorias) até não atingires o mínimo de respostas válidas na ronda.
// Sem outros jogadores para votar, só se valida se a resposta começa pela
// letra certa (decisão tomada para o MVP: sem lista de palavras).

import { CATEGORIES, pickLetters, pickCategories } from "./data.js";

const HIGH_SCORE_KEY = "euSei_soloHighScore";

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
  wfEndAt: 0,
  wfActive: false,
};

const els = {
  startBtn: document.getElementById("solo-start-btn"),
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
};

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

els.startBtn.addEventListener("click", startRun);
document.querySelectorAll("[data-solo-leave]").forEach((btn) => {
  btn.addEventListener("click", () => {
    solo.inRound = false;
    showScreen("home");
  });
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
  const catIndexes = pickCategories(numCategories, solo.usedCategories);
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
    if (valid) correctCount += 1;
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

const MINIGAMES = [startReflexMinigame, startWordFlashMinigame];

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
    els.mgStatus.textContent = `Reagiste em ${reactionMs}ms — +${bonus} pts bónus!`;
  }
  solo.runScore += bonus;

  setTimeout(nextRound, 1400);
}

// --- Palavra Relâmpago: escreve o máximo de palavras possível numa letra
// aleatória, contra o tempo. ---

function startWordFlashMinigame() {
  solo.wfLetter = pickLetters(1, new Set(), true)[0];
  solo.wfWords = new Set();
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
  els.wfFeedback.textContent = "";
  const chip = document.createElement("span");
  chip.className = "wf-word-chip";
  chip.textContent = raw;
  els.wfWords.appendChild(chip);
}

function finishWordFlash() {
  solo.wfActive = false;
  const bonus = Math.min(solo.wfWords.size * WF_POINTS_PER_WORD, WF_MAX_BONUS);
  solo.runScore += bonus;
  els.wfStatus.textContent = `${solo.wfWords.size} palavra(s) válida(s) — +${bonus} pts bónus!`;
  setTimeout(nextRound, 1600);
}
