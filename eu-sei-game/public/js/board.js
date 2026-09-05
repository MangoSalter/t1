// Quadro branco solo: uma folha em branco, sem jogo, sem pontos, sem rede.
// Nasceu do quadro branco de sala (ver renderHangman em app.js) mas aqui não
// há caneta a passar de mão em mão — a folha é de quem está a olhar para ela.
// Tudo o resto cresceu para o que se espera de uma app de desenho.
//
// DUAS DECISÕES ESTRUTURANTES, porque tudo o resto sai delas:
//
// 1. O desenho é uma LISTA DE TRAÇOS, não pixéis. Cada traço sabe a sua
//    ferramenta, cor, espessura, transparência e pontos; o ecrã é sempre
//    redesenhado a partir da lista. Desfazer passa a ser tirar um item da
//    lista, em vez de guardar cópias da imagem inteira (megabytes cada em
//    ecrã grande), e mudar o fundo ou rodar o telemóvel não estraga nada.
//
// 2. Os pontos são guardados em COORDENADAS DE MUNDO, não do ecrã. O ecrã é
//    só uma janela sobre uma folha infinita: a câmara tem zoom e deslocação,
//    e o desenho vive por baixo. É isto que faz o "zoom out" pedido — afastar
//    mostra mais folha, e o traço fica mais fino em relação ao ecrã porque a
//    sua espessura também está em unidades de mundo. Uma primeira versão
//    guardava tudo em fração da tela; foi deitada fora porque com fração não
//    existe "fora do ecrã", e sem isso não há para onde afastar.

const STORAGE_KEY = "euSei_boardDrawing";
const VIEW_KEY = "euSei_boardView";
const PREFS_KEY = "euSei_boardPrefs";
// Trave de segurança, não limite de uso. Ao ser atingida o quadro PARA de
// aceitar traços e diz-o — nunca deita fora os antigos. A versão anterior
// fazia isso (board.strokes.shift()) e tinha o mesmo defeito que o quadro de
// sala: como a borracha também é um traço, apagar um canto ia comendo o
// princípio do desenho por trás, sem nada no ecrã a explicar porquê.
const MAX_STROKES = 4000;
const MAX_UNDO = 80;
// Distância mínima entre pontos guardados, em pixéis de ECRÃ (convertida
// para mundo conforme o zoom). Sem isto um arrasto lento enche a lista de
// pontos praticamente no mesmo sítio; com ela em unidades de mundo, afastar
// muito fazia o traço ficar aos degraus.
const MIN_DIST_SCREEN = 1.4;

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;

