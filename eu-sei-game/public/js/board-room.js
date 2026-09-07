// ---------- O QUADRO DE SALA ----------
// Isto vivia dentro do app.js, no meio de tudo o resto. Saiu para módulo
// próprio por uma razão concreta: duas vezes um "usar antes de declarar"
// escapou-se aqui e partiu o ecrã inteiro, porque num ficheiro de cinco mil
// linhas ninguém vê a ordem das declarações. Aqui o quadro tem fronteira: o
// que entra são cinco coisas (o estado da sala, os ecrãs, "sou o anfitrião?"
// e dois ajudantes de texto) e o que sai são duas (desenhar o ecrã, e
// esquecer a narração ao sair). Se um dia isto precisar de mais nada do
// app.js, é sinal de que a fronteira está a ser furada.
import { serverNow } from "./firebase-init.js";
import { say as narrar } from "./voice.js";
import { BOARD_QUIPS, BOARD_CHAOS, BOARD_TOOLS } from "./data.js";
import {
  BOARD_CHAOS_EVERY, BOARD_MODES, BOARD_SETTINGS_SPEC, DEFAULT_BOARD_MODE, DOODLE_BOARD_FULL, HANGMAN_PLAYER_COLORS,
  MAX_TEAMS, WORD_SEP, addHangmanMiss, applyBoardVotes, boardChaosOn, boardSetting,
  canDrawOnBoard, canGuessNow, canSetBoardMode, clearHangmanDoodle, clearHangmanPuzzle, connectedPlayerIds,
  correctCountOf, currentGuesser, finishHangman, fireBoardChaos, freeGuessing, guessesAreAnonymous,
  hangmanGuessers, individualMisses, joinTeam, joinWords, letterAlreadyTried, maskWord,
  matchIsOver, matchRanking, matchWordsTotal, maxMissesOf, missesOfPlayer, modeAllowsTool,
  payBoardMatchScore, boardMatchPayout, boardMatchPaid,
  canAskHelp, askBrasaHelp, serveBrasaHelp, helpCosts, blockedFromWordGuess,
  isWordMode,
  passGuessTurn, passHangmanPen, passHangmanPenRandom, pickHangmanColor, playerColor, playerMask,
  pointsObjectToArray, pushHangmanDoodlePoints, renameTeam, resolveGuess, resolveWordGuess, revealLetter, temPontos,
  sanitizeBoardPoints, setBoardMode, setBoardSetting, setHangmanPuzzle, setPlayMode, setTeamCount,
  splitWordsInput, startNewMatch, submitLetterGuess, submitWordGuess, takenHangmanColors, tallyVotes,
  teamList, teamOfPlayer, teamsLocked, teamsOn, undoLastHangmanStroke, updateHangmanMask,
  solveHangmanWithWinner,
  votePenHolder, votesNeeded, wordHistory, wordsDone, wordsOfMask, wrongLetters,
  wrongWordList,
} from "./room.js";
import { state, screens, isHost } from "./app-state.js";
import { escapeHtml, avatarImgHtml } from "./ui-utils.js";
import { sfx } from "./sfx.js";
import { abrirPaleta } from "./paleta.js";

// O ecrã é inteiro (sai da moldura/cartão normal da app) porque um quadro
// dentro de um cartão não é um quadro. Quem escreve depende do modo: no
// desenho livre a folha é de todos, na Forca só de quem tem a caneta — é o
// canDrawOnBoard do room.js que decide, nunca este ficheiro. O nome "Forca"
// ficou como identificador do mini-jogo desde o tempo em que era só isso.
//
// A tinta NÃO é limitada: os pontos mais antigos não saem para dar lugar aos
// novos. Já saíram, e o efeito era o desenho a desaparecer sozinho enquanto
// se usava a borracha. Agora o quadro tem um teto e, ao chegar lá, diz-o
// (DOODLE_BOARD_FULL) em vez de comer o que já lá estava.

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
  wordGuessForm: document.getElementById("hangman-wordguess-form"),
  helpBtn: document.getElementById("hangman-help-btn"),
  wordGuessInput: document.getElementById("hangman-wordguess-input"),
  wrongWords: document.getElementById("hangman-wrong-words"),
  quip: document.getElementById("hangman-quip"),
  matchOverlay: document.getElementById("hangman-match-overlay"),
  matchTitle: document.getElementById("hangman-match-title"),
  matchSub: document.getElementById("hangman-match-sub"),
  matchRanking: document.getElementById("hangman-match-ranking"),
  matchAgainBtn: document.getElementById("hangman-match-again-btn"),
  matchWait: document.getElementById("hangman-match-wait"),
  matchProgress: document.getElementById("hangman-match-progress"),
  historyBtn: document.getElementById("hangman-history-btn"),
  historyBtnViewer: document.getElementById("hangman-history-btn-viewer"),
  historyOverlay: document.getElementById("hangman-history-overlay"),
  historyList: document.getElementById("hangman-history-list"),
  historyCloseBtn: document.getElementById("hangman-history-close-btn"),
  saveImgBtn: document.getElementById("hangman-save-img-btn"),
  saveImgBtnViewer: document.getElementById("hangman-save-img-btn-viewer"),
  exportBtn: document.getElementById("hangman-export-btn"),
  importBtn: document.getElementById("hangman-import-btn"),
  importInput: document.getElementById("hangman-import-input"),
  matchHistoryBtn: document.getElementById("hangman-match-history-btn"),
  quipWho: document.getElementById("hangman-quip-who"),
  quipText: document.getElementById("hangman-quip-text"),
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
  winnerOverlay: document.getElementById("hangman-winner-overlay"),
  winnerChoices: document.getElementById("hangman-winner-choices"),
  winnerNoneBtn: document.getElementById("hangman-winner-none-btn"),
  winnerCancelBtn: document.getElementById("hangman-winner-cancel-btn"),
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
  paletaBtn: document.getElementById("hangman-paleta-btn"),
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

