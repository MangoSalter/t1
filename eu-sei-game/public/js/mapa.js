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
  dificuldade: "livre",
  // A CAMADA: o que se está a nomear. O mapa é o mesmo, os modos são os
  // mesmos, os territórios são os mesmos — muda só a pergunta. Saber onde
  // fica a Mongólia e saber que a capital é Ulã Bator são duas coisas
  // diferentes, e a segunda cabe no jogo que já existe sem lhe mexer.
  camada: "paises",
  // Os países cuja bandeira já foi revelada como pista. Some quando o país é
  // conquistado: a pista deixou de ser pista.
  pistas: [],
  // Países EM CAUSA: alguém falhou neles agora mesmo e valem a dobrar a quem
  // souber, durante uns segundos. A regra existia e não se via em lado
  // nenhum — só se soubesse quem falhou é que se sabia onde estava a
  // oportunidade. Nome do país -> instante em que deixa de valer.
  emCausa: {},
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

// A DIFICULDADE, que é outra pergunta que não o tamanho do mundo.
//
//  - apontado: clica-se no território e diz-se o nome. É preciso reconhecer a
//    FORMA, e é o mais difícil dos dois.
//  - livre: escreve-se o nome de qualquer país e ele pinta-se onde estiver.
//    Basta lembrar-se dele; encontrar é com o jogo.
// As duas camadas. Ficam aqui, ao lado dos modos e das dificuldades, porque
// são a mesma espécie de escolha: o que muda é a pergunta, não o mapa.
export const CAMADAS = [
  { chave: "paises", nome: "Países", desc: "Nomeia o território." },
  { chave: "capitais", nome: "Capitais", desc: "Nomeia a capital de cada território." },
];

export const DIFICULDADES = [
  // Sem escrever nada: clica-se e escolhe-se de três. É o modo do telemóvel,
  // onde escrever um nome com o teclado a tapar o mapa é o que mais estraga o
  // jogo — e serve também a quem reconhece a bandeira mas não arrisca a
  // ortografia.
  { chave: "escolher", nome: "Só clicar e escolher", desc: "Clica num território e escolhe entre três. Sem escrever." },
  { chave: "livre", nome: "Escrever à vontade", desc: "Escreve o nome de qualquer país. Mais fácil." },
  { chave: "apontado", nome: "Apontar primeiro", desc: "Clica no território e só depois diz o nome. Mais difícil." },
];

// Encontra o país por NOME, entre os que ainda faltam. É o que faz o modo
// livre funcionar: escreve-se e o jogo procura.
export function porNomeEscrito(escrito) {
  const faltam = porConquistar();
  const nomesDe = (p) => {
    const alvo = alvoDaResposta(p);
    return alvo ? [alvo.nome, alvo.en, ...(alvo.alt || [])].filter(Boolean) : [];
  };
  // Primeiro os que batem certo mesmo; só depois os que batem com uma gralha,
  // senão uma gralha podia roubar um país cujo nome estava escrito bem.
  return faltam.find((p) => nomesDe(p).some((n) => sameWord(escrito, n)))
    || faltam.find((p) => acertou(p, escrito))
    || null;
}

export function areaDoPais(p) {
  return p.aneis.reduce((soma, a) => soma + Math.abs(areaDoAnel(a)), 0);
}

// Os países que ESTÃO EM JOGO no modo escolhido. Os outros continuam a
// desenhar-se, apagados: um mapa da Europa com o resto do mundo em branco
// continua a ser um mapa: ajuda a situar, e tirar o resto era pior.
function doModo() {
  if (mapa.modo === "oceanos") return OCEANOS;
  if (mapa.modo === "mundo") return mapa.paises;
  if (mapa.modo === "grandes") {
    return mapa.paises.slice()
      .sort((a, b) => areaDoPais(b) - areaDoPais(a))
      .slice(0, QUANTOS_GRANDES);
  }
  return mapa.paises.filter((p) => p.cont === mapa.modo);
}

