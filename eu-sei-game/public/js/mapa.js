// O MAPA-MÚNDI — clicar num país e escrever o nome.
//
// Duas decisões que explicam o resto do ficheiro:
//
// 1. Os países são POLÍGONOS, não pontos. É isso que permite pintar o
//    território de quem acertou e saber em qual se clicou. Os dados vêm do
//    Natural Earth e estão em public/data/paises.json, já projetados: ver
//    tools/gerar-mapa.mjs.
// 2. A projeção é equiretangular, o que faz o mundo ter o DOBRO da largura da
//    altura. As coordenadas guardadas vão de 0 a 1 nos dois eixos, e é aqui
//    que se corrige: x conta a dobrar. Sem isto o mundo aparecia esticado ao
//    alto e ninguém reconhecia nada.
//
// A câmara é a mesma ideia do quadro branco: ecrã = mundo * zoom + pan. E o
// rato obedece às mesmas regras que lá — botão direito arrasta, roda dá zoom —
// porque duas telas na mesma app com dois ratos diferentes seria pior do que
// qualquer uma das escolhas.
import { sameWord } from "./data.js";

export const RACIO = 2; // o mundo é duas vezes mais largo do que alto

// O zoom conta-se em PIXÉIS POR UNIDADE DE MUNDO, e o mundo mede 1 de altura —
// por isso o zoom que enche uma tela de 600 px de alto é 600, não 1. Os
// limites não podem ser números fixos: numa tela pequena, 12 seria um mapa do
// tamanho de uma unha, e foi exatamente isso que o teste apanhou. São
// relativos ao enquadramento — não se afasta para lá do mundo inteiro, e
// aproxima-se até vinte vezes isso, que chega para a Gâmbia.
export const ZOOM_MAX_FATOR = 20;
const ZOOM_STEP = 1.25;

function zoomQueEnquadra() {
  if (!mapa.rectW || !mapa.rectH) return 1;
  return Math.min(mapa.rectW / RACIO, mapa.rectH);
}

export function limitesDeZoom() {
  const base = zoomQueEnquadra();
  return { min: base, max: base * ZOOM_MAX_FATOR };
}

export const mapa = {
  paises: [],
  porNome: new Map(),
  donos: {},        // nome do país -> cor de quem o conquistou
  zoom: 1,
  panX: 0,
  panY: 0,
  rectW: 0,
  rectH: 0,
  dpr: 1,
  selecionado: null,
  modo: "mundo",
  // Os países cuja bandeira já foi revelada como pista. Some quando o país é
  // conquistado: a pista deixou de ser pista.
  pistas: [],
  panning: false,
  panFrom: null,
};

export async function carregarPaises(url = "data/paises.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`não consegui ler o mapa (${res.status})`);
  const dados = await res.json();
  mapa.paises = dados;
  mapa.porNome = new Map(dados.map((p) => [p.nome, p]));
  return dados;
}

// --- Câmara ---------------------------------------------------------------

export function mundoDoEcra(sx, sy) {
  return {
    x: (sx - mapa.panX) / mapa.zoom / RACIO,
    y: (sy - mapa.panY) / mapa.zoom,
  };
}

export function ecraDoMundo(x, y) {
  return { x: x * RACIO * mapa.zoom + mapa.panX, y: y * mapa.zoom + mapa.panY };
}

// Enquadra o mundo inteiro na tela. É o ponto de partida e o botão de fuga
// para quem se perder a aproximar.
export function enquadrar() {
  if (!mapa.rectW || !mapa.rectH) return;
  mapa.zoom = zoomQueEnquadra();
  mapa.panX = (mapa.rectW - RACIO * mapa.zoom) / 2;
  mapa.panY = (mapa.rectH - mapa.zoom) / 2;
}