// O que manda para desenhar já não é ter a caneta, é a regra do modo e do
// momento (ver canDrawOnBoard em room.js).
function hangmanPossoEscrever() {
  return !!state.room && canDrawOnBoard(state.room, state.uid);
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

// O QUADRO JÁ DESENHADO, guardado à parte.
//
// Antes, cada desenho de ecrã repintava tudo desde o princípio — e o ecrã
// redesenha-se a cada mudança na sala, não só quando alguém desenha: um erro,
// uma tentativa, um balão da Dona Manga. Medido num quadro cheio: 500 pontos
// custavam um quadro de imagem (grátis), 8000 custavam 56 ms e 20 000 (o teto)
// custavam 138 ms — sete imagens por segundo, com a mão a arrastar. Numa sala
// com gente a desenhar ao mesmo tempo isso vê-se e sente-se.
//
// Os pontos que já vieram da sala não mudam enquanto ninguém desenha, por isso
// pintam-se UMA vez para uma tela à parte e daí em diante copia-se essa tela de
// uma assentada. Por cima vão só os pontos que ainda estão na mão (os que ainda
// não foram para a rede), que são poucos. A tela guardada refaz-se quando os
// pontos da sala mudam de verdade — e é a contagem mais a última chave que o
// dizem, porque os pontos são só acrescentados, nunca alterados no meio.
const quadroPintado = document.createElement("canvas");
let assinaturaDoQuadro = null;

function assinaturaDosPontos(pontos, w, h) {
  const chaves = Object.keys(pontos || {});
  let ultima = "";
  for (const k of chaves) if (k > ultima) ultima = k;
  return `${chaves.length}|${ultima}|${w}x${h}`;
}

function hangmanDoodleRedraw() {
  if (!hangmanDoodleSyncCanvasSize()) return;
  const canvas = hangmanEls.doodleCanvas;
  const ctx = canvas.getContext("2d");
  const { dpr, rectW, rectH } = hangmanDoodleState;
  const daSala = state.room?.hangman?.doodle?.points;

  const assinatura = assinaturaDosPontos(daSala, canvas.width, canvas.height);
  if (assinatura !== assinaturaDoQuadro) {
    quadroPintado.width = canvas.width;
    quadroPintado.height = canvas.height;
    const cache = quadroPintado.getContext("2d");
    cache.setTransform(dpr, 0, 0, dpr, 0, 0);
    cache.clearRect(0, 0, rectW, rectH);
    pintarPontos(cache, pointsObjectToArray(daSala), rectW, rectH);
    assinaturaDoQuadro = assinatura;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(quadroPintado, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const naMao = [
    ...hangmanDoodleState.pending,
    ...(hangmanDoodleState.shapePending ? [hangmanDoodleState.shapePending] : []),
  ];
  if (naMao.length > 0) pintarPontos(ctx, naMao, rectW, rectH);
}

// O pintor, separado do redesenho do ecrã para a imagem guardada poder usar
// exatamente o mesmo código. Duas cópias disto iam divergir à primeira
// ferramenta nova, e a imagem guardada passaria a mentir sobre o quadro.
function pintarPontos(ctx, points, rectW, rectH) {
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

// --- Guardar e recuperar o quadro da sala ---

function pontosDoQuadro() {
  return pointsObjectToArray(state.room?.hangman?.doodle?.points);
}

function descarregar(url, nome) {
  const a = document.createElement("a");
  a.download = nome;
  a.href = url;
  a.click();
}

function carimbo() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

// A imagem é de quem a quer: qualquer pessoa na sala pode guardar o que está
// no quadro. Não é uma escrita na sala, é uma cópia do que já se vê.
function hangmanGuardarImagem() {
  const pontos = pontosDoQuadro();
  if (pontos.length === 0) return;
  const { rectW, rectH } = hangmanDoodleState;
  if (!rectW || !rectH) return;
  // 2x para a imagem sair nítida sem ficar enorme.
  const escala = 2;
  const out = document.createElement("canvas");
  out.width = Math.round(rectW * escala);
  out.height = Math.round(rectH * escala);
  const ctx = out.getContext("2d");
  // O papel por baixo: sem ele, a imagem abria com fundo preto em muitos
  // visualizadores, porque a tela é transparente onde não há tinta.
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  pintarPontos(ctx, pontos, rectW, rectH);
  descarregar(out.toDataURL("image/png"), `quadro-sala-${carimbo()}.png`);
  hangmanEls.status.textContent = "Imagem guardada.";
}

function hangmanExportar() {
  const pontos = pontosDoQuadro();
  if (pontos.length === 0) return;
  const dados = JSON.stringify({ version: 1, points: pontos });
  const url = URL.createObjectURL(new Blob([dados], { type: "application/json" }));
  descarregar(url, `quadro-sala-${carimbo()}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  hangmanEls.status.textContent = "Quadro exportado.";
}

async function hangmanImportar(ficheiro) {
  if (!ficheiro) return;
  try {
    const lido = JSON.parse(await ficheiro.text());
    const pontos = sanitizeBoardPoints(lido?.points ?? lido);
    if (pontos.length === 0) {
      hangmanEls.status.textContent = "Esse ficheiro não tem nenhum desenho reconhecível.";
      return;
    }
    // ACRESCENTA, não substitui: importar por engano não pode apagar o que a
    // sala tem no quadro, e anular continua a desfazer traço a traço.
    const r = await pushHangmanDoodlePoints(state.code, state.room, state.uid, pontos);
    hangmanEls.status.textContent = r === DOODLE_BOARD_FULL
      ? "O quadro encheu a meio da importação — limpa para continuar."
      : `Importados ${pontos.length} pontos.`;
  } catch {
    hangmanEls.status.textContent = "Não consegui ler esse ficheiro.";
  }
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

// Os pontos vão para a rede em fração da folha (0 a 1), para funcionarem em
// qualquer tamanho de ecrã. Sem arredondar, cada um ia com a precisão toda de
// um número de vírgula flutuante — dezassete algarismos para dizer onde está um
// pixel. Medido: 68 bytes por ponto, ~4 KB/s por pessoa a desenhar sem parar,
// e cada ponto é DESCARREGADO por todos os outros da sala.
//
// Quatro casas decimais chegam: num quadro de 2560 px, um décimo de milésimo é
// um quarto de pixel. Arredonda-se AQUI, e não só na hora de enviar, para o
// que eu vejo no meu ecrã ser exatamente o que os outros veem no deles.
const CASAS = 10000;
const arredondar = (v) => Math.round(v * CASAS) / CASAS;

function hangmanDoodlePointFromEvent(e) {
  const rect = hangmanEls.doodleCanvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  return { x: arredondar(x), y: arredondar(y) };
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
  if (!hangmanPossoEscrever()) return;
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
  // O giz risca ao POUSAR, não enquanto a mão anda: um chiado que dura o que
  // dura o traço seria a primeira coisa que toda a gente ia desligar.
  sfx("giz");
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
    if (hangmanPossoEscrever()) hangmanEls.undoBtn.click();
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
// Mais cores, no quadro de sala tal como no solo: dez chegam para escrever,
// não chegam para desenhar.
hangmanEls.paletaBtn?.addEventListener("click", () => abrirPaleta(hangmanDoodleState.color, selectHangmanColor));
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
    // Definições que não fazem nada com as outras escolhas ficam apagadas e
    // dizem porquê. Antes ficavam iguais às outras e deixavam-se escolher sem
    // efeito nenhum — que é a maneira mais silenciosa de mentir a quem está a
    // configurar o jogo.
    const semEfeito = def.naoSeAplica ? def.naoSeAplica(room) : null;
    const bloco = document.createElement("div");
    if (semEfeito) bloco.className = "hangman-setting-off";
    const label = document.createElement("span");
    label.className = "hangman-setting-label";
    label.textContent = semEfeito ? `${def.label} — ${semEfeito}` : def.label;
    bloco.appendChild(label);
    const linha = document.createElement("div");
    linha.className = "hangman-setting-options";
    def.options.forEach((op) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.setting = def.key;
      btn.dataset.settingValue = String(op.value);
      btn.textContent = op.label;
      btn.disabled = !!semEfeito;
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
  // A narração conta letras e espaços: no Desenha e Adivinha não teria o que
  // dizer, e dizer o tamanho da palavra seria dar meia resposta.
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
export function esquecerNarracao() {
  narrado.mask = undefined;
  narrado.leaderId = undefined;
  narrado.turnUid = undefined;
  narrado.wrongCount = 0;
  narrado.solved = false;
}

// --- Solo ou equipas ---

// Assinatura do que o ecrã das equipas mostra. Serve para NÃO o reconstruir
// quando nada do que ele mostra mudou. Reconstruí-lo a cada atualização da
// sala — que numa partida é a toda a hora — fazia os botões desaparecer e
// reaparecer debaixo do dedo: um toque calhado no meio da reconstrução não
// chega a acontecer. Quem carrega em "3 equipas" e não vê nada mudar não
// carrega outra vez, desiste.
function assinaturaEquipas(room) {
  const h = room?.hangman || {};
  return JSON.stringify({
    play: h.play || "solo",
    teams: h.teams || null,
    teamOf: h.teamOf || null,
    teamScore: h.teamScore || null,
    trancado: !!h.mask,
    ligados: connectedPlayerIds(room),
    manda: canSetBoardMode(room, state.uid),
  });
}
let assinaturaEquipasAtual = null;

function hangmanOpenTeams(forcar) {
  const room = state.room;
  if (!room?.hangman) return;
  const assinatura = assinaturaEquipas(room);
  const jaAberto = !hangmanEls.teamsOverlay.classList.contains("hidden");
  if (!forcar && jaAberto && assinatura === assinaturaEquipasAtual) return;
  assinaturaEquipasAtual = assinatura;
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

  // Os botões de escolher (solo/equipas e quantas) são criados UMA VEZ e daí
  // em diante só se lhes muda o estado. Recriá-los a cada atualização da sala
  // fazia-os desaparecer e reaparecer debaixo do dedo — e como escrever o nome
  // de uma equipa e depois carregar num botão faz o campo perder o foco, isso
  // gravava o nome, atualizava a sala e reconstruía o botão exatamente no
  // instante do toque. O toque perdia-se e ninguém percebia porquê.
  construirControlosEquipas();
  const equipas = teamList(room);
  hangmanEls.playToggle.querySelectorAll("[data-play-mode]").forEach((b) => {
    b.setAttribute("aria-pressed", String((room.hangman.play || "solo") === b.dataset.playMode));
    b.disabled = !manda || trancado;
  });
  hangmanEls.teamCountRow.classList.toggle("hidden", !emEquipas);
  hangmanEls.teamCountBtns.querySelectorAll("[data-team-count]").forEach((b) => {
    b.setAttribute("aria-pressed", String(equipas.length === Number(b.dataset.teamCount)));
    b.disabled = !manda || trancado;
  });

  // As caixas também são reaproveitadas, não recriadas. Só se apagam as que
  // deixaram de existir e criam-se as que faltam; o resto é atualizado no
  // sítio. Recriar tudo mexia com a caixa de escrever o nome no preciso
  // instante em que se estava a escrever nela.
  const equipasAgora = emEquipas ? equipas : [];
  const idsAgora = equipasAgora.map((e) => e.id);
  [...hangmanEls.teamBoxes.querySelectorAll("[data-team-box]")].forEach((el) => {
    if (!idsAgora.includes(el.dataset.teamBox)) el.remove();
  });
  const minha = teamOfPlayer(room, state.uid);
  equipasAgora.forEach((eq) => {
    let caixa = hangmanEls.teamBoxes.querySelector(`[data-team-box="${eq.id}"]`);
    if (!caixa) {
      caixa = document.createElement("div");
      caixa.className = "hangman-team-box";
      caixa.dataset.teamBox = eq.id;
      caixa.innerHTML = `
        <span class="hangman-team-name" data-team-name></span>
        <input type="text" class="hangman-team-name-input" maxlength="24" hidden />
        <div class="hangman-team-members" data-team-members></div>
        <span class="hangman-team-score" data-team-score></span>
        <button type="button" class="ghost hangman-team-join"></button>`;
      const entrar = caixa.querySelector(".hangman-team-join");
      entrar.dataset.joinTeam = eq.id;
      entrar.addEventListener("click", () => {
        const souDaqui = teamOfPlayer(state.room, state.uid) === eq.id;
        joinTeam(state.code, state.room, state.uid, souDaqui ? null : eq.id);
      });
      const campo = caixa.querySelector(".hangman-team-name-input");
      campo.dataset.teamNameInput = eq.id;
      campo.addEventListener("change", () => {
        if (campo.value.trim()) renameTeam(state.code, state.room, state.uid, eq.id, campo.value);
      });
      hangmanEls.teamBoxes.appendChild(caixa);
    }
    caixa.dataset.mine = eq.id === minha ? "1" : "0";
    caixa.style.borderColor = eq.color;

    // Quem está DENTRO da equipa escreve-lhe o nome; de fora, só se lê.
    const podeEscrever = eq.id === minha && !trancado;
    const campo = caixa.querySelector(".hangman-team-name-input");
    const etiqueta = caixa.querySelector("[data-team-name]");
    campo.hidden = !podeEscrever;
    etiqueta.hidden = podeEscrever;
    etiqueta.style.color = eq.color;
    etiqueta.textContent = eq.name;
    // Não se mexe no campo enquanto lá se está a escrever: seria apagar o que
    // a pessoa tem a meio.
    if (document.activeElement !== campo) campo.value = eq.name;
    campo.setAttribute("aria-label", `Nome da ${eq.name}`);

    const membros = caixa.querySelector("[data-team-members]");
    membros.innerHTML = "";
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

    const pontos = caixa.querySelector("[data-team-score]");
    pontos.hidden = eq.score === 0;
    pontos.textContent = eq.score > 0 ? `${eq.score} letra${eq.score === 1 ? "" : "s"}` : "";

    const entrar = caixa.querySelector(".hangman-team-join");
    entrar.textContent = eq.id === minha ? "Sair" : "Entrar";
    entrar.disabled = trancado;
  });

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

let controlosEquipasProntos = false;
function construirControlosEquipas() {
  if (controlosEquipasProntos) return;
  controlosEquipasProntos = true;
  hangmanEls.playToggle.innerHTML = "";
  [["solo", "🙋 Cada um por si"], ["equipas", "👥 Equipas"]].forEach(([valor, texto]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.playMode = valor;
    btn.textContent = texto;
    btn.addEventListener("click", () => setPlayMode(state.code, state.room, state.uid, valor));
    hangmanEls.playToggle.appendChild(btn);
  });
  hangmanEls.teamCountBtns.innerHTML = "";
  for (let n = 2; n <= MAX_TEAMS; n += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.teamCount = String(n);
    btn.textContent = String(n);
    btn.addEventListener("click", () => setTeamCount(state.code, state.room, state.uid, n));
    hangmanEls.teamCountBtns.appendChild(btn);
  }
}

function hangmanCloseTeams() {
  hangmanEls.teamsOverlay.classList.add("hidden");
  assinaturaEquipasAtual = null;
}

hangmanEls.teamsBtn.addEventListener("click", () => hangmanOpenTeams(true));
hangmanEls.teamsBtnViewer.addEventListener("click", () => hangmanOpenTeams(true));
hangmanEls.teamsCloseBtn.addEventListener("click", hangmanCloseTeams);

// --- Fim da partida ---

// Em que sala é que já pedi para pagar os pontos ao placar. Limpa-se assim que
// a partida deixa de estar acabada — ou seja, quando se recomeça —, porque aí
// há pontos novos para pagar. Declarado ANTES de quem o usa de propósito: já
// houve duas vezes nesta base de código em que uma variável usada antes de ser
// declarada partiu o ecrã inteiro.
let pagoNestaSala = null;

function hangmanRenderMatchOver(room) {
  const acabou = matchIsOver(room);
  hangmanEls.matchOverlay.classList.toggle("hidden", !acabou);
  if (!acabou) {
    pagoNestaSala = null;
    return;
  }

  const ordem = matchRanking(room);
  const ganhosDaSala = boardMatchPayout(room);
  const maisPontos = ordem.length > 0 ? ordem[0].pontos : 0;
  hangmanEls.matchRanking.innerHTML = "";
  let lugar = 0;
  let pontosAnteriores = null;
  ordem.forEach((entrada, i) => {
    // Empate fica no mesmo lugar: dois primeiros são dois primeiros.
    if (entrada.pontos !== pontosAnteriores) lugar = i + 1;
    pontosAnteriores = entrada.pontos;
    const linha = document.createElement("div");
    linha.className = "hangman-match-row";
    linha.dataset.place = String(lugar);
    linha.dataset.matchRow = entrada.id;
    linha.style.borderColor = entrada.cor;

    const pos = document.createElement("span");
    pos.className = "hangman-match-place";
    pos.textContent = `${lugar}º`;
    linha.appendChild(pos);

    const nome = document.createElement("span");
    nome.className = "hangman-match-name";
    nome.style.color = entrada.cor;
    nome.textContent = entrada.nome;
    // Numa equipa, quem lá está — senão o nome da equipa não diz de quem é.
    if (entrada.membros.length > 1 || teamsOn(room)) {
      const quem = document.createElement("span");
      quem.className = "hangman-match-members";
      quem.textContent = ` (${entrada.membros.map((u) => room.players?.[u]?.name).filter(Boolean).join(", ") || "sem ninguém"})`;
      nome.appendChild(quem);
    }
    linha.appendChild(nome);

    const pts = document.createElement("span");
    pts.className = "hangman-match-points";
    // Ao lado das letras, o que isso vale no placar da SALA: sem esse número à
    // vista, os pontos apareciam no placar geral sem ninguém perceber de onde
    // tinham vindo.
    const paraASala = entrada.membros.reduce((soma, u) => soma + (ganhosDaSala[u] || 0), 0);
    pts.textContent = `${entrada.pontos} letra${entrada.pontos === 1 ? "" : "s"}`
      + (paraASala > 0 ? ` · +${paraASala} pts na sala` : "");
    linha.appendChild(pts);
    hangmanEls.matchRanking.appendChild(linha);
  });

  const ganhou = ordem.filter((e) => e.pontos === maisPontos && maisPontos > 0);
  hangmanEls.matchTitle.textContent = ganhou.length === 0
    ? "Fim da partida — ninguém acertou nada!"
    : (ganhou.length > 1 ? "Fim da partida — empate!" : `Fim da partida — ganhou ${ganhou[0].nome}!`);
  hangmanEls.matchSub.textContent = `${wordsDone(room)} palavra${wordsDone(room) === 1 ? "" : "s"} jogada${wordsDone(room) === 1 ? "" : "s"}.`;

  const manda = canSetBoardMode(room, state.uid);
  hangmanEls.matchAgainBtn.classList.toggle("hidden", !manda);
  hangmanEls.matchWait.textContent = manda ? "" : "À espera de quem manda no quadro para começar outra.";

  // O anfitrião leva os pontos ao placar da sala. Só ele, e só uma vez — o
  // guarda está no room.js (matchPaid, escrito na mesma atualização); este
  // aqui evita só pedir a mesma coisa a cada desenho de ecrã enquanto a
  // resposta não chega de volta.
  if (isHost(room) && !boardMatchPaid(room) && state.code !== pagoNestaSala) {
    pagoNestaSala = state.code;
    queueMicrotask(() => payBoardMatchScore(state.code, state.room, state.uid));
  }
}

// --- Histórico das palavras ---

function hangmanOpenHistory() {
  const lista = wordHistory(state.room);
  hangmanEls.historyList.innerHTML = "";
  if (lista.length === 0) {
    hangmanEls.historyList.innerHTML = '<p class="hint small">Ainda não acabou nenhuma palavra.</p>';
  }
  lista.forEach((entrada, i) => {
    const linha = document.createElement("div");
    linha.className = "hangman-history-row";
    linha.dataset.historyRow = String(i);
    const palavra = document.createElement("span");
    palavra.className = "hangman-history-word";
    palavra.textContent = `${i + 1}. ${entrada.word}`;
    linha.appendChild(palavra);
    const meta = document.createElement("span");
    meta.className = "hangman-history-meta";
    const quemPos = state.room?.players?.[entrada.by]?.name;
    const quemGanhou = entrada.winnerUid ? state.room?.players?.[entrada.winnerUid]?.name : null;
    const partes = [];
    if (entrada.hint) partes.push(`pista: ${entrada.hint}`);
    if (quemPos) partes.push(`posta por ${quemPos}`);
    if (quemGanhou) partes.push(`ganha por ${quemGanhou}`);
    partes.push(`${entrada.misses || 0} erro${(entrada.misses || 0) === 1 ? "" : "s"}`);
    meta.textContent = partes.join(" · ");
    linha.appendChild(meta);
    hangmanEls.historyList.appendChild(linha);
  });
  hangmanEls.historyOverlay.classList.remove("hidden");
}

function hangmanCloseHistory() {
  hangmanEls.historyOverlay.classList.add("hidden");
}

hangmanEls.historyBtn.addEventListener("click", hangmanOpenHistory);
hangmanEls.historyBtnViewer.addEventListener("click", hangmanOpenHistory);
hangmanEls.historyCloseBtn.addEventListener("click", hangmanCloseHistory);
hangmanEls.saveImgBtn.addEventListener("click", hangmanGuardarImagem);
hangmanEls.saveImgBtnViewer.addEventListener("click", hangmanGuardarImagem);
hangmanEls.exportBtn.addEventListener("click", hangmanExportar);
hangmanEls.importBtn.addEventListener("click", () => hangmanEls.importInput.click());
hangmanEls.importInput.addEventListener("change", (e) => {
  hangmanImportar(e.target.files?.[0]);
  e.target.value = "";
});
// No fim da partida é justamente quando se quer olhar para trás. Sem isto, o
// botão do histórico ficava atrás do ecrã de resultados, inalcançável.
hangmanEls.matchHistoryBtn.addEventListener("click", hangmanOpenHistory);

hangmanEls.matchAgainBtn.addEventListener("click", () => {
  startNewMatch(state.code, state.room, state.uid);
});

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
// Guardados entre desenhos de ecrã só para se poder distinguir "a vez é tua"
// de "acertaste e a vez continua a ser tua" — que é a diferença entre uma
// informação e uma resposta ao que se acabou de fazer.
let hangmanQuipTimer = null;
// Com quantos erros a Dona Manga interferiu da última vez. Serve para ela
// aparecer A CADA N ERROS e não a cada desenho de ecrã.
let hangmanChaosNosErros = -1;
let hangmanUltimaMascara = null;
let hangmanUltimaVez = null;
// O som toca na MUDANÇA, e por isso é preciso guardar o que já se sabia. Cada
// um ouve só o resultado das SUAS tentativas: com tentativas anónimas, um
// "acertaste" no altifalante do vizinho dizia o que o ecrã esconde de
// propósito.
let somAcertosMeus = null;
let somErrosMeus = null;
let somResolvida = null;
function contarLetras(mask) {
  return [...String(mask || "")].filter((ch) => ch !== "_").length;
}

// A palavra tem de sobreviver a um F5 de quem tem a caneta. Não sobrevivia: era
// só uma variável em memória, e recarregar a página deixava o jogo PENDURADO —
// a forma da palavra continuava na sala, mas o único browser capaz de julgar as
// tentativas já não sabia a resposta. Quem arriscava ficava eternamente em "a
// tua letra está a ser verificada...", sem nada no ecrã a dizer porquê.
//
// Guardada no browser de quem a escreveu, e só lá: continua a nunca entrar na
// base de dados, que é o ponto todo (ver maskWord em room.js).
// Por SEPARADOR: a palavra é de quem tem a caneta, e num computador
// partilhado o separador do lado é outra pessoa. Em localStorage, quem
// apanhasse a caneta a seguir "recuperava" a palavra do vizinho e passava a
// arbitrar uma palavra que nunca escreveu.
const SECRET_WORD_KEY = "euSei_hangmanSecret";

function saveSecretWord(code, word) {
  try {
    sessionStorage.setItem(SECRET_WORD_KEY, JSON.stringify({ code, word }));
  } catch {
    // Armazenamento bloqueado: o jogo funciona na mesma, só não aguenta um F5.
  }
}

function clearSecretWord() {
  try {
    sessionStorage.removeItem(SECRET_WORD_KEY);
  } catch { /* ver saveSecretWord */ }
}

// Só devolve a palavra se ela ainda corresponder à forma que está na sala:
// uma palavra de uma partida anterior daria respostas erradas com toda a
// confiança, que é pior do que não dar nenhuma.
function recoverSecretWord(code, mask) {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(SECRET_WORD_KEY) || "null");
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
  const palavras = splitWordsInput(word);
  const juntas = joinWords(palavras);
  const maskAtual = state.room?.hangman?.mask || "";
  // Reescrever a MESMA palavra depois de a perder retoma o jogo onde estava,
  // em vez de recomeçar: as letras já reveladas e os erros já contados não
  // podem desaparecer só porque quem arbitra recarregou a página.
  const retoma = !!maskAtual
    && maskWord(juntas) === maskWord(maskAtual)
    && [...maskAtual].every((ch, i) => ch === "_" || ch === juntas[i]);
  // A partir daqui trabalha-se sempre com as palavras JUNTAS: é assim que
  // uma letra certa revela em todas de uma vez, sem lógica nova.
  hangmanSecretWord = juntas;
  saveSecretWord(state.code, juntas);
  const pista = hangmanEls.hintInput.value.trim();
  hangmanEls.wordInput.value = "";
  hangmanEls.hintInput.value = "";
  if (retoma) {
    hangmanEls.status.textContent = "Palavra recuperada — o jogo continua de onde estava.";
    renderHangman(state.room);
    return;
  }
  await setHangmanPuzzle(state.code, state.room, state.uid, maskWord(juntas), pista);
});

hangmanEls.revealBtn.addEventListener("click", async () => {
  const letra = hangmanEls.letterInput.value.trim();
  hangmanEls.letterInput.value = "";
  const mask = state.room?.hangman?.mask;
  if (!mask) return;
  if (letra) {
    // Com uma letra escrita, revela-se só essa: a ronda continua.
    await updateHangmanMask(state.code, state.room, state.uid, revealLetter(hangmanSecretWord, mask, letra));
    return;
  }
  // Sem letra, "Acertaram" acaba a palavra — e aí é preciso saber DE QUEM foi.
  // Os palpites são em voz alta, por isso a app não tem como adivinhar: só
  // quem tem a caneta ouviu. Antes acabava sem vencedor e ninguém levava nada.
  abrirEscolhaDoVencedor();
});

// --- Quem acertou ---

function abrirEscolhaDoVencedor() {
  const room = state.room;
  if (!room?.hangman) return;
  const outros = connectedPlayerIds(room).filter((uid) => uid !== state.uid);
  hangmanEls.winnerChoices.innerHTML = "";
  outros.forEach((uid) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ghost hangman-winner-choice";
    b.dataset.vencedor = uid;
    b.textContent = room.players?.[uid]?.name || "?";
    b.addEventListener("click", () => fecharComVencedor(uid));
    hangmanEls.winnerChoices.appendChild(b);
  });
  // Numa sala de um só, não há a quem dar a palavra: revela-se e pronto.
  if (outros.length === 0) {
    fecharComVencedor(null);
    return;
  }
  hangmanEls.winnerOverlay.classList.remove("hidden");
}

async function fecharComVencedor(vencedorUid) {
  hangmanEls.winnerOverlay.classList.add("hidden");
  await solveHangmanWithWinner(state.code, state.room, state.uid, hangmanSecretWord, vencedorUid);
}

hangmanEls.winnerNoneBtn?.addEventListener("click", () => fecharComVencedor(null));
hangmanEls.winnerCancelBtn?.addEventListener("click", () => {
  hangmanEls.winnerOverlay.classList.add("hidden");
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
  // Com várias palavras, cada uma vai no seu bloco: assim quebram entre
  // palavras e não a meio de uma. O deslocamento lateral da faixa trata do
  // resto quando não cabem.
  const palavras = wordsOfMask(mask);
  let base = 0;
  palavras.forEach((palavra, wi) => {
    const bloco = document.createElement("span");
    bloco.className = "hangman-slot-word";
    bloco.dataset.slotWord = String(wi);
    renderSlotsInto(bloco, palavra, base, interactive);
    hangmanEls.slots.appendChild(bloco);
    base += palavra.length + WORD_SEP.length;
  });
}

// Desenha os espaços de UMA palavra. "base" é a posição dela dentro da
// máscara toda, para o clique escrever no sítio certo.
function renderSlotsInto(destino, mask, base, interactive) {
  [...String(mask || "")].forEach((ch, offset) => {
    const i = base + offset;
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
      destino.appendChild(btn);
    } else {
      destino.appendChild(el);
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
  // O balão da Dona Manga. Dura poucos segundos e some sozinho: um comentário
  // que fica no ecrã deixa de ser um comentário e passa a ser um aviso.
  // room chega aqui já filtrado: fora da Forca vem sem hangman, e é isso que
  // faz o balão não aparecer noutros modos. "naForca" e "hangman" são de
  // renderHangman e não existem nesta função — usá-los aqui rebentava.
  // Duas fontes de fala, o mesmo balão: as gozações (a cada erro) e as
  // interferências da Dona Manga (a cada N erros). Mostra-se a mais recente
  // das duas — dois balões ao mesmo tempo tapavam-se um ao outro.
  const quip = room?.hangman?.quip;
  const caos = room?.hangman?.chaos;
  const caosFala = caos && BOARD_CHAOS.find((e) => e.id === caos.id);
  const caosMaisNovo = !!caosFala && (!quip || (caos.at || 0) >= (quip.at || 0));
  let fala = caosMaisNovo ? caosFala : (quip && BOARD_QUIPS[quip.i]);
  let quando = caosMaisNovo ? (caos.at || 0) : (quip?.at || 0);

  // A ajuda do Brasa fala só a QUEM a pediu, e é a mais recente de todas
  // quando acabou de acontecer: a letra que ele soprou não pode aparecer no
  // balão dos outros, senão a ajuda que se paga passa a ser de todos.
  const ajuda = room?.hangman?.help;
  if (ajuda && ajuda.uid === state.uid && (ajuda.at || 0) >= quando) {
    fala = {
      who: "Brasa",
      text: ajuda.custou
        ? `Toma o "${ajuda.letra}". Não contes a ninguém — e paguei-a com um dos teus erros, desculpa.`
        : `Toma o "${ajuda.letra}". Ela está a dormir, aproveita.`,
    };
    quando = ajuda.at || 0;
  }
  const fresca = fala && serverNow() - quando < 7000;
  hangmanEls.quip.classList.toggle("hidden", !fresca);
  if (fresca) {
    hangmanEls.quipWho.textContent = `${fala.who}:`;
    hangmanEls.quipText.textContent = fala.text;
    hangmanEls.quip.dataset.quipIndex = fala.who === "Brasa" && room?.hangman?.help?.uid === state.uid
      ? `ajuda:${room.hangman.help.letra}`
      : (caosMaisNovo ? `caos:${caos.id}` : String(quip?.i));
    // Sem isto, o balão ficava para sempre depois do último desenho de ecrã:
    // nada mais mexe na sala, logo nada mais o mandava embora.
    if (hangmanQuipTimer) clearTimeout(hangmanQuipTimer);
    hangmanQuipTimer = setTimeout(() => hangmanEls.quip.classList.add("hidden"), 7000);
  }

  // Declarado ANTES de qualquer uso: estava a seguir ao bloco das palavras
  // erradas, que já o usava, e um const usado antes da declaração rebenta a
  // função inteira — as palavras erradas nunca chegavam a aparecer.
  const anonimo = guessesAreAnonymous(room);
  const palavrasErradas = wrongWordList(room);
  hangmanEls.wrongStrip.classList.toggle("hidden", erradas.length === 0 && palavrasErradas.length === 0);
  hangmanEls.wrongWords.innerHTML = "";
  palavrasErradas.forEach(({ text, uid }) => {
    const el = document.createElement("span");
    el.className = "hangman-wrong-word";
    el.dataset.wrongWord = text;
    el.style.color = anonimo ? "var(--ink)" : playerColor(room, uid);
    el.title = anonimo ? "" : (room.players?.[uid]?.name || "");
    el.textContent = text;
    hangmanEls.wrongWords.appendChild(el);
  });
  erradas.forEach(({ letter, uid }) => {
    const el = document.createElement("span");
    el.className = "hangman-wrong-letter";
    // Anónimas: a letra fica à vista (senão toda a gente repetia as mesmas),
    // mas em tinta neutra e sem nome — é de quem falhou que ninguém sabe.
    el.style.color = anonimo ? "var(--ink)" : playerColor(room, uid);
    el.title = anonimo ? "" : (room.players?.[uid]?.name || "");
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

// Os pedidos de ajuda ao Brasa, pelo mesmo caminho: só quem tem a caneta
// conhece a palavra, por isso só ele pode revelar uma letra.
async function hangmanServeHelpAsks(room) {
  if (hangmanJudging || !hangmanSecretWord) return;
  const pendentes = Object.entries(room.hangman?.helpAsks || {}).filter(([, a]) => a && a.at);
  if (pendentes.length === 0) return;
  hangmanJudging = true;
  try {
    await serveBrasaHelp(state.code, room, state.uid, pendentes[0][0], hangmanSecretWord);
  } finally {
    hangmanJudging = false;
  }
}

// E as tentativas de palavra inteira, pelo mesmo caminho e pelo mesmo motivo:
// só o browser de quem tem a caneta conhece a palavra.
async function hangmanJudgeWordGuesses(room) {
  if (hangmanJudging || !hangmanSecretWord) return;
  const pendentes = Object.entries(room.hangman?.wordGuesses || {}).filter(([, g]) => g && g.text);
  if (pendentes.length === 0) return;
  hangmanJudging = true;
  try {
    const [guesserUid, info] = pendentes[0];
    await resolveWordGuess(state.code, room, state.uid, guesserUid, info.text, hangmanSecretWord);
  } finally {
    hangmanJudging = false;
  }
}

// Arriscar a palavra inteira. Substituiu o "pedir a palavra": levantar o braço
// para falar não é jogo nenhum quando a app já sabe julgar a resposta.
hangmanEls.helpBtn.addEventListener("click", async () => {
  if (!state.room || !canAskHelp(state.room, state.uid)) return;
  // O pedido fica na sala; quem serve é o cliente de quem tem a caneta, o
  // único que conhece a palavra. Mesmo caminho das tentativas, mesma razão.
  hangmanEls.helpBtn.disabled = true;
  try {
    await askBrasaHelp(state.code, state.room, state.uid);
  } finally {
    hangmanEls.helpBtn.disabled = false;
  }
});

hangmanEls.wordGuessForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tentativa = hangmanEls.wordGuessInput.value.trim();
  hangmanEls.wordGuessInput.value = "";
  if (!tentativa) return;
  await submitWordGuess(state.code, state.room, state.uid, tentativa);
});

export function renderHangman(room) {
  const hangman = room.hangman;
  if (!hangman) return;
  const mode = BOARD_MODES[hangman.mode] ? hangman.mode : DEFAULT_BOARD_MODE;
  const amLeader = hangman.leaderId === state.uid;
  // Declarado ao cimo porque é usado por todo o desenho de ecrã abaixo. Estava
  // declarado a meio e usado acima: em JavaScript isso não é "undefined", é um
  // erro que rebenta a função — e como o desenho de ecrã morria antes de
  // trocar de ecrã, a sala mudava de estado e ninguém saía do lobby.
  const possoEscrever = canDrawOnBoard(room, state.uid);
  const leaderName = room.players?.[hangman.leaderId]?.name || null;
  const host = isHost(room);


  // As duas versões do esboço. Quem tem a caneta vê a moldura forte e as
  // opções todas; quem não tem vê a moldura cinzenta e só a barra do modo.
  hangmanEls.screen.classList.toggle("hangman-role-drawer", amLeader);
  hangmanEls.screen.classList.toggle("hangman-role-viewer", !amLeader);
  hangmanEls.penZone.classList.toggle("hidden", !possoEscrever);
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
  const comPalavraAqui = isWordMode(mode);
  const aVotarCaneta = comPalavraAqui && semCaneta && !!hangman.colors?.[state.uid];

  if (aVotarCaneta) {
    hangmanEls.status.textContent = "Votem em quem fica com a caneta.";
  } else if (amLeader) {
    if (mode === "forca") {
      hangmanEls.status.textContent = "Tens a caneta — desenha a forca e os espaços da palavra. Os outros pedem a palavra para arriscar.";
    } else if (mode === "adivinha") {
      hangmanEls.status.textContent = "Tens a caneta — desenha a palavra. Nada de letras nem números: só o desenho.";
    } else {
      hangmanEls.status.textContent = "Tens a caneta — escreve ou desenha. Quando quiseres, passa a caneta a outra pessoa.";
    }
  } else if (!comPalavraAqui) {
    hangmanEls.status.textContent = "A folha é de todos — escreve à vontade. Combinem as regras em voz alta.";
  } else if (possoEscrever) {
    hangmanEls.status.textContent = hangman.solved
      ? "Acertaram! Enquanto se escolhe a próxima palavra, a folha é de todos."
      : "Enquanto não há palavra, a folha é de todos.";
  } else if (mode === "adivinha") {
    hangmanEls.status.textContent = `${leaderName || "Ninguém"} está a desenhar. Escreve o palpite quando reconheceres.`;
  } else {
    hangmanEls.status.textContent = `${leaderName || "Ninguém"} tem a caneta. Arrisca uma letra quando for a tua vez.`;
  }

  hangmanEls.doodleCanvas.classList.toggle("hangman-doodle-canvas-active", possoEscrever);

  // A folha pessoal é de quem NÃO tem a caneta: quem desenha já escreve no
  // quadro de todos e não precisa de um rascunho por cima do próprio traço.
  hangmanEls.personalTools.classList.toggle("hidden", possoEscrever);
  hangmanEls.personalCanvas.classList.toggle("hidden", possoEscrever);
  if (possoEscrever && personal.on) personalSetOn(false);
  // Uma palavra nova limpa o rascunho: os riscos da palavra anterior só
  // atrapalhariam a seguinte.
  // Os dois lados TÊM de ser normalizados. Sem palavra definida, hangman.mask é
  // undefined e personalLastMask é null: "undefined !== null" dá verdadeiro
  // sempre, e o rascunho era apagado a cada desenho de ecrã — ou seja, a cada
  // traço que chegasse de quem tem a caneta. Rabiscar tornava-se impossível.
  const marcaAtual = hangman.mask || null;
  if (marcaAtual !== personalLastMask) {
    personalLastMask = marcaAtual;
    if (personal.strokes.length > 0) {
      personal.strokes = [];
      personal.current = null;
    }
  }
  personalRedraw();
  hangmanEls.clearBtn.classList.toggle("hidden", !possoEscrever);
  hangmanEls.undoBtn.classList.toggle("hidden", !possoEscrever);
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

  // --- Modos com palavra: a Forca e o Desenha e Adivinha ---
  //
  // Os dois partilham quase tudo: a palavra que só existe no browser de quem
  // tem a caneta, as cores, as equipas, o histórico, o fim da partida. O que
  // os separa é COMO se arrisca — letra a letra, ou a palavra de uma vez — e é
  // por isso que há duas bandeiras e não uma. Onde a diferença importa, usa-se
  // naForca; onde não importa, comPalavra.
  const comPalavra = isWordMode(mode);
  const naForca = mode === "forca";

  // O histórico só aparece quando há alguma coisa nele: um botão que abre uma
  // lista vazia é um botão que ensina a não voltar a carregar nele.
  // Fica DEPOIS de naForca, e não antes — usá-lo antes de estar declarado
  // rebentava o desenho do quadro inteiro e o ecrã nem chegava a abrir.
  // Guardar a imagem é de quem a quer: não é uma escrita na sala, é uma cópia
  // do que já se vê. Exportar e importar mexem no quadro de todos, por isso
  // ficam com quem manda nele.
  const temDesenho = temPontos(state.room?.hangman?.doodle?.points);
  hangmanEls.saveImgBtn.classList.toggle("hidden", !(temDesenho && amLeader));
  hangmanEls.saveImgBtnViewer.classList.toggle("hidden", !(temDesenho && !amLeader));
  hangmanEls.exportBtn.classList.toggle("hidden", !(temDesenho && canSetBoardMode(room, state.uid)));
  hangmanEls.importBtn.classList.toggle("hidden", !canSetBoardMode(room, state.uid));

  const temHistorico = comPalavra && wordHistory(room).length > 0;
  hangmanEls.historyBtn.classList.toggle("hidden", !(temHistorico && amLeader));
  hangmanEls.historyBtnViewer.classList.toggle("hidden", !(temHistorico && !amLeader));
  if (!hangmanEls.historyOverlay.classList.contains("hidden")) {
    if (!temHistorico) hangmanCloseHistory();
    else hangmanOpenHistory();
  }
  const mask = hangman.mask || "";
  // Se a palavra se perdeu (um F5 de quem tem a caneta), tenta recuperá-la do
  // browser antes de qualquer outra coisa — senão o resto do ecrã desenha-se
  // com o jogo já morto sem ninguém saber.
  if (comPalavra && amLeader && mask && !hangmanSecretWord) {
    hangmanSecretWord = recoverSecretWord(state.code, mask);
  }
  const perdiAPalavra = comPalavra && amLeader && !!mask && !hangmanSecretWord;
  const temPalavra = comPalavra && !!mask;
  hangmanEls.wordZone.classList.toggle("hidden", !temPalavra);
  // Sem a palavra não se pode arbitrar: mostra-se a caixa de escrever outra vez
  // em vez das ferramentas de arbitrar, que não fariam nada.
  hangmanEls.wordForm.classList.toggle("hidden", !(comPalavra && amLeader && (!mask || perdiAPalavra)));
  hangmanEls.wordTools.classList.toggle("hidden", !(comPalavra && amLeader && !!mask && !perdiAPalavra));
  hangmanEls.wordInput.placeholder = perdiAPalavra
    ? "Escreve outra vez a palavra para continuares a arbitrar"
    : (naForca ? "Palavra a adivinhar (só tu a vês)" : "O que vais desenhar (só tu o vês)");

  // Cor de cada um: pede-se ao entrar no modo, e só depois de todos terem
  // escolhido é que as letras erradas dizem alguma coisa.
  const jaTenhoCor = !!hangman.colors?.[state.uid];
  const precisaDeCor = comPalavra && !jaTenhoCor;
  hangmanEls.colorOverlay.classList.toggle("hidden", !precisaDeCor);
  if (comPalavra) hangmanRenderColorPicker(room);
  // Uma escolha obrigatória fecha os ecrãs opcionais. Sem isto, quem tivesse
  // as equipas ou as definições abertas ficava com a escolha de cor por
  // baixo — visível mas impossível de carregar.
  // O fim da partida manda em tudo o resto: é o único ecrã que não se fecha
  // por causa de outro.
  hangmanRenderMatchOver(comPalavra ? room : { hangman: {}, players: {} });
  if (matchIsOver(room) && comPalavra) {
    hangmanCloseTeams();
    hangmanCloseSettings();
    hangmanCloseModePicker();
  }
  if (precisaDeCor) {
    hangmanCloseTeams();
    hangmanCloseSettings();
    hangmanCloseModePicker();
  }

  // Os espaços das letras são só da Forca: no Desenha e Adivinha, mostrar o
  // tamanho da palavra era dar meia resposta antes de alguém olhar para o
  // desenho.
  const mostraEspacos = naForca && !!mask;
  hangmanEls.slotsStrip.classList.toggle("hidden", !mostraEspacos);
  hangmanEls.slotsStrip.classList.toggle("hangman-slots-interactive", mostraEspacos && amLeader);
  renderWrongLetters(comPalavra ? room : { hangman: {} });

  // Em equipas mostram-se as EQUIPAS com o que já acertaram; a jogar cada um
  // por si mostram-se as pessoas, cada uma na sua cor. Mostrar as duas coisas
  // ao mesmo tempo enchia a faixa e não dizia mais nada.
  const daVez = naForca ? currentGuesser(room) : null;
  if (comPalavra) {
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
        // O número de acertos vai ao lado do nome: é ele que decide a ordem
        // da ronda seguinte, por isso tem de estar à vista enquanto se joga,
        // e não só no fim.
        const certas = correctCountOf(room, uid);
        const errosDele = individualMisses(room) ? missesOfPlayer(room, uid) : 0;
        const deCastigo = !!hangman.skipNext?.[uid];
        let sufixo = "";
        if (uid === hangman.leaderId) {
          sufixo = " 🖊️";
        } else {
          // Com erros de cada um, os erros DELE têm de estar à vista: sem
          // isso, a penalização a cada X erros chegava sem aviso nenhum, e uma
          // penalização que não se vê chegar é só uma coisa estranha que
          // acontece.
          // Com tentativas anónimas, cada um vê só a SUA contagem: mostrar a
          // dos outros seria dizer por outras palavras quem andou a falhar.
          const posso = !guessesAreAnonymous(room) || uid === state.uid;
          if (posso && certas > 0) sufixo += ` ${certas}`;
          if (posso && errosDele > 0) sufixo += ` ✗${errosDele}`;
          if (posso && deCastigo) sufixo += " ⏭️";
        }
        tag.textContent = (room.players[uid]?.name || "?") + sufixo;
        if (deCastigo) tag.title = "Perde a vez seguinte";
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
      // "Acertaste, joga outra vez" só se diz quando foi mesmo isso que
      // aconteceu: a vez ficou na mesma pessoa E a palavra revelou mais uma
      // letra desde o desenho anterior. Sem esta comparação, a frase aparecia
      // também numa vez ganha por outro ter errado, e passava a ser ruído em
      // vez de resposta.
      const acabouDeAcertar = daVez === hangmanUltimaVez
        && !!hangmanUltimaMascara && contarLetras(mask) > contarLetras(hangmanUltimaMascara);
      hangmanEls.turnLabel.textContent = daVez === state.uid
        ? (hangman.guesses?.[state.uid]
          ? "A tua letra está a ser verificada..."
          : (acabouDeAcertar ? "Acertaste! Joga outra vez." : "É a tua vez de arriscar."))
        : (nomeDaVez
          ? (acabouDeAcertar ? `${nomeDaVez} acertou e joga outra vez.` : `É a vez de ${nomeDaVez}.`)
          : "");
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

  // Quantas palavras faltam. Sem isto, uma partida com fim acabava de
  // surpresa — e um fim que apanha as pessoas desprevenidas parece uma avaria,
  // não um resultado.
  const totalPalavras = matchWordsTotal(room);
  const feitas = wordsDone(room);
  hangmanEls.matchProgress.classList.toggle("hidden", !(comPalavra && totalPalavras > 0));
  if (comPalavra && totalPalavras > 0) {
    hangmanEls.matchProgress.textContent = `Palavra ${Math.min(feitas + 1, totalPalavras)} de ${totalPalavras}`;
  }

  if (temPalavra) {
    // Com tentativas anónimas, cada um vê revelado só o que ELE acertou. Quem
    // tem a caneta vê a máscara partilhada, porque precisa de ver o andamento
    // da ronda para saber quando acabar.
    const minhaMascara = amLeader ? mask : playerMask(room, state.uid);
    renderHangmanSlots(naForca ? minhaMascara : "", amLeader);
    const misses = hangman.misses || 0;
    const teto = maxMissesOf(room);
    if (hangman.solved) {
      const vencedor = hangman.winnerUid ? room.players?.[hangman.winnerUid]?.name : null;
      if (!naForca) {
        // No Desenha e Adivinha não se "fecha a palavra": reconhece-se o
        // desenho, ou não. E não há contagem de erros nenhuma para mostrar.
        hangmanEls.missesLabel.textContent = vencedor
          ? (hangman.winnerUid === state.uid ? "Adivinhaste! 🎉" : `${vencedor} adivinhou.`)
          : "Adivinharam! 🎉";
        hangmanEls.missesLabel.dataset.danger = "0";
      }
      // "Montou primeiro" só faz sentido com folhas pessoais, em que cada um
      // monta a sua. Com a palavra à vista de todos, o que a pessoa fez foi
      // fechá-la — e dizer-lhe que a montou primeiro era dar-lhe crédito pelas
      // letras dos outros.
      const comoGanhou = guessesAreAnonymous(room) ? "montou a palavra primeiro" : "fechou a palavra";
      if (naForca) {
        hangmanEls.missesLabel.textContent = vencedor
          ? (hangman.winnerUid === state.uid ? "Ganhaste esta! 🎉" : `${vencedor} ${comoGanhou}.`)
          : "Acertaram! 🎉";
      }
    } else if (!naForca) {
      // Sem letras não há erros a contar: o que interessa dizer é de quem é a
      // caneta e que se está à espera de palpites.
      hangmanEls.missesLabel.textContent = amLeader
        ? "Desenha — sem letras nem números!"
        : "Escreve o teu palpite quando reconheceres.";
      hangmanEls.missesLabel.dataset.danger = "0";
    } else if (individualMisses(room)) {
      // Com erros de cada um não há "enforcado": ninguém acaba a ronda dos
      // outros por ser distraído. O contador da sala passa a ser só um total.
      const meus = missesOfPlayer(room, state.uid);
      hangmanEls.missesLabel.textContent = amLeader
        ? `Erros de todos: ${Object.values(hangman.missesBy || {}).reduce((a, b) => a + b, 0)}`
        : `Os teus erros: ${meus}`;
    } else if (teto > 0) {
      hangmanEls.missesLabel.textContent = `Erros: ${misses}/${teto}${misses >= teto ? " — enforcado!" : ""}`;
    } else {
      // Sem limite: os erros continuam a contar-se, só não acabam o jogo.
      hangmanEls.missesLabel.textContent = `Erros: ${misses}`;
    }
    hangmanEls.missesLabel.dataset.danger =
      !individualMisses(room) && teto > 0 && misses >= teto - 1 && !hangman.solved ? "1" : "0";
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

  // Arriscar a palavra inteira é de quem NÃO tem a caneta, enquanto há palavra
  // por adivinhar. Ao contrário das letras, não espera pela vez: dizer a
  // palavra é uma aposta, e ninguém deve ter de esperar para a fazer.
  const possoArriscarPalavra = comPalavra && !!mask && !hangman.solved && !amLeader
    && hangmanGuessers(room).includes(state.uid) && !hangman.wordGuesses?.[state.uid]
    // Quem pediu ajuda e não tinha erros para gastar paga assim: fica sem
    // arriscar a palavra inteira até à palavra seguinte.
    && !blockedFromWordGuess(room, state.uid);
  hangmanEls.wordGuessForm.classList.toggle("hidden", !possoArriscarPalavra);

  // A AJUDA DO BRASA é só a pedido: há um botão, carrega-se nele. Ele não se
  // oferece sozinho — foi essa a escolha.
  const possoPedirAjuda = naForca && canAskHelp(room, state.uid);
  hangmanEls.helpBtn.classList.toggle("hidden", !possoPedirAjuda);
  if (possoPedirAjuda) {
    hangmanEls.helpBtn.textContent = helpCosts(room)
      ? "🐈‍⬛ Pedir ajuda ao Brasa (custa)"
      : "🐈‍⬛ Pedir ajuda ao Brasa";
    hangmanEls.helpBtn.title = helpCosts(room)
      ? "Custa um erro. Sem erros para gastar, ficas sem arriscar a palavra inteira até à próxima."
      : "Ele revela-te uma letra, à borla.";
  }
  if (blockedFromWordGuess(room, state.uid) && naForca && !!mask) {
    hangmanEls.turnLabel.textContent = "Pediste ajuda: ficas sem arriscar a palavra inteira até à próxima.";
  }

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

  // Guardados no fim, depois de já terem sido lidos acima: é a comparação
  // entre o desenho anterior e este que distingue "a vez é tua" de
  // "acertaste e continuas".
  hangmanUltimaMascara = mask || null;
  hangmanUltimaVez = daVez;

  // --- O som ---
  // Primeira passagem por esta palavra: só se GUARDA o ponto de partida. Sem
  // isto, entrar numa ronda a meio tocava tudo o que já tinha acontecido.
  if (comPalavra && !!mask) {
    const meusAcertos = correctCountOf(room, state.uid);
    const meusErros = Object.values(hangman.wrong || {})
      .filter((w) => w && w.uid === state.uid).length;
    if (somAcertosMeus !== null && meusAcertos > somAcertosMeus) sfx("certo");
    else if (somErrosMeus !== null && meusErros > somErrosMeus) sfx("errado");
    else if (somResolvida === false && hangman.solved) sfx("fim");
    somAcertosMeus = meusAcertos;
    somErrosMeus = meusErros;
    somResolvida = !!hangman.solved;
  } else {
    somAcertosMeus = null;
    somErrosMeus = null;
    somResolvida = null;
  }

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
  if (amLeader && comPalavra) {
    queueMicrotask(() => hangmanJudgePendingGuesses(state.room));
    queueMicrotask(() => hangmanJudgeWordGuesses(state.room));
    queueMicrotask(() => hangmanServeHelpAsks(state.room));
    // A Dona Manga entra a cada N erros da ronda: aparece quando o jogo está
    // a correr mal, que é quando faz falta, em vez de aparecer ao acaso e
    // atrapalhar quem estava a ir bem. Corre no cliente de quem tem a caneta,
    // como tudo o que precisa de conhecer a palavra.
    const errosAgora = hangman.misses || 0;
    if (!mask) {
      hangmanChaosNosErros = -1;
    } else if (boardChaosOn(room) && !hangman.solved
      && errosAgora > 0 && errosAgora % BOARD_CHAOS_EVERY === 0
      && errosAgora !== hangmanChaosNosErros) {
      // Guardado ANTES de disparar: sem isto, os vários desenhos de ecrã que
      // um erro provoca chamavam a gata várias vezes pelo mesmo erro.
      hangmanChaosNosErros = errosAgora;
      queueMicrotask(() => fireBoardChaos(state.code, state.room, state.uid, hangmanSecretWord));
    }
  }
}

// Exposto para os testes poderem ler a caneta do quadro de sala sem passarem
// pelo desenho — o mesmo que o __board faz no quadro solo.
export const __quadroSala = hangmanDoodleState;
