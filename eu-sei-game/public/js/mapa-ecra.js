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
  MODOS, emJogo, estaEmJogo, enquadrarJogo, revelarPista, bandeiraDe,
  tresHipoteses, ecraDoMundo, RACIO, oceanoEm,
} from "./mapa.js";

const els = {
  screen: document.querySelector('[data-screen="mapa"]'),
  canvas: document.getElementById("mapa-canvas"),
  form: document.getElementById("mapa-form"),
  input: document.getElementById("mapa-input"),
  progresso: document.getElementById("mapa-progresso"),
  modo: document.getElementById("mapa-modo"),
  status: document.getElementById("mapa-status"),
  exitBtn: document.getElementById("mapa-exit-btn"),
  fitBtn: document.getElementById("mapa-fit-btn"),
  recomecarBtn: document.getElementById("mapa-recomecar-btn"),
  ajudaBtn: document.getElementById("mapa-ajuda-btn"),
  hipotesesBtn: document.getElementById("mapa-hipoteses-btn"),
  hipoteses: document.getElementById("mapa-hipoteses"),
  openBtns: document.querySelectorAll("[data-open-mapa]"),
};

// A cor de quem joga sozinho. Em sala cada um terá a sua, como no quadro.
const MINHA_COR = "#b24b38";
// Quanto tempo parado antes de a ajuda aparecer. Conta-se desde a última
// CONQUISTA, não desde o início: uma sala a andar depressa nunca a vê, e uma
// sala encravada recebe-a logo. Foi por isso que se escolheu isto em vez de um
// relógio a contar do princípio.
const AJUDA_APOS_MS = 25000;
// Quanto tempo entre dois pedidos de três hipóteses. Sem espera, o jogo inteiro
// jogava-se a três hipóteses e deixava de ser um jogo de saber onde ficam os
// países.
const ESPERA_HIPOTESES_MS = 30000;

const jogo = {
  ligado: false,
  ultimaConquista: 0,
  sugerido: null,
  jaSugeridos: [],
  hipotesesLivreEm: 0,
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
function enquadrarQuandoDer(soODoJogo = false) {
  if (!ajustarTela()) return false;
  if (soODoJogo) enquadrarJogo();
  else enquadrar();
  return true;
}

// A caixa do que se está a dizer vai POR CIMA DO OCEANO, e não no canto da
// tela: com o mapa a não encher a tela toda (é duas vezes mais largo do que
// alto, a tela quase nunca é), o canto da tela cai fora do mapa e a caixa
// ficava a boiar no nada.
function poisarCaixaNoMapa() {
  const canto = ecraDoMundo(0, 1);
  const largura = RACIO * mapa.zoom;
  const esquerda = Math.max(8, Math.min(mapa.rectW - 40, canto.x + 12));
  const fundo = Math.max(8, mapa.rectH - canto.y + 12);
  els.status.style.left = `${Math.round(esquerda)}px`;
  els.status.style.bottom = `${Math.round(fundo)}px`;
  els.status.style.maxWidth = `${Math.round(Math.min(largura - 24, mapa.rectW - 24))}px`;
  els.hipoteses.style.left = els.status.style.left;
  els.hipoteses.style.bottom = `${Math.round(fundo + els.status.offsetHeight + 8)}px`;
}

function redesenhar() {
  if (!ajustarTela()) return;
  desenhar(els.canvas.getContext("2d"));
  poisarCaixaNoMapa();
  const faltam = porConquistar().length;
  const total = emJogo().length;
  els.progresso.textContent = total ? `${total - faltam} de ${total}` : "";
  els.input.placeholder = mapa.selecionado
    ? `Que país é este?`
    : "Clica num país e escreve o nome";
}

function dizer(texto) {
  els.status.textContent = texto;
}

// O foco volta SEMPRE à caixa. Quem está a jogar escreve, carrega no Enter,
// escreve outra vez — obrigar a ir buscar a caixa com o rato entre respostas
// era o que travava o ritmo. (O Enter já submetia por ser um formulário; o que
// faltava era não perder o foco pelo caminho.)
function focar() {
  if (!jogo.ligado) return;
  // Num quadro de imagem a seguir, e não já: a seguir a um Enter que submete
  // um formulário, o browser ainda mexe no foco depois de o nosso código
  // correr, e um focus() síncrono era desfeito logo a seguir.
  requestAnimationFrame(() => {
    if (jogo.ligado) els.input.focus();
  });
}

function encherModos() {
  if (!els.modo || els.modo.options.length > 0) return;
  MODOS.forEach((m) => {
    const op = document.createElement("option");
    op.value = m.chave;
    op.textContent = m.nome;
    op.title = m.desc;
    els.modo.appendChild(op);
  });
  els.modo.value = mapa.modo;
}

function trocarModo(chave) {
  mapa.modo = chave;
  mapa.donos = {};
  mapa.pistas = [];
  mapa.selecionado = null;
  jogo.jaSugeridos = [];
  jogo.hipotesesLivreEm = 0;
  esconderHipoteses();
  els.hipotesesBtn?.classList.add("hidden");
  // Escolher a Europa e continuar a olhar para o planeta todo era deixar o
  // trabalho de procurar a Europa a quem já disse que era a Europa que queria.
  enquadrarQuandoDer(true);
  redesenhar();
  const m = MODOS.find((x) => x.chave === chave);
  dizer(`${m ? m.nome : chave}: ${emJogo().length} países. Clica num e escreve o nome.`);
  armarAjuda();
  focar();
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
    const p = revelarPista(jogo.jaSugeridos);
    if (!p) return;
    jogo.jaSugeridos.push(p.nome);
    redesenhar();
    // A partir daqui o jogo esteve parado: as três hipóteses ficam à mão.
    els.hipotesesBtn?.classList.remove("hidden");
    const b = bandeiraDe(p);
    dizer(`O Brasa pousou uma bandeira${b ? ` ${b}` : ""} num país que ainda falta.`);
    armarAjuda();
  }, AJUDA_APOS_MS);
}

