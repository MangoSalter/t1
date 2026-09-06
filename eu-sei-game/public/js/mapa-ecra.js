// O ECRÃ do mapa-múndi: os elementos, o rato e o teclado.
//
// O motor está no mapa.js e NÃO sabe que existe um ecrã. É essa separação que
// permite testá-lo sem browser nenhum — e foi lá, num teste sem browser, que
// se apanhou o erro dos limites do zoom antes de haver sequer um botão para
// carregar. A primeira versão tinha as duas coisas no mesmo ficheiro e o teste
// puro deixou de conseguir importá-lo à segunda linha.
import {
  mapa, carregarPaises, enquadrar, zoomPor, mundoDoEcra, paisEm,
  porConquistar, estaCompleto, acertou, conquistar, sugerir, desenhar,
} from "./mapa.js";

const els = {
  screen: document.querySelector('[data-screen="mapa"]'),
  canvas: document.getElementById("mapa-canvas"),
  form: document.getElementById("mapa-form"),
  input: document.getElementById("mapa-input"),
  progresso: document.getElementById("mapa-progresso"),
  status: document.getElementById("mapa-status"),
  exitBtn: document.getElementById("mapa-exit-btn"),
  fitBtn: document.getElementById("mapa-fit-btn"),
  recomecarBtn: document.getElementById("mapa-recomecar-btn"),
  openBtns: document.querySelectorAll("[data-open-mapa]"),
};

// A cor de quem joga sozinho. Em sala cada um terá a sua, como no quadro.
const MINHA_COR = "#b24b38";
// Quanto tempo parado antes de a ajuda aparecer. Conta-se desde a última
// CONQUISTA, não desde o início: uma sala a andar depressa nunca a vê, e uma
// sala encravada recebe-a logo. Foi por isso que se escolheu isto em vez de um
// relógio a contar do princípio.
const AJUDA_APOS_MS = 25000;

const jogo = {
  ligado: false,
  ultimaConquista: 0,
  sugerido: null,
  jaSugeridos: [],
  ajudaTimer: null,
};

function haEcra() {
  return !!(els.screen && els.canvas);
}

function ajustarTela() {
  const rect = els.canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (els.canvas.width !== w || els.canvas.height !== h) {
    els.canvas.width = w;
    els.canvas.height = h;
  }
  mapa.dpr = dpr;
  mapa.rectW = rect.width;
  mapa.rectH = rect.height;
  return true;
}

// Medir a tela e SÓ DEPOIS enquadrar. Ao contrário, o enquadramento corre com
// a tela ainda a zero, desiste, e o mundo fica desenhado com dois píxeis de
// largura — foi exatamente o que aconteceu, e o teste do ecrã apanhou-o ao ler
// a cor de um território conquistado.
function enquadrarQuandoDer() {
  if (!ajustarTela()) return false;
  enquadrar();
  return true;
}

function redesenhar() {
  if (!ajustarTela()) return;
  desenhar(els.canvas.getContext("2d"));
  const faltam = porConquistar().length;
  const total = mapa.paises.length;
  els.progresso.textContent = total ? `${total - faltam} de ${total}` : "";
  els.input.placeholder = mapa.selecionado
    ? `Que país é este?`
    : "Clica num país e escreve o nome";
}

function dizer(texto) {
  els.status.textContent = texto;
}

function pontoDoEvento(e) {
  const rect = els.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// A ajuda só aparece quando o jogo ESTAGNA. Recomeça a contar a cada conquista.
function armarAjuda() {
  if (jogo.ajudaTimer) clearTimeout(jogo.ajudaTimer);
  jogo.ajudaTimer = setTimeout(() => {
    if (!jogo.ligado || estaCompleto()) return;
    const p = sugerir(jogo.jaSugeridos);
    if (!p) return;
    jogo.jaSugeridos.push(p.nome);
    dizer(`O Brasa sussurra: ainda falta ${p.nome}.`);
    armarAjuda();
  }, AJUDA_APOS_MS);
}

function abrirMapa() {
  if (!haEcra()) return;
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === "mapa");
  });
  jogo.ligado = true;
  if (mapa.paises.length === 0) {
    dizer("A carregar o mundo...");
    carregarPaises()
      .then(() => {
        enquadrarQuandoDer();
        redesenhar();
        dizer("Clica num país e escreve o nome dele.");
        armarAjuda();
      })
      .catch(() => dizer("Não consegui carregar o mapa. Tenta recarregar a página."));
    return;
  }
  enquadrarQuandoDer();
  redesenhar();
  armarAjuda();
}

