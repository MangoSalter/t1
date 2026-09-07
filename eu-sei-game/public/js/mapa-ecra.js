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
  tresHipoteses, ecraDoMundo, RACIO, oceanoEm, DIFICULDADES, CAMADAS, porNomeEscrito,
  alvoDaResposta,
  marcador, reiniciarMarcador, registarErro, resumo,
} from "./mapa.js";
import { t, aoMudarLingua } from "./i18n.js";
import { armarCaos, limparCaos } from "./caos.js";

const els = {
  screen: document.querySelector('[data-screen="mapa"]'),
  canvas: document.getElementById("mapa-canvas"),
  form: document.getElementById("mapa-form"),
  input: document.getElementById("mapa-input"),
  progresso: document.getElementById("mapa-progresso"),
  marcador: document.getElementById("mapa-marcador"),
  modo: document.getElementById("mapa-modo"),
  dificuldade: document.getElementById("mapa-dificuldade"),
  camada: document.getElementById("mapa-camada"),
  opcoes: document.getElementById("mapa-opcoes"),
  opcoesBtn: document.getElementById("mapa-opcoes-btn"),
  status: document.getElementById("mapa-status"),
  exitBtn: document.getElementById("mapa-exit-btn"),
  fitBtn: document.getElementById("mapa-fit-btn"),
  recomecarBtn: document.getElementById("mapa-recomecar-btn"),
  ajudaBtn: document.getElementById("mapa-ajuda-btn"),
  hipotesesBtn: document.getElementById("mapa-hipoteses-btn"),
  hipoteses: document.getElementById("mapa-hipoteses"),
  mascote: document.getElementById("mapa-mascote"),
  fim: document.getElementById("mapa-fim"),
  fimNumeros: document.getElementById("mapa-fim-numeros"),
  fimContinentes: document.getElementById("mapa-fim-continentes"),
  fimFecharBtn: document.getElementById("mapa-fim-fechar-btn"),
  fimOutraBtn: document.getElementById("mapa-fim-outra-btn"),
  openBtns: document.querySelectorAll("[data-open-mapa]"),
};

// A cor de quem joga sozinho. Em sala cada um terá a sua, como no quadro.
const MINHA_COR = "#b24b38";
// Sozinho é sempre a mesma; em sala é a que a sala deu a este jogador.
function minhaCor() {
  return jogo.sala?.minhaCor || MINHA_COR;
}
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
  caosTimer: null,
  // A SALA, quando há uma. Sozinho isto fica a null e o ecrã comporta-se como
  // sempre: escreve no mapa que tem à frente e mais nada. Numa sala, o mesmo
  // ecrã passa a avisar quem manda — e é a sala que devolve o estado, porque
  // o país pode ser de outro antes de a resposta chegar lá.
  //
  // O adaptador é propositadamente pequeno (quatro funções) para o motor e o
  // ecrã continuarem sem saber o que é uma sala nem o que é a Firebase.
  sala: null,
};

// Liga (ou desliga, com null) o mapa a uma sala. O adaptador traz:
//   minhaCor            — a cor deste jogador
//   aoConquistar(pais, pontos)  -> promessa de { ganhou, pontos, roubo }
//   aoErrar(pais)               — avisa que este jogador falhou aqui
//   aoRevelar(nome)             — a pista aparece no mapa de toda a gente
export function ligarASala(adaptador) {
  jogo.sala = adaptador || null;
  // Entrar numa sala CANCELA o caos que já estivesse armado do modo sozinho.
  // Sem isto, quem abrisse o mapa sozinho e entrasse numa sala a seguir podia
  // levar com a pata da gata no meio de uma partida partilhada — uma
  // desvantagem que mais ninguém tinha.
  if (jogo.sala && jogo.caosTimer) {
    clearTimeout(jogo.caosTimer);
    jogo.caosTimer = null;
    limparCaos();
  }
  // Recomeçar limpa o mapa de quem carrega. Numa sala isso seria limpar o
  // trabalho dos outros no ecrã de um só — o mapa passaria a estar diferente
  // em cada sítio. O botão sai.
  els.recomecarBtn?.classList.toggle("hidden", !!jogo.sala);
  // Pelo mesmo motivo: "outra vez" limparia o mapa a toda a gente.
  els.fimOutraBtn?.classList.toggle("hidden", !!jogo.sala);
  els.modo?.toggleAttribute("disabled", !!jogo.sala);
  // A camada também não: a sala inteira tem de estar a responder à mesma
  // pergunta, senão os pontos de uns não querem dizer o mesmo que os de outros.
  els.camada?.toggleAttribute("disabled", !!jogo.sala);
}