// --- Ferramentas ---
// widthScale multiplica a espessura escolhida; alpha multiplica a
// transparência escolhida; composite é o que dá a cada uma o seu carácter.
// O fluorescente usa "multiply" para que, ao passar por cima do que já está
// escrito, a tinta escureça em vez de tapar — é o que um marcador
// fluorescente de verdade faz ao papel.
export const BOARD_TOOLS = {
  pen:         { label: "Caneta",       icon: "🖊️", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round" },
  marker:      { label: "Marcador",     icon: "🖍️", widthScale: 2.6, alpha: 0.95, composite: "source-over", cap: "round" },
  pencil:      { label: "Lápis",        icon: "✏️", widthScale: 0.5, alpha: 0.75, composite: "source-over", cap: "round" },
  highlighter: { label: "Fluorescente", icon: "🖌️", widthScale: 5,   alpha: 0.4,  composite: "multiply",    cap: "square" },
  eraser:      { label: "Borracha",     icon: "🧽", widthScale: 3.5, alpha: 1,    composite: "destination-out", cap: "round" },
  line:        { label: "Linha",        icon: "📏", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true },
  arrow:       { label: "Seta",         icon: "➡️", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true },
  rect:        { label: "Retângulo",    icon: "▭",  widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true, fillable: true },
  ellipse:     { label: "Círculo",      icon: "⭕", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", shape: true, fillable: true },
  text:        { label: "Texto",        icon: "🔤", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", text: true },
  hand:        { label: "Mover",        icon: "✋", widthScale: 1,   alpha: 1,    composite: "source-over", cap: "round", pan: true },
};

// Espessuras rápidas, em unidades de mundo.
export const BOARD_WIDTHS = [
  { label: "Fino", value: 2 },
  { label: "Médio", value: 4 },
  { label: "Grosso", value: 9 },
  { label: "Muito grosso", value: 18 },
];
export const WIDTH_MIN = 1;
export const WIDTH_MAX = 60;

// A paleta começa nas cores da app (a tinta castanha, o vermelho, o amarelo,
// o azul, o verde) para o que se desenha aqui parecer parte do mesmo mundo, e
// só depois abre para as cores que qualquer quadro precisa de ter.
export const BOARD_COLORS = [
  "#3a3126", "#b24b38", "#e3a53d", "#5c7e91", "#5b7442",
  "#c2569b", "#7a4fb5", "#2f7d6e", "#d1691f", "#f6efdd",
];

// Além do padrão, o fundo escolhe também a cor do papel — um quadro de giz
// preto é uma folha diferente, não um padrão diferente. Quando o papel é
// escuro, a tinta por omissão passa a clara (ver applyBackground).
export const BOARD_BACKGROUNDS = {
  plain:  { label: "Liso",         paper: "#fffdf7", pattern: "none",   ink: "#3a3126" },
  grid:   { label: "Quadriculado", paper: "#fffdf7", pattern: "grid",   ink: "#3a3126" },
  lined:  { label: "Pautado",      paper: "#fffdf7", pattern: "lined",  ink: "#3a3126" },
  dotted: { label: "Pontilhado",   paper: "#fffdf7", pattern: "dotted", ink: "#3a3126" },
  chalk:  { label: "Quadro de giz", paper: "#28352c", pattern: "none",  ink: "#f2ead8" },
  dark:   { label: "Quadro preto", paper: "#242019", pattern: "grid",   ink: "#f2ead8" },
};

// --- Estado ---

const board = {
  strokes: [],
  redo: [],
  current: null,
  drawing: false,
  tool: "pen",
  color: BOARD_COLORS[0],
  // Cada ferramenta guarda a SUA espessura. Uma espessura só para todas
  // obrigava a reajustar o deslizador a cada troca: a borracha quer-se larga,
  // o lápis fino, e trocar de uma para a outra apagava a escolha anterior.
  width: BOARD_WIDTHS[1].value,
  widthByTool: {},
  opacity: 1,
  fillShapes: false,
  background: "plain",
  // Câmara: mundo -> ecrã é  screen = world * zoom + pan
  zoom: 1,
  panX: 0,
  panY: 0,
  dpr: 1,
  rectW: 0,
  rectH: 0,
  // Gesto de deslocar/afastar com os dedos
  pointers: new Map(),
  gesture: null,
  panning: false,
  panStart: null,
  spaceHeld: false,
  saveTimer: null,
};

const els = {
  screen: document.querySelector('[data-screen="board"]'),
  canvas: document.getElementById("board-canvas"),
  toolRow: document.getElementById("board-tool-row"),
  colorRow: document.getElementById("board-color-row"),
  widthRow: document.getElementById("board-width-row"),
  customColor: document.getElementById("board-custom-color"),
  bgSelect: document.getElementById("board-bg-select"),
  widthRange: document.getElementById("board-width-range"),
  widthValue: document.getElementById("board-width-value"),
  opacityRange: document.getElementById("board-opacity-range"),
  opacityValue: document.getElementById("board-opacity-value"),
  fillToggle: document.getElementById("board-fill-toggle"),
  zoomOutBtn: document.getElementById("board-zoom-out-btn"),
  zoomInBtn: document.getElementById("board-zoom-in-btn"),
  zoomLabel: document.getElementById("board-zoom-label"),
  zoomResetBtn: document.getElementById("board-zoom-reset-btn"),
  zoomFitBtn: document.getElementById("board-zoom-fit-btn"),
  undoBtn: document.getElementById("board-undo-btn"),
  redoBtn: document.getElementById("board-redo-btn"),
  clearBtn: document.getElementById("board-clear-btn"),
  saveBtn: document.getElementById("board-save-btn"),
  exportBtn: document.getElementById("board-export-btn"),
  importBtn: document.getElementById("board-import-btn"),
  importInput: document.getElementById("board-import-input"),
  exitBtn: document.getElementById("board-exit-btn"),
  status: document.getElementById("board-status"),
  panel: document.getElementById("board-panel"),
  openBtns: document.querySelectorAll("[data-open-board]"),
};

// Sem o ecrã no HTML não há nada a ligar; guarda para o resto do módulo poder
// assumir que os elementos existem.
const boardAvailable = !!(els.screen && els.canvas);

// --- Persistência ---
// O quadro sobrevive a fechar o separador. Um quadro que se apaga sozinho ao
// recarregar não serve para guardar seja o que for.

function saveDrawingSoon() {
  if (board.saveTimer) clearTimeout(board.saveTimer);
  board.saveTimer = setTimeout(saveDrawingNow, 400);
}

function saveDrawingNow() {
  if (board.saveTimer) clearTimeout(board.saveTimer);
  board.saveTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board.strokes));
    localStorage.setItem(VIEW_KEY, JSON.stringify({ zoom: board.zoom, panX: board.panX, panY: board.panY }));
  } catch {
    // Quota cheia ou armazenamento bloqueado: o desenho continua no ecrã, só
    // não sobrevive a recarregar. Não vale interromper quem está a desenhar
    // com um erro por causa disso.
  }
}

export function sanitizeStrokes(parsed) {
  if (!Array.isArray(parsed)) return [];
  // Filtra o que não reconhece: um traço com ferramenta desconhecida (de uma
  // versão futura, ou de dados estragados) rebentaria no redesenho.
  return parsed.filter((s) => {
    if (!s || !BOARD_TOOLS[s.tool]) return false;
    if (!Array.isArray(s.points) || s.points.length === 0) return false;
    return s.points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  });
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      tool: board.tool, color: board.color, width: board.width,
      widthByTool: board.widthByTool,
      opacity: board.opacity, fillShapes: board.fillShapes, background: board.background,
    }));
  } catch {
    // ver saveDrawingNow
  }
}

// --- Câmara ---

export function worldFromScreen(sx, sy) {
  return { x: (sx - board.panX) / board.zoom, y: (sy - board.panY) / board.zoom };
}

export function setZoom(nextZoom, anchorX, anchorY) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
  if (z === board.zoom) return;
  // Afastar/aproximar tem de manter parado o ponto sob o dedo (ou o centro do
  // ecrã). Sem esta âncora, cada passo de zoom atirava o desenho para um
  // canto e obrigava a procurá-lo outra vez.
  const ax = anchorX ?? board.rectW / 2;
  const ay = anchorY ?? board.rectH / 2;
  const before = worldFromScreen(ax, ay);
  board.zoom = z;
  board.panX = ax - before.x * z;
  board.panY = ay - before.y * z;
  redrawBoard();
  refreshZoomLabel();
  saveDrawingSoon();
}