export function emJogo() {
  const lista = doModo();
  // Na camada das capitais só entram os territórios que TÊM capital. A
  // Antártida não tem governo, o Kosovo e a Somalilândia não têm dados: pedir
  // a capital deles era pedir uma resposta que não existe, e o mapa nunca
  // ficaria completo.
  if (mapa.camada === "capitais") return lista.filter((p) => p.cap && p.cap.pt);
  return lista;
}

// O que a resposta tem de acertar: o território, ou a capital dele. Devolve
// um objeto com a mesma forma nos dois casos, para o resto do motor não ter
// de saber em que camada está.
export function alvoDaResposta(pais) {
  if (!pais) return null;
  if (mapa.camada !== "capitais") return pais;
  if (!pais.cap) return null;
  return { nome: pais.cap.pt, en: pais.cap.en, alt: pais.cap.alt || [], doPais: pais.nome };
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
// Bate certo SEM tolerância nenhuma: o nome, noutra língua, uma alcunha, ou o
// mesmo som. É o degrau em que não há dúvida possível.
function batemCerto(pais, escrito) {
  const nomes = [pais.nome, pais.en, ...(pais.alt || [])].filter(Boolean);
  if (nomes.some((n) => sameWord(escrito, n))) return true;
  const soa = comoSoa(escrito);
  return !!soa && nomes.some((n) => comoSoa(n) === soa);
}

// Todas as respostas certas que existem nesta camada. Serve a regra das
// gralhas: uma gralha não pode valer se o que foi escrito é a resposta certa
// de OUTRO sítio.
function respostasConhecidas() {
  if (mapa.camada === "capitais") {
    return mapa.paises.filter((p) => p.cap && p.cap.pt)
      .map((p) => ({ nome: p.cap.pt, en: p.cap.en, alt: p.cap.alt || [] }));
  }
  return [...mapa.paises, ...OCEANOS];
}

export function acertou(pais, escrito) {
  // Recebe sempre o TERRITÓRIO; é aqui que se resolve o que ele quer dizer na
  // camada em que se está. Assim quem chama não muda quando se muda de
  // camada — e foi por não haver este sítio único que a primeira tentativa
  // deste jogo espalhou a mesma decisão por quatro ficheiros.
  const alvo = alvoDaResposta(pais);
  if (!alvo) return false;
  if (batemCerto(alvo, escrito)) return true;

  // Só agora as gralhas. E com uma condição que a varredura dos 177 contra os
  // 177 obrigou a pôr: uma gralha NÃO vale se o que foi escrito for o nome
  // certo de outro país. Sem isto, "Zâmbia" passava por Gâmbia, "Austrália"
  // por Áustria e "Eslovénia" por Eslováquia — dois países a responder um pelo
  // outro, que é muito pior do que recusar uma gralha.
  const conhecidos = respostasConhecidas();
  const mesmoSitio = (o) => o.nome === alvo.nome && o.en === alvo.en;
  if (conhecidos.some((outro) => !mesmoSitio(outro) && batemCerto(outro, escrito))) return false;

  const nomes = [alvo.nome, alvo.en, ...(alvo.alt || [])].filter(Boolean);
  return nomes.some((n) => quaseIgual(escrito, n));
}

// COMO SOA, e não como se escreve.
//
// O jogo é sobre saber que país é, não sobre ortografia: quem escreve "Kenia",
// "Zimbabwe", "Philipinas" ou "Kazaquistão" sabe exatamente o país. Esta
// função reduz uma palavra ao seu esqueleto sonoro, e a comparação faz-se aí.
//
// As regras são as trocas que as pessoas fazem mesmo, sobretudo entre línguas:
// ph/f, k/qu/c, w/v, y/i, z/s, o h que não se lê, e as letras dobradas. Não é
// fonética a sério; é o suficiente para não recusar quem sabe a resposta.
//
// O risco disto é juntar dois países diferentes no mesmo esqueleto — e é por
// isso que o teste verifica os 177 e falha se dois colidirem.
export function comoSoa(t) {
  return limpar(t)
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/c([ei])/g, "s$1")
    .replace(/[ckq]/g, "k")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/z/g, "s")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1")
    .replace(/[^a-z0-9 ]/g, "");
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
  // Duas gralhas só em nomes LONGOS. Com o limite em sete letras, "Niger"
  // passava por "Nigéria" e "Australia" por "Áustria" — dois países
  // diferentes a responder um pelo outro, que é pior do que recusar uma
  // gralha. As trocas de escrita a sério já são apanhadas pelo som.
  const tolerancia = y.length >= 9 ? 2 : (y.length >= 5 ? 1 : 0);
  if (tolerancia === 0) return false;
  if (Math.abs(x.length - y.length) > tolerancia) return false;
  // A PRIMEIRA LETRA TEM DE BATER. Quem sabe o país sabe por onde começa; o
  // que engana são as letras do meio. Sem esta regra, "nlandia" chegava à
  // Finlândia a duas distâncias de nada, e a seguir qualquer coisa chegava a
  // qualquer sítio.
  if (x[0] !== y[0]) return false;
  // Distância de Damerau: trocar duas letras seguidas custa UMA, não duas.
  // "portgual" é o erro de dactilografia mais comum que há — os dedos trocam
  // a ordem — e contava como dois enganos, que é o mesmo que dizer que quem
  // escreveu não sabia o país. Sabia.
  let doisAtras = null;
  let anterior = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const atual = [i];
    let melhor = i;
    for (let j = 1; j <= y.length; j += 1) {
      const custo = x[i - 1] === y[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        atual[j] = Math.min(atual[j], doisAtras[j - 2] + 1);
      }
      if (atual[j] < melhor) melhor = atual[j];
    }
    if (melhor > tolerancia) return false;
    doisAtras = anterior;
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