// A sala manda o estado; o ecrã obedece. Os donos vêm por uid e passam a cor
// aqui, que é onde se sabe quem é quem.
export function aplicarEstadoDaSala(estado, corDe) {
  if (!estado) return;
  const donos = {};
  Object.entries(estado.donos || {}).forEach(([pais, uid]) => {
    donos[pais] = corDe(uid) || "#8a8177";
  });
  mapa.donos = donos;
  mapa.pistas = estado.pistas || [];
  if (estado.modo && estado.modo !== mapa.modo) {
    mapa.modo = estado.modo;
    if (els.modo) els.modo.value = estado.modo;
  }
  if (estado.dificuldade) mapa.dificuldade = estado.dificuldade;
  if (jogo.ligado) redesenhar();
}

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
  // A caixa de escrever some no modo de só clicar: um campo que não serve
  // para nada só ocupa espaço, e no telemóvel esse espaço é o mapa.
  const soClicar = mapa.dificuldade === "escolher";
  els.form.classList.toggle("hidden", soClicar);
  // E aí as três hipóteses são o jogo, não uma ajuda de recurso.
  els.hipotesesBtn?.classList.toggle("hidden", soClicar || els.hipotesesBtn.dataset.destravado !== "1");
  desenhar(els.canvas.getContext("2d"));
  poisarCaixaNoMapa();
  const faltam = porConquistar().length;
  const total = emJogo().length;
  els.progresso.textContent = total ? `${total - faltam} de ${total}` : "";
  // O marcador só aparece depois da primeira jogada: num mapa por estrear não
  // há ritmo nenhum para mostrar, e "0/min" a piscar só desanima.
  const r = resumo();
  els.marcador.textContent = marcador.inicio === null
    ? ""
    : t("mapaMarcador", r.pontos, r.cadeia, r.porMinuto);
  // A caixa pergunta o que a camada quer: pedir "o nome do país" quando se
  // está a jogar às capitais era mandar a pessoa dar a resposta errada.
  const nasCapitais = mapa.camada === "capitais";
  els.input.placeholder = mapa.selecionado
    ? (nasCapitais ? t("mapaQualCapital", mapa.selecionado.nome) : t("mapaQualPais"))
    : t(nasCapitais
      ? (mapa.dificuldade === "livre" ? "mapaCaixaCapitalLivre" : "mapaCaixaCapital")
      : (mapa.dificuldade === "livre" ? "mapaCaixaLivre" : "mapaCaixa"));
}

function dizer(texto) {
  els.status.textContent = texto;
}

// UMA FALA DA CASA ao abrir o mapa. O mapa e o quadro são os dois jogos que
// ficaram em pé, e eram os dois únicos onde a Dona Manga e o Brasa não
// apareciam — havia falas para os doze mini-jogos que entretanto saíram do
// site e nenhuma para estes. Ao abrir, uma fala; passados uns segundos,
// desaparece, porque a seguir o que interessa é o mapa.
let falaTimer = null;
// A DONA MANGA TAMBÉM SE METE NO MAPA. Havia caos nos mini-jogos que foram
// todos para a oficina, e nenhum nos dois que ficaram. Aqui a pata dela tapa
// um bocado do mapa por uns segundos, e quando o Brasa a distrai os pontos
// que ele passa por baixo da mesa entram no marcador — que é onde os pontos
// do mapa vivem.
//
// Nunca em sala: numa partida partilhada, uma pata no ecrã de um só é uma
// desvantagem que os outros não têm.
function armarCaosNoMapa() {
  if (jogo.caosTimer) clearTimeout(jogo.caosTimer);
  jogo.caosTimer = null;
  if (jogo.sala) return;
  jogo.caosTimer = armarCaos({
    continuaAJogar: () => jogo.ligado && !estaCompleto(),
    ecra: () => els.screen,
    aoDisparar: (bonus) => {
      if (bonus > 0) {
        marcador.pontos += bonus;
        redesenhar();
      }
      armarCaosNoMapa();
    },
  });
}

