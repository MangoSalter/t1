// Modo single-player: totalmente offline, sem Firebase. Uma "run" é uma
// sequência de rondas com dificuldade crescente (menos tempo, mais
// categorias) até não atingires o mínimo de respostas válidas na ronda.
// Sem outros jogadores para votar, só se valida se a resposta começa pela
// letra certa (decisão tomada para o MVP: sem lista de palavras).

import { CATEGORIES, pickLetters, pickCategories, DEFAULT_CONFIG } from "./data.js";

const HIGH_SCORE_KEY = "euSei_soloHighScore";

const SOLO_BASE_CATEGORIES = 5;
const SOLO_MAX_CATEGORIES = 12;
const SOLO_BASE_TIME = 75;
const SOLO_MIN_TIME = 30;
const SOLO_EXCLUDE_HARD = true;

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
els.continueBtn.addEventListener("click", () => {
  nextRound();
});
els.restartBtn.addEventListener("click", startRun);

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