export function conquistar(pais, cor, agora = Date.now()) {
  if (!pais || mapa.donos[pais.nome]) return false;
  mapa.donos[pais.nome] = cor;
  registarAcerto(pais, agora);
  return true;
}

// O MARCADOR. Conquistar o mapa todo é longo, e sem nada a contar pelo caminho
// só se sente o fim. O marcador dá o que se sente ao jogar: quantos seguidos,
// a que ritmo, que continente é que se sabe de cor — e, no fim, um retrato da
// partida que não é só "acertaste 177".
//
// Fica AQUI, no motor, e não no ecrã, porque estas contas são as mesmas em
// solo e em sala, e porque assim testam-se sem browser nenhum.
export const marcador = {
  inicio: null,      // quando arrancou o cronómetro (o 1.º clique conta)
  jogadas: [],       // { nome, cont, ms, pontos, cadeia, compista }
  erros: 0,
  cadeia: 0,         // acertos seguidos, sem falhar nenhum
  melhorCadeia: 0,
  seguidosNoContinente: 0,
  pontos: 0,
};

export function reiniciarMarcador() {
  marcador.inicio = null;
  marcador.jogadas = [];
  marcador.erros = 0;
  marcador.cadeia = 0;
  marcador.melhorCadeia = 0;
  marcador.seguidosNoContinente = 0;
  marcador.pontos = 0;
}

// O cronómetro só arranca à primeira jogada. Abrir o mapa e ir ao café não
// pode estragar o ritmo de quem depois jogou bem.
export function arrancarMarcador(agora = Date.now()) {
  if (marcador.inicio === null) marcador.inicio = agora;
}

export function registarErro(agora = Date.now()) {
  arrancarMarcador(agora);
  marcador.erros++;
  marcador.cadeia = 0;
  marcador.seguidosNoContinente = 0;
}

export const PONTOS_BASE = 10;
export const CADEIA_MAX = 20;      // teto do bónus por acertos seguidos
export const CONTINENTE_MAX = 25;  // teto do bónus por continente seguido