function esconderHipoteses() {
  els.hipoteses.classList.add("hidden");
  els.hipoteses.innerHTML = "";
}

function mostrarHipoteses(pais) {
  els.hipoteses.innerHTML = "";
  tresHipoteses(pais).forEach((op) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ghost";
    b.dataset.hipotese = op.nome;
    const bandeira = bandeiraDe(op);
    b.textContent = bandeira ? `${bandeira} ${op.nome}` : op.nome;
    b.addEventListener("click", () => {
      esconderHipoteses();
      // Custa a espera QUER SE ACERTE QUER NÃO: se só custasse ao errar, valia
      // sempre a pena pedir.
      jogo.hipotesesLivreEm = Date.now() + ESPERA_HIPOTESES_MS;
      els.input.value = op.nome;
      els.form.requestSubmit();
    });
    els.hipoteses.appendChild(b);
  });
  els.hipoteses.classList.remove("hidden");
  dizer("Três hipóteses. Escolhe uma.");
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
  encherModos();
  els.modo?.addEventListener("change", () => trocarModo(els.modo.value));
  els.openBtns.forEach((b) => b.addEventListener("click", abrirMapa));
  els.exitBtn.addEventListener("click", sairDoMapa);
  els.fitBtn.addEventListener("click", () => { enquadrarQuandoDer(); redesenhar(); });
  els.ajudaBtn?.addEventListener("click", () => {
    const p = revelarPista(jogo.jaSugeridos);
    if (!p) {
      dizer("Já não há mais nada para revelar.");
      return;
    }
    jogo.jaSugeridos.push(p.nome);
    redesenhar();
    const b = bandeiraDe(p);
    dizer(`O Brasa pousou uma bandeira${b ? ` ${b}` : ""} — vê se a reconheces.`);
    armarAjuda();
    focar();
  });

  // TRÊS HIPÓTESES. Só aparece quando o jogo já esteve parado algum tempo — não
  // é para se jogar sempre a três hipóteses, é para destravar quem encalhou. E
  // tem espera entre usos, senão passava a ser a maneira normal de jogar.
  els.hipotesesBtn?.addEventListener("click", () => {
    if (!mapa.selecionado) {
      dizer("Escolhe primeiro um país no mapa.");
      return;
    }
    if (Date.now() < jogo.hipotesesLivreEm) {
      const faltam = Math.ceil((jogo.hipotesesLivreEm - Date.now()) / 1000);
      dizer(`Ainda não — espera ${faltam}s.`);
      return;
    }
    mostrarHipoteses(mapa.selecionado);
  });

  els.recomecarBtn.addEventListener("click", () => {
    mapa.donos = {};
    mapa.pistas = [];
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
    // No modo dos oceanos é a ÁGUA que se clica; nos outros, a terra. O mesmo
    // clique, duas perguntas diferentes.
    const p = mapa.modo === "oceanos" ? oceanoEm(m.x, m.y) : paisEm(m.x, m.y);
    mapa.selecionado = p;
    redesenhar();
    if (!p) {
      dizer(mapa.modo === "oceanos" ? "Isso é terra. Clica na água." : "Isso é mar. Clica em terra.");
      return;
    }
    if (mapa.donos[p.nome]) {
      dizer(`${p.nome} já está conquistado.`);
      return;
    }
    if (!estaEmJogo(p)) {
      // Um clique que não faz nada lê-se como avaria. Dizer porquê custa uma
      // linha e poupa a quem está a jogar a dúvida de se o jogo encravou.
      dizer("Esse país não entra nesta partida. Troca de modo se o quiseres.");
      return;
    }
    dizer("Escreve o nome deste país.");
    focar();
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
      focar();
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
      ? "Acabou — está tudo conquistado!"
      : `${alvo.nome}, certo. Faltam ${porConquistar().length}.`);
    focar();
  });

  // Escape larga o país escolhido sem obrigar a clicar noutro sítio, e limpa o
  // que estava escrito. É a saída para quem clicou no país errado.
  els.input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    els.input.value = "";
    mapa.selecionado = null;
    redesenhar();
    dizer("Escolhe outro país.");
  });

  window.addEventListener("resize", () => { if (jogo.ligado) redesenhar(); });
}

// Exposto para os testes montarem uma partida sem passar pelo rato.
export const __mapa = { mapa, jogo, abrirMapa };