function falaDaCasa() {
  if (!els.mascote) return;
  const falas = t("mapaFalas");
  if (!Array.isArray(falas) || falas.length === 0) return;
  const [quem, texto] = falas[Math.floor(Math.random() * falas.length)];
  els.mascote.innerHTML = "";
  const b = document.createElement("b");
  b.textContent = `${quem}: `;
  els.mascote.append(b, document.createTextNode(`“${texto}”`));
  els.mascote.classList.remove("hidden", "a-sair");
  if (falaTimer) clearTimeout(falaTimer);
  falaTimer = setTimeout(() => {
    els.mascote.classList.add("a-sair");
    falaTimer = setTimeout(() => els.mascote.classList.add("hidden"), 700);
  }, 7000);
}

// A sala também precisa de falar na caixa de estado — para contar o que
// aconteceu longe deste ecrã, como a Dona Manga a roubar um país a alguém.
export function dizerNoMapa(texto) {
  dizer(texto);
}

// O que se diz depois de acertar. No fim, o retrato da partida — é o momento
// em que apetece saber quanto se fez, e não só que acabou. A meio, uma
// sequência a sério (3 ou mais) é notícia; abaixo disso, o de sempre.
// O RETRATO DA PARTIDA, em painel. Estava numa linha de estado com nove
// números separados por pontos — cabia, mas ninguém o lia, e era pena: os
// números são a única coisa que uma pessoa quer contar a outra depois de
// acabar um mapa. Aqui cada um tem o seu lugar e o seu rótulo.
function mostrarFim() {
  if (!els.fim) return;
  const r = resumo();
  const linhas = [
    [r.certos, t("mapaFimPaises")],
    [t("mapaFimSegundos", r.segundos), t("mapaFimTempo")],
    [r.pontos, t("mapaFimPontos")],
    [r.porMinuto, t("mapaFimRitmo")],
    [r.melhorCadeia, t("mapaFimCadeia")],
    r.precisao === null ? null : [`${r.precisao}%`, t("mapaFimPrecisao")],
    r.tempoMedio === null ? null : [t("mapaFimSegundos", r.tempoMedio), t("mapaFimMedia")],
    r.maisRapido ? [r.maisRapido.nome, `${t("mapaFimRapido")} (${t("mapaFimSegundos", r.maisRapido.segundos)})`] : null,
    r.favorito ? [r.favorito.cont, t("mapaFimForte")] : null,
    [`${r.semPista}/${r.certos}`, t("mapaFimDeCabeca")],
  ].filter(Boolean);
  els.fimNumeros.innerHTML = "";
  linhas.forEach(([valor, rotulo]) => {
    const li = document.createElement("li");
    const b = document.createElement("b");
    b.textContent = String(valor);
    const s2 = document.createElement("span");
    s2.textContent = rotulo;
    li.append(b, s2);
    els.fimNumeros.appendChild(li);
  });
  // A cobertura por continente, em barras. Diz mais do que um total: 8 de 54
  // em África e 40 de 45 na Europa é o retrato de quem sabe a Europa.
  els.fimContinentes.innerHTML = "";
  Object.entries(r.cobertura)
    .sort((a, b) => (b[1].feitos / b[1].total) - (a[1].feitos / a[1].total))
    .forEach(([cont, n]) => {
      const div = document.createElement("div");
      div.className = "mapa-fim-cont";
      const nome = document.createElement("span");
      nome.textContent = cont;
      const conta = document.createElement("span");
      conta.textContent = `${n.feitos}/${n.total}`;
      const barra = document.createElement("div");
      barra.className = "mapa-fim-barra";
      const dentro = document.createElement("i");
      dentro.style.width = `${Math.round((n.feitos / Math.max(1, n.total)) * 100)}%`;
      barra.appendChild(dentro);
      div.append(nome, conta, barra);
      els.fimContinentes.appendChild(div);
    });
  els.fim.classList.remove("hidden");
}

function esconderFim() {
  els.fim?.classList.add("hidden");
}