// Quanto vale conquistar este país AGORA. Depende do que veio antes: seguidos
// valem mais, e seguidos no mesmo continente valem mais ainda — é o que
// transforma "clicar no que me lembro" em "vou arrumar a África toda".
// Com a bandeira já revelada vale metade: a pista ajudou, e tem custo.
export function pontosDe(pais) {
  if (!pais) return 0;
  const bonusCadeia = Math.min(CADEIA_MAX, marcador.cadeia * 2);
  const mesmoCont = marcador.seguidosNoContinente > 0
    && ultimoContinente() === pais.cont;
  const bonusCont = mesmoCont
    ? Math.min(CONTINENTE_MAX, marcador.seguidosNoContinente * 5)
    : 0;
  const total = PONTOS_BASE + bonusCadeia + bonusCont;
  return mapa.pistas.includes(pais.nome) ? Math.round(total / 2) : total;
}

function ultimoContinente() {
  const u = marcador.jogadas[marcador.jogadas.length - 1];
  return u ? u.cont : null;
}

function registarAcerto(pais, agora = Date.now()) {
  arrancarMarcador(agora);
  const anterior = marcador.jogadas[marcador.jogadas.length - 1];
  const desde = anterior ? anterior.quando : marcador.inicio;
  const pontos = pontosDe(pais);
  marcador.seguidosNoContinente = ultimoContinente() === pais.cont
    ? marcador.seguidosNoContinente + 1
    : 1;
  marcador.cadeia++;
  if (marcador.cadeia > marcador.melhorCadeia) marcador.melhorCadeia = marcador.cadeia;
  marcador.pontos += pontos;
  marcador.jogadas.push({
    nome: pais.nome,
    cont: pais.cont,
    quando: agora,
    ms: Math.max(0, agora - desde),
    pontos,
    cadeia: marcador.cadeia,
    compista: mapa.pistas.includes(pais.nome),
  });
}

// O retrato da partida. Cada linha aqui é uma coisa que dá vontade de contar a
// alguém: "fiz 14 seguidos", "soube a África toda", "3,2 países por minuto".
export function resumo(agora = Date.now()) {
  const certos = marcador.jogadas.length;
  const tentativas = certos + marcador.erros;
  const decorrido = marcador.inicio === null ? 0 : Math.max(1, agora - marcador.inicio);
  const porContinente = {};
  let maisRapido = null;
  let somaMs = 0;
  let comPista = 0;
  marcador.jogadas.forEach((j) => {
    // Os oceanos não são de continente nenhum. Sem esta guarda, o retrato de
    // uma partida no modo dos oceanos dizia "és mais forte em undefined".
    if (j.cont) porContinente[j.cont] = (porContinente[j.cont] || 0) + 1;
    somaMs += j.ms;
    if (j.compista) comPista++;
    if (!maisRapido || j.ms < maisRapido.ms) maisRapido = j;
  });
  const favorito = Object.entries(porContinente)
    .sort((a, b) => b[1] - a[1])[0] || null;
  // A cobertura de cada continente: 8 de 54 em África diz mais do que "8".
  const cobertura = {};
  emJogo().forEach((p) => {
    if (!p.cont) return; // os oceanos não são de continente nenhum
    cobertura[p.cont] = cobertura[p.cont] || { feitos: 0, total: 0 };
    cobertura[p.cont].total++;
    if (mapa.donos[p.nome]) cobertura[p.cont].feitos++;
  });
  return {
    certos,
    erros: marcador.erros,
    pontos: marcador.pontos,
    precisao: tentativas ? Math.round((certos / tentativas) * 100) : null,
    segundos: marcador.inicio === null ? 0 : Math.round(decorrido / 1000),
    porMinuto: marcador.inicio === null ? 0 : Math.round((certos / (decorrido / 60000)) * 10) / 10,
    melhorCadeia: marcador.melhorCadeia,
    cadeia: marcador.cadeia,
    comPista,
    semPista: certos - comPista,
    tempoMedio: certos ? Math.round(somaMs / certos / 100) / 10 : null,
    maisRapido: maisRapido ? { nome: maisRapido.nome, segundos: Math.round(maisRapido.ms / 100) / 10 } : null,
    favorito: favorito ? { cont: favorito[0], quantos: favorito[1] } : null,
    cobertura,
  };
}