export function zoomBy(factor, anchorX, anchorY) {
  setZoom(board.zoom * factor, anchorX, anchorY);
}

export function resetZoom() {
  board.zoom = 1;
  board.panX = 0;
  board.panY = 0;
  redrawBoard();
  refreshZoomLabel();
  saveDrawingSoon();
}

export function strokesBounds(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach((s) => {
    const pad = (s.width || 1) * (BOARD_TOOLS[s.tool]?.widthScale || 1);
    s.points.forEach((p) => {
      minX = Math.min(minX, p.x - pad);
      minY = Math.min(minY, p.y - pad);
      maxX = Math.max(maxX, p.x + pad);
      maxY = Math.max(maxY, p.y + pad);
    });
  });
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function zoomToFit() {
  const b = strokesBounds(board.strokes);
  if (!b || board.rectW === 0) return;
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  const margin = 40;
  const z = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.min((board.rectW - margin * 2) / w, (board.rectH - margin * 2) / h))
  );
  board.zoom = z;
  board.panX = board.rectW / 2 - ((b.minX + b.maxX) / 2) * z;
  board.panY = board.rectH / 2 - ((b.minY + b.maxY) / 2) * z;
  redrawBoard();
  refreshZoomLabel();
  saveDrawingSoon();
}

function refreshZoomLabel() {
  if (els.zoomLabel) els.zoomLabel.textContent = `${Math.round(board.zoom * 100)}%`;
}

// --- Desenho no canvas ---

function syncCanvasSize() {
  const canvas = els.canvas;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  board.dpr = dpr;
  board.rectW = rect.width;
  board.rectH = rect.height;
  return true;
}

function currentBackground() {
  return BOARD_BACKGROUNDS[board.background] || BOARD_BACKGROUNDS.plain;
}

// O fundo é desenhado em coordenadas de ECRÃ, mas o padrão acompanha o zoom:
// a grelha tem de crescer e encolher com o desenho, senão afastar transforma-a
// numa mancha sólida de linhas. Recebe a câmara em vez de a ir buscar ao
// estado, para a imagem exportada poder usar o seu próprio enquadramento.
function drawBackground(ctx, w, h, cam) {
  const bg = currentBackground();
  ctx.save();
  ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
  ctx.fillStyle = bg.paper;
  ctx.fillRect(0, 0, w, h);

  if (bg.pattern !== "none") {
    const dark = bg.paper !== "#fffdf7";
    const step = 28 * cam.zoom;
    // Abaixo de 6px o padrão deixa de se ler e passa a sujar o ecrã.
    if (step >= 6) {
      ctx.strokeStyle = dark ? "rgba(242,234,216,0.13)" : "rgba(58,49,38,0.13)";
      ctx.fillStyle = dark ? "rgba(242,234,216,0.22)" : "rgba(58,49,38,0.22)";
      ctx.lineWidth = 1;
      const offX = ((cam.panX % step) + step) % step;
      const offY = ((cam.panY % step) + step) % step;
      if (bg.pattern === "grid") {
        for (let x = offX; x < w; x += step) {
          ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); ctx.stroke();
        }
        for (let y = offY; y < h; y += step) {
          ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke();
        }
      } else if (bg.pattern === "dotted") {
        for (let x = offX; x < w; x += step) {
          for (let y = offY; y < h; y += step) {
            ctx.beginPath(); ctx.arc(x, y, Math.max(1, 1.4 * cam.zoom), 0, Math.PI * 2); ctx.fill();
          }
        }
      } else if (bg.pattern === "lined") {
        const lstep = 34 * cam.zoom;
        if (lstep >= 6) {
          const loff = ((cam.panY % lstep) + lstep) % lstep;
          for (let y = loff; y < h; y += lstep) {
            ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke();
          }
        }
      }
    }
  }
  ctx.restore();
}

function strokeAlpha(stroke) {
  const tool = BOARD_TOOLS[stroke.tool] || BOARD_TOOLS.pen;
  // A borracha apaga sempre a fundo. A transparência é uma propriedade da
  // TINTA, e deixá-la mandar na borracha dava uma borracha que apaga a meias
  // sem ninguém ter pedido: bastava ter escrito antes com 25% para depois
  // ficar sempre um resto por apagar, sem nada no ecrã a explicar porquê.
  if (tool.composite === "destination-out") return 1;
  return Math.max(0.02, Math.min(1, tool.alpha * (stroke.opacity ?? 1)));
}

function strokeWorldWidth(stroke) {
  const tool = BOARD_TOOLS[stroke.tool] || BOARD_TOOLS.pen;
  return Math.max(0.4, (stroke.width || 4) * tool.widthScale);
}