function mensagemDeAcerto(pais) {
  if (estaCompleto()) { mostrarFim(); return t("mapaAcabou"); }
  const ultima = marcador.jogadas[marcador.jogadas.length - 1];
  if (marcador.cadeia >= 3 && ultima) {
    return t("mapaCadeia", marcador.cadeia, ultima.pontos);
  }
  return t("mapaCerto", pais.nome, porConquistar().length);
}

// Avisa a sala de uma conquista — e trata do caso que só existe em sala: dois
// jogadores a escrever o mesmo país ao mesmo tempo. A sala decide, e quem
// chegou tarde tem de largar o país que já tinha pintado no seu ecrã. Sem
// isto, cada um ficava a ver um mapa diferente e ambos julgavam ter ganho.
async function avisarASala(pais) {
  if (!jogo.sala) return;
  const ultima = marcador.jogadas[marcador.jogadas.length - 1];
  const resposta = await jogo.sala.aoConquistar(pais, ultima ? ultima.pontos : 0);
  if (!resposta || resposta.ganhou) {
    if (resposta && resposta.roubo) dizer(t("mapaRoubado", pais.nome, resposta.pontos));
    return;
  }
  delete mapa.donos[pais.nome];
  marcador.jogadas = marcador.jogadas.filter((j) => j.nome !== pais.nome);
  marcador.pontos = Math.max(0, marcador.pontos - (ultima ? ultima.pontos : 0));
  redesenhar();
  dizer(t("mapaTarde", pais.nome));
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

function encherDificuldades() {
  if (!els.dificuldade || els.dificuldade.options.length > 0) return;
  DIFICULDADES.forEach((d) => {
    const op = document.createElement("option");
    op.value = d.chave;
    op.textContent = d.nome;
    op.title = d.desc;
    els.dificuldade.appendChild(op);
  });
  els.dificuldade.value = mapa.dificuldade;
}

function encherCamadas() {
  if (!els.camada || els.camada.options.length > 0) return;
  CAMADAS.forEach((c) => {
    const op = document.createElement("option");
    op.value = c.chave;
    op.textContent = c.nome;
    op.title = c.desc;
    els.camada.appendChild(op);
  });
  els.camada.value = mapa.camada;
}

// Trocar de camada é começar outra partida: o que se conquistou a nomear
// países não conta a nomear capitais, e o marcador tem de recomeçar com ele.
function trocarCamada(chave) {
  mapa.camada = chave;
  mapa.donos = {};
  mapa.pistas = [];
  mapa.selecionado = null;
  jogo.jaSugeridos = [];
  jogo.hipotesesLivreEm = 0;
  reiniciarMarcador();
  esconderFim();
  esconderHipoteses();
  enquadrarQuandoDer(true);
  redesenhar();
  const c = CAMADAS.find((x) => x.chave === chave);
  dizer(chave === "capitais" ? t("mapaCamadaCapitais", emJogo().length) : t("mapaModoPronto", c ? c.nome : chave, emJogo().length));
  armarAjuda();
  focar();
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
  // Trocar de modo é começar outra partida: o ritmo e a sequência da Europa
  // não podem ser levados para a África.
  reiniciarMarcador();
  esconderFim();
  jogo.hipotesesLivreEm = 0;
  esconderHipoteses();
  if (els.hipotesesBtn) delete els.hipotesesBtn.dataset.destravado;
  // Escolher a Europa e continuar a olhar para o planeta todo era deixar o
  // trabalho de procurar a Europa a quem já disse que era a Europa que queria.
  enquadrarQuandoDer(true);
  redesenhar();
  const m = MODOS.find((x) => x.chave === chave);
  dizer(t("mapaModoPronto", m ? m.nome : chave, emJogo().length));
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
    jogo.sala?.aoRevelar(p.nome);
    redesenhar();
    // A partir daqui o jogo esteve parado: as três hipóteses ficam à mão.
    if (els.hipotesesBtn) els.hipotesesBtn.dataset.destravado = "1";
    const b = bandeiraDe(p);
    dizer(t("mapaBandeira", b));
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
    // Na camada das capitais as três hipóteses são CAPITAIS: mostrar os nomes
    // dos países quando a pergunta é a capital seria oferecer três respostas
    // todas erradas. A bandeira fica — diz de que país se trata, e saber isso
    // não é o mesmo que saber a capital dele.
    const resposta = alvoDaResposta(op);
    const etiqueta = resposta ? resposta.nome : op.nome;
    b.dataset.hipotese = etiqueta;
    const bandeira = bandeiraDe(op);
    b.textContent = bandeira ? `${bandeira} ${etiqueta}` : etiqueta;
    b.addEventListener("click", () => {
      esconderHipoteses();
      // Custa a espera QUER SE ACERTE QUER NÃO: se só custasse ao errar, valia
      // sempre a pena pedir.
      if (mapa.dificuldade !== "escolher") jogo.hipotesesLivreEm = Date.now() + ESPERA_HIPOTESES_MS;
      els.input.value = etiqueta;
      els.form.requestSubmit();
    });
    els.hipoteses.appendChild(b);
  });
  els.hipoteses.classList.remove("hidden");
  dizer(t("mapaTresEscolhe"));
}