// A BANDEIRA como pista. Um emoji de bandeira são duas letras em alfabeto de
// sinalização — com "PT" sai 🇵🇹 —, por isso não há imagem nenhuma a
// descarregar, nada que possa faltar do servidor e nada com marca de água.
// Onde o sistema não desenhar bandeiras (o Windows não desenha), aparecem as
// duas letras, que continuam a ser uma pista.
// O SISTEMA DESENHA BANDEIRAS? Nem todos desenham: o Windows mostra as duas
// letras, e há sistemas que não mostram nada — e "não mostra nada" foi o que
// aconteceu no ecrã de quem pediu ajuda e não viu acontecer coisa nenhuma.
//
// Testa-se uma vez, desenhando a bandeira portuguesa fora do ecrã e contando
// as cores. Sem bandeiras, a pista passa a ser o código do país num crachá —
// sempre visível, e continua a ser uma pista a sério.
let sabeBandeiras = null;
export function suportaBandeiras() {
  if (sabeBandeiras !== null) return sabeBandeiras;
  try {
    const c = document.createElement("canvas");
    c.width = 24; c.height = 24;
    const x = c.getContext("2d");
    x.font = '20px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
    x.fillText("🇵🇹", 0, 20);
    const dados = x.getImageData(0, 0, 24, 24).data;
    const cores = new Set();
    for (let i = 0; i < dados.length; i += 4) {
      if (dados[i + 3] > 30) cores.add(`${dados[i]},${dados[i + 1]},${dados[i + 2]}`);
    }
    // Uma bandeira a sério tem mais do que uma cor. Duas letras a preto têm uma.
    sabeBandeiras = cores.size > 2;
  } catch {
    sabeBandeiras = false;
  }
  return sabeBandeiras;
}