// Desenha um traço no espaço de MUNDO — quem chama já pôs a transformação da
// câmara no contexto.
function drawStroke(ctx, stroke) {
  const tool = BOARD_TOOLS[stroke.tool] || BOARD_TOOLS.pen;
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = tool.composite;
  ctx.globalAlpha = strokeAlpha(stroke);
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = tool.cap;
  ctx.lineJoin = "round";
  const lw = strokeWorldWidth(stroke);
  ctx.lineWidth = lw;

  if (tool.text) {
    const size = Math.max(6, lw * 4);
    ctx.font = `${size}px "Patrick Hand", "Gaegu", cursive, sans-serif`;
    ctx.textBaseline = "top";
    // Texto com várias linhas: cada \n desce uma linha, como em qualquer
    // caixa de texto.
    String(stroke.text || "").split("\n").forEach((line, i) => {
      ctx.fillText(line, pts[0].x, pts[0].y + i * size * 1.2);
    });
    ctx.restore();
    return;
  }

  if (tool.shape) {
    // Formas guardam só dois pontos: onde o dedo pousou e onde está agora.
    const a = pts[0];
    const b = pts[pts.length - 1] || a;
    ctx.beginPath();
    if (stroke.tool === "line") {
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (stroke.tool === "arrow") {
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      // A ponta cresce com a espessura, mas nunca mais do que o próprio
      // comprimento da seta — senão uma seta curta fica só ponta.
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const head = Math.min(len * 0.4, Math.max(8, lw * 3.5));
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
      ctx.stroke();
    } else if (stroke.tool === "rect") {
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      if (stroke.fill) ctx.fill();
      ctx.stroke();
    } else {
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      if (stroke.fill) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (pts.length === 1) {
    // Um toque sem arrastar deixa um ponto — senão tocar no quadro não fazia
    // nada, o que se lê como avaria.
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, lw / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // A caneta digital dá pressão. Quando o traço tem pressões diferentes ao
  // longo do caminho, desenha-se segmento a segmento com espessura variável —
  // é o que faz um traço parecer escrito à mão em vez de saído de um tubo.
  const varies = stroke.pressures && stroke.pressures.some((p) => Math.abs(p - 0.5) > 0.08);
  if (varies) {
    for (let i = 1; i < pts.length; i += 1) {
      ctx.lineWidth = lw * (0.45 + (stroke.pressures[i] ?? 0.5));
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

// A TINTA VIVE NUMA CAMADA À PARTE, e só no fim é que assenta sobre o fundo.
// Isto não é arrumação: a borracha apaga com "destination-out", que come tudo
// o que estiver na mesma tela. Com o fundo por baixo na mesma tela, passar a
// borracha num quadro de giz abria buracos brancos, e num fundo quadriculado
// apagava as linhas da grelha por onde passasse. Numa camada só de tinta, a
// borracha só tem tinta para comer.
const inkLayer = document.createElement("canvas");

function renderScene(ctx, pxW, pxH, cam, strokes) {
  const w = pxW / cam.dpr;
  const h = pxH / cam.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pxW, pxH);
  drawBackground(ctx, w, h, cam);

  if (inkLayer.width !== pxW || inkLayer.height !== pxH) {
    inkLayer.width = pxW;
    inkLayer.height = pxH;
  }
  const ink = inkLayer.getContext("2d");
  ink.setTransform(1, 0, 0, 1, 0, 0);
  ink.clearRect(0, 0, pxW, pxH);
  const k = cam.dpr * cam.zoom;
  ink.setTransform(k, 0, 0, k, cam.dpr * cam.panX, cam.dpr * cam.panY);
  strokes.forEach((st) => drawStroke(ink, st));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(inkLayer, 0, 0);
}

export function redrawBoard() {
  if (!boardAvailable || !syncCanvasSize()) return;
  const ctx = els.canvas.getContext("2d");
  const strokes = board.current ? [...board.strokes, board.current] : board.strokes;
  renderScene(ctx, els.canvas.width, els.canvas.height,
    { dpr: board.dpr, zoom: board.zoom, panX: board.panX, panY: board.panY }, strokes);
}

// --- Interação ---

function screenFromEvent(e) {
  const rect = els.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function eventPressure(e) {
  // pointerType "mouse" reporta 0.5 fixo (ou 0 sem botão premido); só a
  // caneta dá pressão a sério. Sem caneta, 0.5 = espessura normal.
  if (e.pointerType === "pen" && e.pressure > 0) return Math.min(1, e.pressure);
  return 0.5;
}

function beginStroke(e) {
  const s = screenFromEvent(e);
  const p = worldFromScreen(s.x, s.y);
  const tool = BOARD_TOOLS[board.tool];

  if (tool.text) {
    const text = window.prompt("Texto a escrever no quadro:");
    if (text && text.trim()) {
      commitStroke({
        tool: "text", text: text.trim(), color: board.color,
        width: board.width, opacity: board.opacity, points: [p], pressures: [0.5],
      });
    }
    return;
  }

  board.current = {
    tool: board.tool,
    // A borracha desenha com composite "destination-out": a cor é ignorada,
    // conta só a forma. Guarda-se uma cor válida à mesma para o traço não
    // ficar meio construído se um dia se mudar o modo de composição.
    color: board.tool === "eraser" ? "#000000" : board.color,
    width: board.width,
    opacity: board.opacity,
    fill: !!(tool.fillable && board.fillShapes),
    points: [p],
    pressures: [eventPressure(e)],
  };
  board.drawing = true;
  redrawBoard();
}

function extendStroke(e) {
  const cur = board.current;
  if (!cur) return;
  const s = screenFromEvent(e);
  const p = worldFromScreen(s.x, s.y);
  if (BOARD_TOOLS[cur.tool].shape) {
    // Numa forma o segundo ponto é sempre substituído: arrastar redimensiona,
    // não acrescenta.
    cur.points[1] = p;
    cur.pressures[1] = eventPressure(e);
  } else {
    const last = cur.points[cur.points.length - 1];
    // O mínimo é em pixéis de ecrã: convertido para mundo, afastar muito
    // deixaria de registar pontos e o traço saía aos degraus.
    const minWorld = MIN_DIST_SCREEN / board.zoom;
    if (Math.hypot(p.x - last.x, p.y - last.y) < minWorld) return;
    cur.points.push(p);
    cur.pressures.push(eventPressure(e));
  }
  redrawBoard();
}

function commitStroke(stroke) {
  if (board.strokes.length >= MAX_STROKES) {
    setStatus("O quadro está cheio — anula ou limpa para continuar.");
    return;
  }
  board.strokes.push(stroke);
  // Desenhar depois de desfazer corta o futuro: é o que qualquer editor faz,
  // e evita um "refazer" que reporia um traço por cima de outro caminho.
  board.redo = [];
  redrawBoard();
  refreshButtons();
  saveDrawingSoon();
}

function endStroke() {
  if (!board.drawing) return;
  board.drawing = false;
  const cur = board.current;
  board.current = null;
  if (!cur) return;
  // Uma forma que nunca chegou a ser arrastada é um clique acidental na tela,
  // não um retângulo de tamanho zero que fica na lista a estorvar o desfazer.
  if (BOARD_TOOLS[cur.tool].shape && cur.points.length < 2) {
    redrawBoard();
    return;
  }
  commitStroke(cur);
}

// --- Deslocar e afastar com os dedos ---

function gestureFromPointers() {
  const [a, b] = [...board.pointers.values()];
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
  };
}

function beginPan(sx, sy) {
  board.panning = true;
  board.panStart = { sx, sy, panX: board.panX, panY: board.panY };
}

function movePan(sx, sy) {
  if (!board.panStart) return;
  board.panX = board.panStart.panX + (sx - board.panStart.sx);
  board.panY = board.panStart.panY + (sy - board.panStart.sy);
  redrawBoard();
}

function endPan() {
  if (!board.panning) return;
  board.panning = false;
  board.panStart = null;
  saveDrawingSoon();
}

// --- Ações ---

export function undoStroke() {
  if (board.strokes.length === 0) return;
  board.redo.push(board.strokes.pop());
  if (board.redo.length > MAX_UNDO) board.redo.shift();
  redrawBoard();
  refreshButtons();
  saveDrawingSoon();
}

export function redoStroke() {
  if (board.redo.length === 0) return;
  const entrada = board.redo.pop();
  if (entrada && entrada.restauraTudo) board.strokes = entrada.restauraTudo;
  else board.strokes.push(entrada);
  redrawBoard();
  refreshButtons();
  saveDrawingSoon();
}

export function clearBoard(skipConfirm) {
  if (board.strokes.length === 0) return;
  // Limpar tudo é a única ação daqui que deita fora trabalho de verdade, por
  // isso pergunta primeiro. A borracha, essa, apaga só onde se passa e nunca
  // pergunta nada — são coisas diferentes de propósito.
  if (!skipConfirm && !window.confirm("Limpar o quadro todo? Isto apaga tudo o que está desenhado.")) return;
  // "Limpar" é UMA ação, por isso desfaz-se com UM passo. Empilhar os traços
  // um a um fazia com que desfazer uma limpeza de 300 traços pedisse 300
  // cliques — na prática, o mesmo que não se poder desfazer. E volta o desenho
  // INTEIRO: devolver só um pedaço seria pior do que não devolver nada, porque
  // parece que correu bem.
  board.redo = [{ restauraTudo: board.strokes.slice() }];
  board.strokes = [];
  redrawBoard();
  refreshButtons();
  saveDrawingNow();
}

function backgroundIsDark() {
  return currentBackground().paper !== "#fffdf7";
}

export function saveBoardImage() {
  if (!boardAvailable) return;
  const b = strokesBounds(board.strokes);
  if (!b) return;
  // A imagem guardada é o DESENHO, não a janela: exporta-se a área ocupada
  // pelos traços, a 2x, e não o que calha estar visível. Guardar só o que
  // está no ecrã cortava metade do quadro sem avisar.
  const margin = 24;
  const worldW = b.maxX - b.minX + margin * 2;
  const worldH = b.maxY - b.minY + margin * 2;
  // 2x para a imagem sair nítida, mas com o lado maior travado nos 4000px: a
  // camada de tinta é uma tela do mesmo tamanho, e um quadro muito espalhado
  // pedia duas telas de 8000x8000 (256 MB cada) — no telemóvel isso não
  // exporta nada, rebenta o separador.
  const scale = Math.min(2, 4000 / Math.max(worldW, worldH));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.ceil(worldW * scale));
  out.height = Math.max(1, Math.ceil(worldH * scale));
  // Mesmo caminho do ecrã: fundo (com o seu padrão) por baixo, tinta por cima
  // numa camada própria. Desenhar aqui à parte era como o ecrã tinha o defeito
  // da borracha — a imagem guardada saía com os mesmos buracos.
  renderScene(out.getContext("2d"), out.width, out.height,
    { dpr: 1, zoom: scale, panX: -(b.minX - margin) * scale, panY: -(b.minY - margin) * scale },
    board.strokes);

  downloadBlobUrl(out.toDataURL("image/png"), `quadro-eu-sei-${stamp()}.png`);
  setStatus("Imagem guardada.");
}

export function exportBoardFile() {
  const data = JSON.stringify({ version: 1, strokes: board.strokes }, null, 0);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  downloadBlobUrl(url, `quadro-eu-sei-${stamp()}.json`);
  // Revogar já libertava o endereço antes de o browser lhe pegar.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setStatus("Quadro exportado.");
}

async function importBoardFile(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const strokes = sanitizeStrokes(parsed?.strokes ?? parsed);
    if (strokes.length === 0) {
      setStatus("Esse ficheiro não tem nenhum desenho reconhecível.");
      return;
    }
    // Importar ACRESCENTA em vez de substituir, e o que estava continua a
    // poder ser desfeito — importar por engano não pode apagar o quadro.
    board.strokes = board.strokes.concat(strokes).slice(0, MAX_STROKES);
    redrawBoard();
    refreshButtons();
    zoomToFit();
    saveDrawingNow();
    setStatus(`Importados ${strokes.length} traços.`);
  } catch {
    setStatus("Não consegui ler esse ficheiro.");
  }
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function downloadBlobUrl(url, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
}

function setStatus(text) {
  if (els.status) els.status.textContent = text;
}

function refreshButtons() {
  const empty = board.strokes.length === 0;
  if (els.undoBtn) els.undoBtn.disabled = empty;
  if (els.redoBtn) els.redoBtn.disabled = board.redo.length === 0;
  if (els.clearBtn) els.clearBtn.disabled = empty;
  if (els.saveBtn) els.saveBtn.disabled = empty;
  if (els.exportBtn) els.exportBtn.disabled = empty;
  if (els.zoomFitBtn) els.zoomFitBtn.disabled = empty;
  setStatus(empty ? "Folha em branco — escolhe uma caneta e começa." : `${board.strokes.length} traço${board.strokes.length === 1 ? "" : "s"}.`);
}

// --- Barra de ferramentas ---

function buildToolbar() {
  els.toolRow.innerHTML = "";
  Object.entries(BOARD_TOOLS).forEach(([key, tool]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-tool";
    btn.dataset.boardTool = key;
    btn.title = tool.label;
    // O nome vai junto do ícone: um emoji sozinho obriga a adivinhar, e o
    // pincel do fluorescente não se lê como ferramenta nenhuma.
    btn.innerHTML = `<span aria-hidden="true">${tool.icon}</span><span class="board-tool-name">${tool.label}</span>`;
    btn.setAttribute("aria-pressed", String(key === board.tool));
    btn.addEventListener("click", () => selectTool(key));
    els.toolRow.appendChild(btn);
  });

  els.colorRow.innerHTML = "";
  BOARD_COLORS.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-color";
    btn.dataset.boardColor = color;
    btn.style.background = color;
    btn.title = color;
    btn.setAttribute("aria-label", `Cor ${color}`);
    btn.setAttribute("aria-pressed", String(color === board.color));
    btn.addEventListener("click", () => selectColor(color));
    els.colorRow.appendChild(btn);
  });

  els.widthRow.innerHTML = "";
  BOARD_WIDTHS.forEach((w) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-width";
    btn.dataset.boardWidth = String(w.value);
    btn.title = w.label;
    btn.setAttribute("aria-label", `Espessura ${w.label}`);
    btn.innerHTML = `<span class="board-width-dot" style="width:${Math.min(20, w.value + 3)}px;height:${Math.min(20, w.value + 3)}px"></span>`;
    btn.addEventListener("click", () => selectWidth(w.value));
    els.widthRow.appendChild(btn);
  });

  els.bgSelect.innerHTML = "";
  Object.entries(BOARD_BACKGROUNDS).forEach(([key, bg]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = bg.label;
    els.bgSelect.appendChild(opt);
  });
  els.bgSelect.value = board.background;
}

export function toolWidth(key) {
  const saved = board.widthByTool[key];
  if (Number.isFinite(saved)) return saved;
  // Valores de partida por ferramenta, não um número só para todas: a
  // borracha nasce larga e o lápis fino, que é como se usam.
  if (key === "eraser") return 12;
  if (key === "highlighter") return 6;
  if (key === "pencil") return 3;
  if (key === "marker") return 6;
  return BOARD_WIDTHS[1].value;
}

export function selectTool(key) {
  if (!BOARD_TOOLS[key]) return;
  board.tool = key;
  // A espessura mostrada passa a ser a desta ferramenta.
  selectWidth(toolWidth(key), true);
  els.toolRow.querySelectorAll("[data-board-tool]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.boardTool === key));
  });
  // A borracha e a mão ignoram a cor: mostrar a paleta acesa enquanto se
  // apaga sugeria que se estava a "apagar a castanho".
  const usesColor = key !== "eraser" && key !== "hand";
  els.colorRow.classList.toggle("board-row-muted", !usesColor);
  els.canvas.dataset.tool = key;
  savePrefs();
}

export function selectColor(color) {
  board.color = color;
  els.colorRow.querySelectorAll("[data-board-color]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.boardColor === color));
  });
  if (els.customColor && /^#[0-9a-f]{6}$/i.test(color)) els.customColor.value = color;
  // Escolher uma cor com a borracha na mão quer quase de certeza dizer
  // "voltar a escrever" — trocar sozinho poupa um clique que ninguém percebe
  // que falta dar.
  if (board.tool === "eraser" || board.tool === "hand") selectTool("pen");
  savePrefs();
}

export function selectWidth(value, fromToolSwitch) {
  board.width = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Number(value) || WIDTH_MIN));
  // Ao trocar de ferramenta só se mostra a espessura dela; escrever no
  // deslizador é que a guarda. Sem esta distinção, trocar de ferramenta e
  // voltar atrás reescrevia a espessura da primeira com a da segunda.
  if (!fromToolSwitch) board.widthByTool[board.tool] = board.width;
  if (els.widthRange) els.widthRange.value = String(board.width);
  if (els.widthValue) els.widthValue.textContent = `${board.width}px`;
  savePrefs();
}