function abrirMapa() {
  if (!haEcra()) return;
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === "mapa");
  });
  jogo.ligado = true;
  if (mapa.paises.length === 0) {
    dizer(t("mapaACarregar"));
    carregarPaises()
      .then(() => {
        enquadrarQuandoDer();
        redesenhar();
        dizer(t("mapaComecar"));
        armarAjuda();
        falaDaCasa();
        armarCaosNoMapa();
      })
      .catch(() => dizer(t("mapaSemMapa")));
    return;
  }
  enquadrarQuandoDer();
  redesenhar();
  armarAjuda();
  falaDaCasa();
  armarCaosNoMapa();
}

function sairDoMapa() {
  jogo.ligado = false;
  if (jogo.ajudaTimer) clearTimeout(jogo.ajudaTimer);
  if (jogo.caosTimer) clearTimeout(jogo.caosTimer);
  jogo.caosTimer = null;
  limparCaos();
  // Numa sala, o botão de voltar não é para sair do mapa: o mapa é a partida,
  // e sair dela é obra de quem manda. Quem toca aqui pede à sala para acabar,
  // e a sala é que muda o ecrã de toda a gente.
  if (jogo.sala) {
    jogo.sala.aoSair?.();
    return;
  }
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === "solo-menu");
  });
}

