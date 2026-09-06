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

export function porConquistar() {
  return mapa.paises.filter((p) => !mapa.donos[p.nome]);
}

export function estaCompleto() {
  return mapa.paises.length > 0 && porConquistar().length === 0;
}

// Acertar no nome. Aceita o nome português e o inglês (quem sabe "Germany"
// sabe o país; recusar seria teimosia), e ignora acentos e maiúsculas.
export function acertou(pais, escrito) {
  if (!pais) return false;
  return sameWord(escrito, pais.nome) || sameWord(escrito, pais.en);
}

export function conquistar(pais, cor) {
  if (!pais || mapa.donos[pais.nome]) return false;
  mapa.donos[pais.nome] = cor;
  return true;
}

// A sugestão para quando o jogo estagna. Vem do que FALTA, nunca do que já
// está — sugerir um país já conquistado seria a app a não estar a prestar
// atenção. Prefere os grandes: são os que se reconhecem, e quem está
// encravado precisa de uma ajuda que ajude.
export function sugerir(evitar = []) {
  const faltam = porConquistar().filter((p) => !evitar.includes(p.nome));
  if (faltam.length === 0) return null;
  const area = (p) => p.aneis.reduce((soma, a) => soma + Math.abs(areaDoAnel(a)), 0);
  return faltam.slice().sort((a, b) => area(b) - area(a))[0];
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
    ctx.fillStyle = dono || "#f6f2e8";
    ctx.fill();
    ctx.strokeStyle = p === mapa.selecionado ? "#3a3126" : "rgba(58,49,38,0.45)";
    ctx.lineWidth = p === mapa.selecionado ? 2.5 : 0.8;
    ctx.stroke();
  });
}