export function selectOpacity(value) {
  const v = Math.max(0.05, Math.min(1, Number(value) || 1));
  board.opacity = v;
  if (els.opacityRange) els.opacityRange.value = String(Math.round(v * 100));
  if (els.opacityValue) els.opacityValue.textContent = `${Math.round(v * 100)}%`;
  savePrefs();
}

export function setBoardBackground(key) {
  if (!BOARD_BACKGROUNDS[key]) return;
  const wasDark = backgroundIsDark();
  board.background = key;
  // Ao passar para um quadro escuro, tinta castanha em fundo preto não se vê.
  // Só troca a cor se ela ainda for a que o fundo anterior sugeria — quem
  // escolheu vermelho de propósito fica com o vermelho.
  const nowDark = backgroundIsDark();
  if (nowDark !== wasDark) {
    const from = wasDark ? BOARD_BACKGROUNDS.chalk.ink : BOARD_BACKGROUNDS.plain.ink;
    if (board.color.toLowerCase() === from.toLowerCase()) {
      selectColor(nowDark ? BOARD_BACKGROUNDS.chalk.ink : BOARD_BACKGROUNDS.plain.ink);
    }
  }
  if (els.bgSelect) els.bgSelect.value = key;
  redrawBoard();
  savePrefs();
}

export function setFillShapes(on) {
  board.fillShapes = !!on;
  if (els.fillToggle) els.fillToggle.checked = board.fillShapes;
  savePrefs();
}

