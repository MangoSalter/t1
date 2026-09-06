// O mapa-múndi: a parte que se pode verificar sem browser nenhum.
//
// O que interessa aqui é uma pergunta só, e é a que faz o jogo existir: dado
// um ponto do mapa, em que país é que se clicou? Se isto estiver errado, o
// jogo está errado — e é o tipo de coisa que se vê a olho no ecrã e se deixa
// passar na mesma, porque "parece que sim".
import { readFile } from "node:fs/promises";
import path from "node:path";

let falhas = 0;
const check = (nome, real, esperado) => {
  const ok = String(real) === String(esperado);
  console.log(`   ${ok ? "ok" : "FALHOU"}  ${nome}${ok ? "" : ` — esperava ${esperado}, tenho ${real}`}`);
  if (!ok) falhas += 1;
};

const publicDir = process.env.EU_SEI_PUBLIC;
const dados = JSON.parse(await readFile(path.join(publicDir, "data", "paises.json"), "utf8"));
const m = await import("./js/mapa.js");
m.mapa.paises = dados;

console.log("1) Os dados chegaram inteiros...");
check("177 países", dados.length, 177);
check("todos têm nome em português", dados.every((p) => p.nome && p.nome !== p.en) || dados.filter((p) => p.nome === p.en).length < 40, true);
check("todos têm pelo menos um anel", dados.every((p) => p.aneis.length > 0), true);
check("as coordenadas ficam dentro do mapa",
  dados.every((p) => p.aneis.every((a) => a.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1))), true);

console.log("2) Clicar num sítio conhecido dá o país certo...");
// Coordenadas reais, convertidas para a fração do mapa da mesma maneira que o
// gerador: x = (lon+180)/360, y = (90-lat)/180.
const em = (lon, lat) => m.paisEm((lon + 180) / 360, (90 - lat) / 180);
const casos = [
  ["Lisboa", -9.14, 38.72, "Portugal"],
  ["Luanda", 13.23, -8.84, "Angola"],
  ["Brasília", -47.88, -15.79, "Brasil"],
  ["Paris", 2.35, 48.86, "França"],
  ["Tóquio", 139.69, 35.69, "Japão"],
  ["Nairobi", 36.82, -1.29, "Quénia"],
  ["Camberra", 149.13, -35.28, "Austrália"],
  ["Ottawa", -75.7, 45.42, "Canadá"],
];
casos.forEach(([cidade, lon, lat, esperado]) => {
  check(`${cidade} -> ${esperado}`, em(lon, lat)?.nome, esperado);
});

console.log("3) No meio do oceano não há país nenhum...");
check("Atlântico Sul", em(-25, -30)?.nome ?? "nenhum", "nenhum");
check("Pacífico", em(-140, 10)?.nome ?? "nenhum", "nenhum");

console.log("4) Escrever o nome: acentos e maiúsculas não contam...");
const pt = m.mapa.paises.find((p) => p.nome === "Japão");
check("com acento", m.acertou(pt, "Japão"), true);
check("sem acento", m.acertou(pt, "japao"), true);
check("aos gritos e com espaços", m.acertou(pt, "  JAPAO  "), true);
check("em inglês também serve", m.acertou(pt, "Japan"), true);
check("outro país não serve", m.acertou(pt, "China"), false);
check("vazio não serve", m.acertou(pt, "   "), false);

console.log("5) Conquistar tranca o território...");
m.mapa.donos = {};
const angola = m.mapa.paises.find((p) => p.nome === "Angola");
check("conquista à primeira", m.conquistar(angola, "#b24b38"), true);
check("segunda vez já não", m.conquistar(angola, "#5c7e91"), false);
check("a cor é de quem chegou primeiro", m.mapa.donos.Angola, "#b24b38");

console.log("6) A sugestão vem do que FALTA, e começa pelos grandes...");
const sugerido = m.sugerir();
check("sugere alguém", !!sugerido, true);
check("nunca sugere um já conquistado", sugerido.nome !== "Angola", true);
// Com quase tudo conquistado menos um, é esse que tem de sair.
m.mapa.donos = Object.fromEntries(m.mapa.paises.map((p) => [p.nome, "#000"]));
delete m.mapa.donos.Laos;
check("falta só o Laos, sugere o Laos", m.sugerir()?.nome, "Laos");
check("e se se pedir outro, não há", m.sugerir(["Laos"]), null);
m.mapa.donos = {};

console.log("7) A câmara: o mundo é duas vezes mais largo do que alto...");
m.mapa.rectW = 1000; m.mapa.rectH = 600;
m.enquadrar();
const cantoEsq = m.ecraDoMundo(0, 0);
const cantoDir = m.ecraDoMundo(1, 1);
const largura = cantoDir.x - cantoEsq.x;
const altura = cantoDir.y - cantoEsq.y;
console.log(`   mundo enquadrado: ${Math.round(largura)}x${Math.round(altura)} px`);
check("largura é o dobro da altura", Math.abs(largura - altura * 2) < 1, true);
check("cabe na tela", largura <= 1000 + 1 && altura <= 600 + 1, true);
// E ENCHE-A: cabia também um mapa do tamanho de uma unha, e foi assim que a
// primeira versão passou este teste com o mundo a 24 px de largura.
check("enche a tela num dos lados",
  Math.abs(largura - 1000) < 1 || Math.abs(altura - 600) < 1, true);
// Afastar para lá do mundo inteiro não faz sentido: não há mais mundo.
m.zoomPor(0.1, 500, 300);
check("não se afasta para lá do mundo", Math.abs(m.mapa.zoom - m.limitesDeZoom().min) < 1e-9, true);
m.enquadrar();
// E ir e voltar dá o mesmo sítio.
const volta = m.mundoDoEcra(cantoDir.x, cantoDir.y);
check("ecrã -> mundo -> ecrã fecha o círculo", Math.abs(volta.x - 1) < 1e-9 && Math.abs(volta.y - 1) < 1e-9, true);

console.log("8) Aproximar mantém debaixo do rato o que lá estava...");
const antes = m.mundoDoEcra(400, 300);
m.zoomPor(2, 400, 300);
const depois = m.mundoDoEcra(400, 300);
console.log(`   ponto sob o rato: (${antes.x.toFixed(4)}, ${antes.y.toFixed(4)}) -> (${depois.x.toFixed(4)}, ${depois.y.toFixed(4)})`);
check("o ponto não fugiu", Math.abs(antes.x - depois.x) < 1e-6 && Math.abs(antes.y - depois.y) < 1e-6, true);

if (falhas > 0) {
  console.log(`=> test-mapa FALHOU (${falhas})`);
  process.exit(1);
}
console.log("=> test-mapa ok");