// Enquadra o que está EM JOGO. Escolher "Europa" e continuar a olhar para o
// planeta todo era deixar o trabalho de procurar a Europa a quem já disse que
// era a Europa que queria. Com o mundo inteiro escolhido dá no mesmo que o
// enquadrar de cima, porque o que está em jogo é o mundo.
export function enquadrarJogo() {
  if (!mapa.rectW || !mapa.rectH) return;
  const lista = emJogo();
  if (lista.length === 0) return enquadrar();
  let x0 = 1; let y0 = 1; let x1 = 0; let y1 = 0;
  lista.forEach((p) => p.aneis.forEach((a) => a.forEach(([x, y]) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  })));
  // Uma margem à volta, senão os países da beira ficam colados ao caixilho.
  const margem = 0.04;
  const largura = Math.max(1e-6, (x1 - x0) * RACIO * (1 + margem * 2));
  const altura = Math.max(1e-6, (y1 - y0) * (1 + margem * 2));
  const z = Math.min(mapa.rectW / largura, mapa.rectH / altura);
  const { min, max } = limitesDeZoom();
  mapa.zoom = Math.max(min, Math.min(max, z));
  const meioX = ((x0 + x1) / 2) * RACIO * mapa.zoom;
  const meioY = ((y0 + y1) / 2) * mapa.zoom;
  mapa.panX = mapa.rectW / 2 - meioX;
  mapa.panY = mapa.rectH / 2 - meioY;
}

export function zoomPor(fator, ancoraX, ancoraY) {
  const antes = mundoDoEcra(ancoraX, ancoraY);
  const { min, max } = limitesDeZoom();
  mapa.zoom = Math.max(min, Math.min(max, mapa.zoom * fator));
  // O ponto do mundo que estava debaixo do rato tem de lá continuar: é isso
  // que faz o zoom parecer que se aproxima do sítio para onde se olha, e não
  // do meio do ecrã.
  const depois = ecraDoMundo(antes.x, antes.y);
  mapa.panX += ancoraX - depois.x;
  mapa.panY += ancoraY - depois.y;
}

// --- Em que país é que se clicou -----------------------------------------

// Raio para a direita: conta quantas fronteiras atravessa. Ímpar = está
// dentro. É o algoritmo de sempre, e chega: os polígonos são simples e são
// poucos milhares de pontos ao todo.
export function dentroDoAnel(anel, x, y) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

export function paisEm(x, y) {
  // Do fim para o princípio: os países pequenos vêm depois dos grandes nos
  // dados, e quem clica num país pequeno encostado a um grande quer o pequeno.
  for (let i = mapa.paises.length - 1; i >= 0; i -= 1) {
    const p = mapa.paises[i];
    for (const anel of p.aneis) {
      if (dentroDoAnel(anel, x, y)) return p;
    }
  }
  return null;
}

// --- O jogo ---------------------------------------------------------------