// --- Ligações ---

function showBoardScreen() {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === "board");
  });
  // Entrar no quadro deixa uma marca no histórico do browser, para o botão
  // "voltar" do telemóvel (e do browser) sair do quadro em vez de fechar o
  // jogo. Quem entra num ecrã de ecrã inteiro carrega em "voltar" por
  // instinto muito antes de procurar um botão na barra.
  try {
    history.pushState({ euSeiBoard: true }, "");
  } catch {
    // Se o histórico não estiver disponível (ficheiro local, por exemplo),
    // fica o botão "← Voltar" e o Escape, que chegam.
  }
  // O canvas só tem tamanho depois de o ecrã estar visível.
  requestAnimationFrame(() => {
    redrawBoard();
    refreshButtons();
    refreshZoomLabel();
  });
}

function goHome() {
  saveDrawingNow();
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === "home");
  });
}

function leaveBoardScreen() {
  saveDrawingNow();
  // Sair pelo botão consome a marca que a entrada deixou; é o popstate que
  // troca o ecrã, para os dois caminhos (botão e "voltar" do telemóvel)
  // acabarem no mesmo sítio em vez de o histórico ficar a meio.
  if (history.state && history.state.euSeiBoard) {
    history.back();
    return;
  }
  goHome();
}

function boardIsActive() {
  return !!els.screen && els.screen.classList.contains("active");
}