function sairDoMapa() {
  jogo.ligado = false;
  if (jogo.ajudaTimer) clearTimeout(jogo.ajudaTimer);
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === "solo-menu");
  });
}

if (haEcra()) {
  els.openBtns.forEach((b) => b.addEventListener("click", abrirMapa));
  els.exitBtn.addEventListener("click", sairDoMapa);
  els.fitBtn.addEventListener("click", () => { enquadrarQuandoDer(); redesenhar(); });
  els.recomecarBtn.addEventListener("click", () => {
    mapa.donos = {};
    mapa.selecionado = null;
    jogo.jaSugeridos = [];
    redesenhar();
    dizer("Mapa limpo. Outra vez do princípio.");
    armarAjuda();
  });

  els.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  els.canvas.addEventListener("pointerdown", (e) => {
    if (!jogo.ligado) return;
    els.canvas.setPointerCapture(e.pointerId);
    const s = pontoDoEvento(e);
    // Botão direito ou do meio arrastam o mapa — as mesmas regras do quadro
    // branco. Duas telas na mesma app com dois ratos diferentes seria pior do
    // que qualquer uma das escolhas.
    if (e.button === 2 || e.button === 1) {
      mapa.panning = true;
      mapa.panFrom = { x: s.x - mapa.panX, y: s.y - mapa.panY };
      return;
    }
    const m = mundoDoEcra(s.x, s.y);
    const p = paisEm(m.x, m.y);
    mapa.selecionado = p;
    redesenhar();
    if (!p) {
      dizer("Isso é mar. Clica em terra.");
      return;
    }
    if (mapa.donos[p.nome]) {
      dizer(`${p.nome} já está conquistado.`);
      return;
    }
    dizer("Escreve o nome deste país.");
    els.input.focus();
  });

  els.canvas.addEventListener("pointermove", (e) => {
    if (!mapa.panning) return;
    const s = pontoDoEvento(e);
    mapa.panX = s.x - mapa.panFrom.x;
    mapa.panY = s.y - mapa.panFrom.y;
    redesenhar();
  });

  const largar = () => { mapa.panning = false; mapa.panFrom = null; };
  els.canvas.addEventListener("pointerup", largar);
  els.canvas.addEventListener("pointercancel", largar);
  els.canvas.addEventListener("pointerleave", largar);

  els.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = pontoDoEvento(e);
    zoomPor(e.deltaY < 0 ? 1.25 : 1 / 1.25, s.x, s.y);
    redesenhar();
  }, { passive: false });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const escrito = els.input.value.trim();
    if (!escrito) return;
    const alvo = mapa.selecionado;
    if (!alvo) {
      dizer("Escolhe primeiro um país no mapa.");
      return;
    }
    if (!acertou(alvo, escrito)) {
      dizer(`"${escrito}" não é este país. Tenta outra vez.`);
      els.input.select();
      return;
    }
    conquistar(alvo, MINHA_COR);
    els.input.value = "";
    mapa.selecionado = null;
    jogo.ultimaConquista = Date.now();
    jogo.jaSugeridos = [];
    redesenhar();
    armarAjuda();
    dizer(estaCompleto()
      ? "O mundo inteiro! Acabou."
      : `${alvo.nome}, certo. Faltam ${porConquistar().length}.`);
  });

  window.addEventListener("resize", () => { if (jogo.ligado) redesenhar(); });
}

// Exposto para os testes montarem uma partida sem passar pelo rato.
export const __mapa = { mapa, jogo, abrirMapa };
