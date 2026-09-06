// Gera o ficheiro dos países a partir do Natural Earth, via o pacote
// world-atlas (domínio público; a embalagem é ISC de Michael Bostock).
//
// Corre-se À MÃO, uma vez, e o resultado vai para o repositório. O jogo não
// descarrega nada: um jogo de festa não pode depender de um servidor de
// terceiros estar de pé quando alguém carrega em "jogar".
//
//   npm pack world-atlas@2 && tar xzf world-atlas-*.tgz
//   node tools/gerar-mapa.mjs package/countries-110m.json public/data/paises.json
//
// A projeção é EQUIRETANGULAR (x da longitude, y da latitude), a mesma dos
// mapas-múndi mais comuns: assenta em cima de uma imagem de fundo sem contas
// nenhumas. Guardam-se as coordenadas já em fração do mapa (0 a 1) e
// arredondadas a quatro casas — num mapa de 2000 px isso é um quinto de pixel,
// e poupa mais de metade do tamanho do ficheiro.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const [, , entrada, saida] = process.argv;
if (!entrada || !saida) {
  console.error("uso: node tools/gerar-mapa.mjs <countries-110m.json> <saida.json>");
  process.exit(1);
}

const topo = JSON.parse(await readFile(entrada, "utf8"));
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;

// O TopoJSON guarda os arcos como diferenças sucessivas, e partilha-os entre
// países vizinhos — é por isso que ocupa tão pouco. Aqui desfaz-se isso.
const arcos = topo.arcs.map((arco) => {
  let x = 0;
  let y = 0;
  return arco.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * sx + tx, y * sy + ty];
  });
});

// Um índice negativo quer dizer "este arco ao contrário" (é assim que o
// formato reaproveita a mesma fronteira nos dois países que a partilham).
function anel(indices) {
  const pontos = [];
  for (const i of indices) {
    const a = i < 0 ? arcos[~i].slice().reverse() : arcos[i];
    if (pontos.length === 0) pontos.push(...a);
    else pontos.push(...a.slice(1));
  }
  return pontos;
}

// O MERIDIANO 180. A Rússia (e as Fiji, e as Aleutas) atravessam-no, e num
// mapa equiretangular isso faz o traço saltar de um lado do mundo para o
// outro — desenhado, é uma faixa horizontal a atravessar o mapa inteiro por
// cima da Sibéria. Foi exatamente isso que apareceu no ecrã.
//
// A correção é cortar o anel onde ele salta: fica um pedaço de cada lado do
// mapa, que é onde o país está mesmo. Um salto de mais de meio mundo entre
// dois pontos seguidos nunca é um país — é a volta ao mundo.
function partirNoMeridiano(pontos) {
  const pedacos = [];
  let atual = [];
  for (let i = 0; i < pontos.length; i += 1) {
    const p = pontos[i];
    const anterior = pontos[i - 1];
    if (anterior && Math.abs(p[0] - anterior[0]) > 180) {
      if (atual.length > 2) pedacos.push(atual);
      atual = [];
    }
    atual.push(p);
  }
  if (atual.length > 2) pedacos.push(atual);
  return pedacos;
}

const proj = (lon, lat) => [
  Math.round(((lon + 180) / 360) * 10000) / 10000,
  Math.round(((90 - lat) / 180) * 10000) / 10000,
];

// Os nomes vêm em inglês do Natural Earth. Um jogo de geografia em português
// com os países em inglês estaria partido à nascença, por isso a tradução vive
// à parte, num ficheiro que se lê e se corrige à mão.
const nomesPt = JSON.parse(await readFile(new URL("./nomes-pt.json", import.meta.url), "utf8"));
// O continente de cada país. Não vem nos dados (o Natural Earth traz só o
// nome), e é ele que permite jogar um continente de cada vez em vez de encarar
// o mundo inteiro de uma assentada.
const porContinente = JSON.parse(await readFile(new URL("./continentes.json", import.meta.url), "utf8"));
const continenteDe = {};
for (const [cont, lista] of Object.entries(porContinente)) {
  lista.forEach((n) => { continenteDe[n] = cont; });
}

// Como as pessoas CHAMAM aos países, que não é sempre como se escrevem. "EUA",
// "Holanda", "Inglaterra", "Birmânia" — quem escreve isto conhece o país, e o
// jogo é sobre conhecer, não sobre soletrar. Ao contrário dos nomes e dos
// continentes, esta lista pode ter buracos sem estragar nada: um país sem
// alcunha aceita o nome próprio, e ponto.
const alcunhas = JSON.parse(await readFile(new URL("./alcunhas.json", import.meta.url), "utf8"));

// O código de duas letras de cada país, para a BANDEIRA. Um emoji de bandeira
// são duas letras em alfabeto de sinalização, por isso com "PT" faz-se 🇵🇹 sem
// imagem nenhuma — nada de ficheiros, nada de marcas de água, nada que possa
// faltar do servidor. Onde o sistema não desenhar a bandeira, mostra as duas
// letras, que continua a ser uma pista.
//
// Três territórios não têm código ISO (Chipre do Norte, Somalilândia, Kosovo,
// que tem um provisório). Ficam sem bandeira e o jogo segue — a pista deles é
// só o nome.
const numeroParaIso = JSON.parse(await readFile(new URL("./iso2.json", import.meta.url), "utf8"));

const semNome = topo.objects.countries.geometries
  .map((g) => g.properties.name)
  .filter((n) => !nomesPt[n]);
const semContinente = topo.objects.countries.geometries
  .map((g) => g.properties.name)
  .filter((n) => !continenteDe[n]);
if (semContinente.length > 0) {
  console.error(`sem continente em continentes.json: ${semContinente.join(", ")}`);
  process.exit(1);
}
if (semNome.length > 0) {
  // Parar é de propósito: gerar o ficheiro com metade dos países em inglês
  // seria pior do que não o gerar.
  console.error(`sem tradução em nomes-pt.json: ${semNome.join(", ")}`);
  process.exit(1);
}

const paises = topo.objects.countries.geometries.map((g) => {
  const grupos = g.type === "MultiPolygon" ? g.arcs : [g.arcs];
  const aneis = [];
  for (const grupo of grupos) {
    // O primeiro anel de cada polígono é o contorno; os seguintes são buracos
    // (o Lesoto dentro da África do Sul, por exemplo). Para o jogo interessa
    // o contorno — um buraco desenhado como território seria uma ilha falsa.
    partirNoMeridiano(anel(grupo[0])).forEach((pedaco) => {
      aneis.push(pedaco.map(([lon, lat]) => proj(lon, lat)));
    });
  }
  return {
    id: g.id,
    nome: nomesPt[g.properties.name],
    en: g.properties.name,
    cont: continenteDe[g.properties.name],
    alt: alcunhas[g.properties.name] || [],
    iso: numeroParaIso[String(Number(g.id))] || null,
    aneis,
  };
});

await mkdir(path.dirname(saida), { recursive: true });
await writeFile(saida, JSON.stringify(paises));
const pontos = paises.reduce((n, p) => n + p.aneis.reduce((m, a) => m + a.length, 0), 0);
console.log(`${paises.length} países, ${paises.reduce((n, p) => n + p.aneis.length, 0)} anéis, ${pontos} pontos`);
console.log(`${saida}: ${Math.round(JSON.stringify(paises).length / 1024)} KB`);