// OS OCEANOS, como territórios.
//
// Não vêm nos dados dos países (o Natural Earth desenha terra), e desenhá-los
// com a forma verdadeira seria desenhar o negativo do mundo inteiro. Aqui são
// retângulos: aproximados de propósito, porque o que o jogo pergunta é "que
// oceano é este?", e para isso a mancha certa no sítio certo chega.
//
// Ficam com a mesma forma de dados dos países — nome, alcunhas, anéis — para
// tudo o resto funcionar sem saber que são oceanos: o clique, o centro da
// bandeira, a conquista, o desenho.
function caixa(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

// Limites por longitude e latitude, convertidos para fração do mapa:
// x = (lon+180)/360, y = (90-lat)/180.
const ARTICO_ATE = (90 - 66) / 180;      // acima do Círculo Polar Ártico
const ANTARTICO_DE = (90 + 60) / 180;    // abaixo dos 60 S
const ATLANTICO_X0 = (-70 + 180) / 360;
const ATLANTICO_X1 = (20 + 180) / 360;
const INDICO_X1 = (120 + 180) / 360;

export const OCEANOS = [
  {
    nome: "Oceano Pacífico", en: "Pacific Ocean", oceano: true,
    alt: ["pacifico", "oceano pacifico"],
    aneis: [
      caixa(0, ARTICO_ATE, ATLANTICO_X0, ANTARTICO_DE),
      caixa(INDICO_X1, ARTICO_ATE, 1, ANTARTICO_DE),
    ],
  },
  {
    nome: "Oceano Atlântico", en: "Atlantic Ocean", oceano: true,
    alt: ["atlantico", "oceano atlantico"],
    aneis: [caixa(ATLANTICO_X0, ARTICO_ATE, ATLANTICO_X1, ANTARTICO_DE)],
  },
  {
    nome: "Oceano Índico", en: "Indian Ocean", oceano: true,
    alt: ["indico", "oceano indico"],
    aneis: [caixa(ATLANTICO_X1, ARTICO_ATE, INDICO_X1, ANTARTICO_DE)],
  },
  {
    nome: "Oceano Antártico", en: "Southern Ocean", oceano: true,
    alt: ["antartico", "oceano antartico", "oceano austral", "austral"],
    aneis: [caixa(0, ANTARTICO_DE, 1, 1)],
  },
  {
    nome: "Oceano Glacial Ártico", en: "Arctic Ocean", oceano: true,
    alt: ["artico", "oceano artico", "glacial artico", "oceano glacial artico"],
    aneis: [caixa(0, 0, 1, ARTICO_ATE)],
  },
];

// Em que oceano se clicou. Só vale onde NÃO há terra: clicar em Portugal é
// clicar em Portugal, mesmo com o Atlântico ali ao lado.
export function oceanoEm(x, y) {
  if (paisEm(x, y)) return null;
  return OCEANOS.find((o) => o.aneis.some((a) => dentroDoAnel(a, x, y))) || null;
}

// --- Os modos ---
//
// Encarar 177 países de uma assentada é muito para quem está a começar e
// demasiado longo para uma partida entre amigos. O jogador escolhe o tamanho
// do mundo que quer: o planeta inteiro, um continente de cada vez, ou só os
// países grandes — que é a versão que se ganha, e que ensina o mapa antes de o
// exigir todo.
export const MODOS = [
  { chave: "mundo", nome: "O mundo inteiro", desc: "Os 177 países." },
  { chave: "grandes", nome: "Só os grandes", desc: "Os 60 maiores. Bom para começar." },
  { chave: "Europa", nome: "Europa", desc: "Um continente de cada vez." },
  { chave: "África", nome: "África", desc: "Um continente de cada vez." },
  { chave: "Ásia", nome: "Ásia", desc: "Um continente de cada vez." },
  { chave: "América do Norte", nome: "América do Norte", desc: "Um continente de cada vez." },
  { chave: "América do Sul", nome: "América do Sul", desc: "Um continente de cada vez." },
  { chave: "Oceânia", nome: "Oceânia", desc: "Um continente de cada vez." },
  { chave: "oceanos", nome: "Os oceanos", desc: "Cinco. Clica na água e diz qual é." },
];

const QUANTOS_GRANDES = 60;

export function areaDoPais(p) {
  return p.aneis.reduce((soma, a) => soma + Math.abs(areaDoAnel(a)), 0);
}

// Os países que ESTÃO EM JOGO no modo escolhido. Os outros continuam a
// desenhar-se, apagados: um mapa da Europa com o resto do mundo em branco
// continua a ser um mapa: ajuda a situar, e tirar o resto era pior.
export function emJogo() {
  if (mapa.modo === "oceanos") return OCEANOS;
  if (mapa.modo === "mundo") return mapa.paises;
  if (mapa.modo === "grandes") {
    return mapa.paises.slice()
      .sort((a, b) => areaDoPais(b) - areaDoPais(a))
      .slice(0, QUANTOS_GRANDES);
  }
  return mapa.paises.filter((p) => p.cont === mapa.modo);
}

export function estaEmJogo(pais) {
  return !!pais && emJogo().includes(pais);
}

export function porConquistar() {
  return emJogo().filter((p) => !mapa.donos[p.nome]);
}

export function estaCompleto() {
  return emJogo().length > 0 && porConquistar().length === 0;
}

// Acertar no nome. O jogo é sobre CONHECER o país, não sobre o soletrar, e a
// regra segue isso em três degraus:
//
//  1. o nome, em português ou em inglês — quem escreve "Germany" sabe o país;
//  2. as alcunhas — "EUA", "Holanda", "Inglaterra", "Birmânia": é assim que as
//     pessoas lhes chamam, e recusar seria teimosia;
//  3. uma gralha — uma letra trocada, a mais ou a menos ("Portgual",
//     "Alemana"). Duas gralhas só em nomes compridos, onde uma letra a mais
//     ou a menos ainda não deixa dúvidas sobre qual é o país.
//
// O que NÃO se aceita é escrever meio nome: "Guiné" não vale por
// "Guiné-Bissau", senão os países de nome parecido resolviam-se uns aos
// outros.
export function acertou(pais, escrito) {
  if (!pais) return false;
  if (sameWord(escrito, pais.nome) || sameWord(escrito, pais.en)) return true;
  if ((pais.alt || []).some((a) => sameWord(escrito, a))) return true;
  return [pais.nome, pais.en, ...(pais.alt || [])].some((n) => quaseIgual(escrito, n));
}

export function limpar(t) {
  return String(t || "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt").trim().replace(/\s+/g, " ");
}

// Distância de edição, com paragem antecipada: assim que passa do que se
// tolera, desiste. Não interessa saber que estão a 9 de distância — interessa
// saber que estão a mais de uma ou duas.
export function quaseIgual(a, b) {
  const x = limpar(a);
  const y = limpar(b);
  if (!x || !y) return false;
  const tolerancia = y.length >= 9 ? 2 : (y.length >= 5 ? 1 : 0);
  if (tolerancia === 0) return false;
  if (Math.abs(x.length - y.length) > tolerancia) return false;
  let anterior = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const atual = [i];
    let melhor = i;
    for (let j = 1; j <= y.length; j += 1) {
      const custo = x[i - 1] === y[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      if (atual[j] < melhor) melhor = atual[j];
    }
    if (melhor > tolerancia) return false;
    anterior = atual;
  }
  return anterior[y.length] <= tolerancia;
}

// Revela a bandeira de um país que ainda falta. Devolve o país revelado, ou
// null se não houver nada para revelar.
export function revelarPista(evitar = []) {
  const p = sugerir([...evitar, ...mapa.pistas]);
  if (!p) return null;
  mapa.pistas = [...mapa.pistas, p.nome];
  return p;
}

export function conquistar(pais, cor) {
  if (!pais || mapa.donos[pais.nome]) return false;
  mapa.donos[pais.nome] = cor;
  return true;
}

// A BANDEIRA como pista. Um emoji de bandeira são duas letras em alfabeto de
// sinalização — com "PT" sai 🇵🇹 —, por isso não há imagem nenhuma a
// descarregar, nada que possa faltar do servidor e nada com marca de água.
// Onde o sistema não desenhar bandeiras (o Windows não desenha), aparecem as
// duas letras, que continuam a ser uma pista.
export function bandeiraDe(pais) {
  const iso = pais?.iso;
  if (!iso || iso.length !== 2) return "";
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// Onde pousar a bandeira: no meio do MAIOR pedaço do país. No meio de todos os
// pedaços juntos, a bandeira da Indonésia ia parar ao mar entre as ilhas.
export function centroDe(pais) {
  let melhor = null;
  let melhorArea = -1;
  pais.aneis.forEach((a) => {
    const area = Math.abs(areaDoAnel(a));
    if (area > melhorArea) { melhorArea = area; melhor = a; }
  });
  if (!melhor) return { x: 0, y: 0 };
  let x0 = 1; let y0 = 1; let x1 = 0; let y1 = 0;
  melhor.forEach(([x, y]) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  });
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

// TRÊS HIPÓTESES para um país escolhido: a certa e duas para confundir. As
// erradas vêm do mesmo continente sempre que houver — três nomes de sítios
// completamente diferentes do mundo não são uma escolha, são uma oferta.
export function tresHipoteses(pais, aleatorio = Math.random) {
  if (!pais) return [];
  const mesmoContinente = mapa.paises.filter((p) => p !== pais && p.cont === pais.cont);
  const resto = mapa.paises.filter((p) => p !== pais && p.cont !== pais.cont);
  const poco = mesmoContinente.length >= 2 ? mesmoContinente : [...mesmoContinente, ...resto];
  const escolhidas = [];
  const usadas = new Set();
  while (escolhidas.length < 2 && usadas.size < poco.length) {
    const i = Math.floor(aleatorio() * poco.length);
    if (usadas.has(i)) continue;
    usadas.add(i);
    escolhidas.push(poco[i]);
  }
  const todas = [pais, ...escolhidas];
  // Baralhar, senão a certa era sempre a primeira e isto deixava de ser uma
  // escolha.
  for (let i = todas.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [todas[i], todas[j]] = [todas[j], todas[i]];
  }
  return todas;
}

// A sugestão para quando o jogo estagna. Vem do que FALTA, nunca do que já
// está — sugerir um país já conquistado seria a app a não estar a prestar
// atenção. Prefere os grandes: são os que se reconhecem, e quem está
// encravado precisa de uma ajuda que ajude.
export function sugerir(evitar = []) {
  const faltam = porConquistar().filter((p) => !evitar.includes(p.nome));
  if (faltam.length === 0) return null;
  return faltam.slice().sort((a, b) => areaDoPais(b) - areaDoPais(a))[0];
}

export function areaDoAnel(anel) {
  let a = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    a += (anel[j][0] + anel[i][0]) * (anel[j][1] - anel[i][1]);
  }
  return a / 2;
}

// --- Desenho --------------------------------------------------------------

export function desenhar(ctx) {
  const { rectW, rectH, dpr } = mapa;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rectW, rectH);

  // O mar primeiro, e só dentro do retângulo do mundo: fora dele é a mesa,
  // não é oceano.
  const canto = ecraDoMundo(0, 0);
  ctx.fillStyle = "#2f86d8";
  ctx.fillRect(canto.x, canto.y, RACIO * mapa.zoom, mapa.zoom);

  ctx.lineJoin = "round";
  const emJogoSet = new Set(emJogo());

  // Os oceanos primeiro e por baixo: a terra desenha-se por cima, senão o
  // retângulo do Atlântico tapava meia Europa.
  if (mapa.modo === "oceanos") {
    OCEANOS.forEach((o) => {
      const dono = mapa.donos[o.nome];
      if (!dono && o !== mapa.selecionado) return;
      ctx.beginPath();
      o.aneis.forEach((anel) => {
        anel.forEach(([x, y], i) => {
          const s = ecraDoMundo(x, y);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
      });
      if (dono) {
        ctx.fillStyle = dono;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (o === mapa.selecionado) {
        ctx.strokeStyle = "#3a3126";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });
  }

  mapa.paises.forEach((p) => {
    const dono = mapa.donos[p.nome];
    ctx.beginPath();
    p.aneis.forEach((anel) => {
      anel.forEach(([x, y], i) => {
        const s = ecraDoMundo(x, y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
    });
    // Fora do modo escolhido, o país continua desenhado mas apagado: um mapa
    // da Europa com o resto do mundo em branco ajuda a situar, e tirá-lo do
    // desenho era pior do que deixá-lo lá quieto.
    const joga = emJogoSet.has(p);
    ctx.fillStyle = dono || (joga ? "#f6f2e8" : "#d9d3c6");
    ctx.fill();
    ctx.strokeStyle = p === mapa.selecionado ? "#3a3126" : "rgba(58,49,38,0.45)";
    ctx.lineWidth = p === mapa.selecionado ? 2.5 : 0.8;
    ctx.stroke();
  });

  // As pistas por cima de tudo: a bandeira pousada dentro do país a que
  // pertence. Desenhadas no fim para nenhum país as tapar.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  mapa.pistas.forEach((nome) => {
    const p = mapa.porNome.get(nome) || OCEANOS.find((o) => o.nome === nome);
    if (!p || mapa.donos[nome]) return;
    const c = centroDe(p);
    const s = ecraDoMundo(c.x, c.y);
    const tamanho = Math.max(14, Math.min(42, mapa.zoom * 0.05));
    ctx.font = `${tamanho}px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif`;
    const bandeira = bandeiraDe(p);
    // Sem bandeira (os territórios sem código ISO), a pista é o nome — mais
    // vale isso do que um espaço em branco que não ajuda ninguém.
    if (bandeira) {
      ctx.fillText(bandeira, s.x, s.y);
    } else {
      ctx.font = `bold ${Math.max(10, tamanho * 0.45)}px "Patrick Hand", cursive, sans-serif`;
      ctx.fillStyle = "#3a3126";
      ctx.fillText(p.nome, s.x, s.y);
    }
  });
}

