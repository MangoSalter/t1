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

const proj = (lon, lat) => [
  Math.round(((lon + 180) / 360) * 10000) / 10000,
  Math.round(((90 - lat) / 180) * 10000) / 10000,
];

// Os nomes vêm em inglês do Natural Earth. Um jogo de geografia em português
// com os países em inglês estaria partido à nascença, por isso a tradução vive
// à parte, num ficheiro que se lê e se corrige à mão.
const nomesPt = JSON.parse(await readFile(new URL("./nomes-pt.json", import.meta.url), "utf8"));
const semNome = topo.objects.countries.geometries
  .map((g) => g.properties.name)
  .filter((n) => !nomesPt[n]);
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
    aneis.push(anel(grupo[0]).map(([lon, lat]) => proj(lon, lat)));
  }
  return { id: g.id, nome: nomesPt[g.properties.name], en: g.properties.name, aneis };
});

await mkdir(path.dirname(saida), { recursive: true });
await writeFile(saida, JSON.stringify(paises));
const pontos = paises.reduce((n, p) => n + p.aneis.reduce((m, a) => m + a.length, 0), 0);
console.log(`${paises.length} países, ${paises.reduce((n, p) => n + p.aneis.length, 0)} anéis, ${pontos} pontos`);
console.log(`${saida}: ${Math.round(JSON.stringify(paises).length / 1024)} KB`);