if (haEcra()) {
  encherModos();
  encherDificuldades();
  encherCamadas();
  els.modo?.addEventListener("change", () => trocarModo(els.modo.value));
  els.camada?.addEventListener("change", () => trocarCamada(els.camada.value));

  // No telemóvel as escolhas da partida vivem atrás do ⚙️. Escolher uma
  // fecha o painel: quem trocou de modo quer ver o mapa, não a lista.
  els.opcoesBtn?.addEventListener("click", () => {
    const aberto = els.opcoes.classList.toggle("aberto");
    els.opcoesBtn.setAttribute("aria-expanded", String(aberto));
  });
  [els.modo, els.dificuldade, els.camada].forEach((sel) => {
    sel?.addEventListener("change", () => {
      els.opcoes?.classList.remove("aberto");
      els.opcoesBtn?.setAttribute("aria-expanded", "false");
    });
  });
  // Tocar fora fecha-o também, como qualquer painel desta app.
  document.addEventListener("click", (e) => {
    if (!els.opcoes?.classList.contains("aberto")) return;
    if (els.opcoes.contains(e.target) || els.opcoesBtn?.contains(e.target)) return;
    els.opcoes.classList.remove("aberto");
    els.opcoesBtn?.setAttribute("aria-expanded", "false");
  });
  els.dificuldade?.addEventListener("change", () => {
    mapa.dificuldade = els.dificuldade.value;
    mapa.selecionado = null;
    esconderHipoteses();
    redesenhar();
    const d = DIFICULDADES.find((x) => x.chave === mapa.dificuldade);
    dizer(d ? d.desc : "");
    focar();
  });
  els.openBtns.forEach((b) => b.addEventListener("click", abrirMapa));
  els.exitBtn.addEventListener("click", sairDoMapa);
  els.fitBtn.addEventListener("click", () => { enquadrarQuandoDer(); redesenhar(); });
  els.ajudaBtn?.addEventListener("click", () => {
    const p = revelarPista(jogo.jaSugeridos);
    if (!p) {
      dizer(t("mapaSemPistas"));
      return;
    }
    jogo.jaSugeridos.push(p.nome);
    jogo.sala?.aoRevelar(p.nome);
    redesenhar();
    const b = bandeiraDe(p);
    dizer(t("mapaBandeiraPedida", b));
    armarAjuda();
    focar();
  });

  // TRÊS HIPÓTESES. Só aparece quando o jogo já esteve parado algum tempo — não
  // é para se jogar sempre a três hipóteses, é para destravar quem encalhou. E
  // tem espera entre usos, senão passava a ser a maneira normal de jogar.
  els.hipotesesBtn?.addEventListener("click", () => {
    if (!mapa.selecionado) {
      dizer(t("mapaEscolhePrimeiro"));
      return;
    }
    if (mapa.dificuldade !== "escolher" && Date.now() < jogo.hipotesesLivreEm) {
      const faltam = Math.ceil((jogo.hipotesesLivreEm - Date.now()) / 1000);
      dizer(t("mapaEspera", faltam));
      return;
    }
    mostrarHipoteses(mapa.selecionado);
  });

  els.fimFecharBtn?.addEventListener("click", () => {
    esconderFim();
    focar();
  });
  els.fimOutraBtn?.addEventListener("click", () => {
    esconderFim();
    els.recomecarBtn?.click();
  });

  els.recomecarBtn.addEventListener("click", () => {
    mapa.donos = {};
    mapa.pistas = [];
    mapa.selecionado = null;
    jogo.jaSugeridos = [];
    reiniciarMarcador();
    esconderFim();
    redesenhar();
    dizer(t("mapaLimpo"));
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
      dizer(t(mapa.modo === "oceanos" ? "mapaETerra" : "mapaEMar"));
      return;
    }
    if (mapa.donos[p.nome]) {
      dizer(t("mapaJaEsta", p.nome));
      return;
    }
    if (!estaEmJogo(p)) {
      // Um clique que não faz nada lê-se como avaria. Dizer porquê custa uma
      // linha e poupa a quem está a jogar a dúvida de se o jogo encravou.
      dizer(t("mapaForaDoModo"));
      return;
    }
    // No modo de escolher não se escreve nada: clicar já traz as três
    // hipóteses. É o que torna o jogo jogável num telemóvel, onde o teclado
    // tapa metade do mapa.
    if (mapa.dificuldade === "escolher") {
      mostrarHipoteses(p);
      return;
    }
    dizer(t("mapaEscreveNome"));
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
    // No modo LIVRE basta escrever: o jogo procura o país. No APONTADO é
    // preciso ter apontado primeiro — é aí que está a dificuldade, porque
    // obriga a reconhecer a forma e não só a lembrar-se do nome.
    const alvo = mapa.selecionado
      || (mapa.dificuldade === "livre" ? porNomeEscrito(escrito) : null);
    if (!alvo) {
      dizer(mapa.dificuldade === "livre"
        ? t("mapaNaoFalta", escrito)
        : t("mapaEscolhePrimeiro"));
      els.input.select();
      focar();
      return;
    }
    if (!acertou(alvo, escrito)) {
      registarErro();
      // Numa sala, errar em cima de um país deixa-o em causa para os outros.
      jogo.sala?.aoErrar(alvo);
      dizer(t("mapaErrado", escrito));
      redesenhar();
      els.input.select();
      focar();
      return;
    }
    conquistar(alvo, minhaCor());
    els.input.value = "";
    mapa.selecionado = null;
    jogo.ultimaConquista = Date.now();
    jogo.jaSugeridos = [];
    redesenhar();
    armarAjuda();
    dizer(mensagemDeAcerto(alvo));
    avisarASala(alvo);
    focar();
  });

  // Escape larga o país escolhido sem obrigar a clicar noutro sítio, e limpa o
  // que estava escrito. É a saída para quem clicou no país errado.
  els.input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    els.input.value = "";
    mapa.selecionado = null;
    redesenhar();
    dizer(t("mapaEscolheOutro"));
  });

  window.addEventListener("resize", () => { if (jogo.ligado) redesenhar(); });
  // Mudar de língua a meio de uma partida não pode obrigar a recomeçar: o que
  // está no ecrã volta a ser escrito, e o jogo continua onde estava.
  aoMudarLingua(() => { if (jogo.ligado) redesenhar(); });
}

// Exposto para os testes montarem uma partida sem passar pelo rato.
export const __mapa = { mapa, jogo, abrirMapa };