// A bandeira num ponto do ecrã: a bandeira a sério onde o sistema a saiba
// desenhar, um crachá com o código do país onde não saiba. Nunca nada — foi
// por não haver este segundo caminho que a ajuda parecia não fazer nada.
export function desenharBandeira(ctx, pais, x, y, tamanho) {
  const emoji = bandeiraDe(pais);
  if (emoji && suportaBandeiras()) {
    ctx.font = `${tamanho}px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillStyle = "#3a3126";
    ctx.fillText(emoji, x, y);
    return;
  }
  const texto = pais.iso || pais.nome.slice(0, 3).toUpperCase();
  const altura = Math.max(12, tamanho * 0.62);
  ctx.font = `bold ${altura}px "Patrick Hand", cursive, sans-serif`;
  const largura = ctx.measureText(texto).width + altura * 0.7;
  ctx.fillStyle = "#fffdf7";
  ctx.strokeStyle = "#3a3126";
  ctx.lineWidth = Math.max(1, altura * 0.09);
  ctx.beginPath();
  ctx.roundRect(x - largura / 2, y - altura * 0.72, largura, altura * 1.44, altura * 0.28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3a3126";
  ctx.fillText(texto, x, y);
}

export function bandeiraDe(pais) {
  const iso = pais?.iso;
  if (!iso || iso.length !== 2) return "";
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// Onde pousar a bandeira: no meio do MAIOR pedaço do país. No meio de todos os
// pedaços juntos, a bandeira da Indonésia ia parar ao mar entre as ilhas.
// A cor do jogador, desmaiada, para servir de fundo à bandeira sem competir
// com ela.
export function corClara(cor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(cor).trim());
  if (!m) return "#f0e9dd";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const mistura = (v) => Math.round(v + (255 - v) * 0.72);
  return `rgb(${mistura(r)}, ${mistura(g)}, ${mistura(b)})`;
}

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
    // Conquistado: a cor de quem o conquistou, mas CLARA — é o fundo por baixo
    // da bandeira, não a resposta. A cor forte fica na moldura, que é o
    // indicador de dono: pouco intrusivo e impossível de confundir.
    ctx.fillStyle = dono ? corClara(dono) : (joga ? "#f6f2e8" : "#d9d3c6");
    ctx.fill();
    if (dono) {
      ctx.strokeStyle = dono;
      ctx.lineWidth = 2.2;
    } else {
      ctx.strokeStyle = p === mapa.selecionado ? "#3a3126" : "rgba(58,49,38,0.45)";
      ctx.lineWidth = p === mapa.selecionado ? 2.5 : 0.8;
    }
    ctx.stroke();
  });

  // Os países EM CAUSA, por cima do desenho normal: contorno a tracejado e um
  // "x2" no meio. Nem cor nem preenchimento — quem não distingue cores tem de
  // ver isto na mesma, e a forma do traço vê-se sempre.
  const agoraEmCausa = Date.now();
  const emCausaAgora = Object.entries(mapa.emCausa || {})
    .filter(([, ate]) => ate > agoraEmCausa)
    .map(([nome]) => nome);
  if (emCausaAgora.length > 0) {
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#3a3126";
    emCausaAgora.forEach((nome) => {
      const p = mapa.porNome.get(nome);
      if (!p || mapa.donos[nome]) return;
      ctx.beginPath();
      p.aneis.forEach((anel) => {
        anel.forEach(([x, y], i) => {
          const e = ecraDoMundo(x, y);
          if (i === 0) ctx.moveTo(e.x, e.y);
          else ctx.lineTo(e.x, e.y);
        });
        ctx.closePath();
      });
      ctx.stroke();
    });
    ctx.restore();
  }

  // As pistas por cima de tudo: a bandeira pousada dentro do país a que
  // pertence. Desenhadas no fim para nenhum país as tapar.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // O "x2" de quem está em causa, já com o alinhamento de texto ligado.
  emCausaAgora.forEach((nome) => {
    const p = mapa.porNome.get(nome);
    if (!p || mapa.donos[nome]) return;
    const c = centroDe(p);
    const e = ecraDoMundo(c.x, c.y);
    const tamanho = Math.max(11, Math.min(30, mapa.zoom * 0.038));
    ctx.font = `bold ${tamanho}px "Patrick Hand", cursive, sans-serif`;
    ctx.lineWidth = Math.max(2, tamanho * 0.22);
    ctx.strokeStyle = "#fffdf7";
    ctx.strokeText("x2", e.x, e.y);
    ctx.fillStyle = "#3a3126";
    ctx.fillText("x2", e.x, e.y);
  });

  // A bandeira de cada país CONQUISTADO, dentro dele: mostra de quem é sem se
  // ter de decorar cores, e de caminho ensina a bandeira a quem não a sabia.
  mapa.paises.forEach((p) => {
    if (!mapa.donos[p.nome] || !emJogoSet.has(p)) return;
    const c = centroDe(p);
    const s = ecraDoMundo(c.x, c.y);
    desenharBandeira(ctx, p, s.x, s.y, Math.max(12, Math.min(34, mapa.zoom * 0.04)));
  });

  mapa.pistas.forEach((nome) => {
    const p = mapa.porNome.get(nome) || OCEANOS.find((o) => o.nome === nome);
    if (!p || mapa.donos[nome]) return;
    const c = centroDe(p);
    const s = ecraDoMundo(c.x, c.y);
    const tamanho = Math.max(14, Math.min(42, mapa.zoom * 0.05));
    if (p.iso) {
      desenharBandeira(ctx, p, s.x, s.y, tamanho);
    } else {
      // Sem código não há bandeira: a pista é o nome.
      ctx.font = `bold ${Math.max(10, tamanho * 0.45)}px "Patrick Hand", cursive, sans-serif`;
      ctx.fillStyle = "#3a3126";
      ctx.fillText(p.nome, s.x, s.y);
    }
  });
}