if (boardAvailable) {
  const prefs = loadJson(PREFS_KEY, {});
  if (BOARD_TOOLS[prefs.tool] && !BOARD_TOOLS[prefs.tool].pan) board.tool = prefs.tool;
  if (typeof prefs.color === "string") board.color = prefs.color;
  if (Number.isFinite(prefs.width)) board.width = prefs.width;
  if (prefs.widthByTool && typeof prefs.widthByTool === "object") {
    Object.entries(prefs.widthByTool).forEach(([k, v]) => {
      if (BOARD_TOOLS[k] && Number.isFinite(v)) board.widthByTool[k] = v;
    });
  }
  if (Number.isFinite(prefs.opacity)) board.opacity = prefs.opacity;
  board.fillShapes = !!prefs.fillShapes;
  if (BOARD_BACKGROUNDS[prefs.background]) board.background = prefs.background;

  board.strokes = sanitizeStrokes(loadJson(STORAGE_KEY, []));
  const view = loadJson(VIEW_KEY, {});
  if (Number.isFinite(view.zoom)) board.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.zoom));
  if (Number.isFinite(view.panX)) board.panX = view.panX;
  if (Number.isFinite(view.panY)) board.panY = view.panY;

  buildToolbar();
  selectColor(board.color);
  selectTool(board.tool);
  selectOpacity(board.opacity);
  setFillShapes(board.fillShapes);
  refreshButtons();
  refreshZoomLabel();

  els.canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    els.canvas.setPointerCapture(e.pointerId);
    const s = screenFromEvent(e);
    board.pointers.set(e.pointerId, s);

    if (board.pointers.size === 2) {
      // Dois dedos: passa a gesto de afastar/deslocar. O traço que tenha
      // começado com o primeiro dedo é abandonado — quem põe o segundo dedo
      // quer mexer na folha, não deixar um risco a atravessá-la.
      board.drawing = false;
      board.current = null;
      board.gesture = gestureFromPointers();
      board.gesture.zoom = board.zoom;
      board.gesture.panX = board.panX;
      board.gesture.panY = board.panY;
      redrawBoard();
      return;
    }
    if (board.pointers.size > 2) return;

    // Botão do meio, espaço premido ou ferramenta "mão" deslocam a folha.
    if (board.tool === "hand" || e.button === 1 || board.spaceHeld) {
      beginPan(s.x, s.y);
      return;
    }
    beginStroke(e);
  });

  els.canvas.addEventListener("pointermove", (e) => {
    const s = screenFromEvent(e);
    if (board.pointers.has(e.pointerId)) board.pointers.set(e.pointerId, s);

    if (board.pointers.size === 2 && board.gesture) {
      const now = gestureFromPointers();
      const g = board.gesture;
      if (g.dist > 0) {
        const factor = now.dist / g.dist;
        const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, g.zoom * factor));
        // O ponto de mundo que estava entre os dedos quando o gesto começou
        // tem de continuar entre os dedos agora.
        const worldCx = (g.cx - g.panX) / g.zoom;
        const worldCy = (g.cy - g.panY) / g.zoom;
        board.zoom = z;
        board.panX = now.cx - worldCx * z;
        board.panY = now.cy - worldCy * z;
        redrawBoard();
        refreshZoomLabel();
      }
      return;
    }
    if (board.panning) {
      movePan(s.x, s.y);
      return;
    }
    if (!board.drawing) return;
    extendStroke(e);
  });

  function releasePointer(e) {
    board.pointers.delete(e.pointerId);
    if (board.pointers.size < 2 && board.gesture) {
      board.gesture = null;
      saveDrawingSoon();
    }
    endPan();
    endStroke();
  }
  els.canvas.addEventListener("pointerup", releasePointer);
  els.canvas.addEventListener("pointercancel", releasePointer);
  els.canvas.addEventListener("pointerleave", releasePointer);

  // Roda do rato: Ctrl/⌘ afasta e aproxima (o gesto universal), sem tecla
  // desloca a folha, como em qualquer tela grande.
  els.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = screenFromEvent(e);
    if (e.ctrlKey || e.metaKey) {
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, s.x, s.y);
    } else {
      board.panX -= e.shiftKey ? e.deltaY : e.deltaX;
      board.panY -= e.shiftKey ? 0 : e.deltaY;
      redrawBoard();
      saveDrawingSoon();
    }
  }, { passive: false });

  els.undoBtn?.addEventListener("click", undoStroke);
  els.redoBtn?.addEventListener("click", redoStroke);
  els.clearBtn?.addEventListener("click", () => clearBoard(false));
  els.saveBtn?.addEventListener("click", saveBoardImage);
  els.exportBtn?.addEventListener("click", exportBoardFile);
  els.importBtn?.addEventListener("click", () => els.importInput?.click());
  els.importInput?.addEventListener("change", (e) => {
    importBoardFile(e.target.files?.[0]);
    e.target.value = "";
  });
  els.exitBtn?.addEventListener("click", leaveBoardScreen);
  els.bgSelect?.addEventListener("change", (e) => setBoardBackground(e.target.value));
  els.customColor?.addEventListener("input", (e) => selectColor(e.target.value));
  els.widthRange?.addEventListener("input", (e) => selectWidth(e.target.value));
  els.opacityRange?.addEventListener("input", (e) => selectOpacity(Number(e.target.value) / 100));
  els.fillToggle?.addEventListener("change", (e) => setFillShapes(e.target.checked));
  els.zoomInBtn?.addEventListener("click", () => zoomBy(ZOOM_STEP));
  els.zoomOutBtn?.addEventListener("click", () => zoomBy(1 / ZOOM_STEP));
  els.zoomResetBtn?.addEventListener("click", resetZoom);
  els.zoomFitBtn?.addEventListener("click", zoomToFit);
  els.openBtns.forEach((btn) => btn.addEventListener("click", showBoardScreen));

  window.addEventListener("resize", () => {
    if (boardIsActive()) redrawBoard();
  });

  window.addEventListener("popstate", () => {
    if (boardIsActive()) goHome();
  });

  // Atalhos de teclado — quem desenha no computador espera-os, e o Ctrl+Z é
  // o mais esperado de todos.
  window.addEventListener("keydown", (e) => {
    if (!boardIsActive()) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); undoStroke(); }
    else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redoStroke(); }
    else if (ctrl && k === "s") { e.preventDefault(); saveBoardImage(); }
    else if (ctrl && (k === "=" || k === "+")) { e.preventDefault(); zoomBy(ZOOM_STEP); }
    else if (ctrl && k === "-") { e.preventDefault(); zoomBy(1 / ZOOM_STEP); }
    else if (ctrl && k === "0") { e.preventDefault(); resetZoom(); }
    else if (!ctrl && k === " ") { board.spaceHeld = true; els.canvas.dataset.pan = "1"; }
    else if (!ctrl && k === "e") selectTool("eraser");
    else if (!ctrl && k === "b") selectTool("pen");
    else if (!ctrl && k === "h") selectTool("hand");
    else if (!ctrl && k === "t") selectTool("text");
    else if (!ctrl && k === "escape") leaveBoardScreen();
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === " ") {
      board.spaceHeld = false;
      delete els.canvas.dataset.pan;
    }
  });

  // Fechar o separador a meio de um traço não pode perder o quadro.
  window.addEventListener("beforeunload", saveDrawingNow);
}

// Exposto para os testes conseguirem montar um quadro sem passar pelo rato.
export const __board = board;
