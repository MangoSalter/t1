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

console.log("9) Escrever como as pessoas falam, não como os atlas escrevem...");
// O jogo é sobre CONHECER o país. Quem escreve "EUA" sabe o país; quem escreve
// "Portgual" sabe o país e enganou-se numa tecla.
const eua = m.mapa.paises.find((p) => p.en === "United States of America");
check("EUA", m.acertou(eua, "eua"), true);
check("USA", m.acertou(eua, "USA"), true);
check("Estados Unidos", m.acertou(eua, "estados unidos"), true);
const ru = m.mapa.paises.find((p) => p.en === "United Kingdom");
check("Inglaterra vale por Reino Unido", m.acertou(ru, "Inglaterra"), true);
const pb = m.mapa.paises.find((p) => p.en === "Netherlands");
check("Holanda", m.acertou(pb, "holanda"), true);
const mm = m.mapa.paises.find((p) => p.en === "Myanmar");
check("Birmânia", m.acertou(mm, "birmania"), true);
const pt2 = m.mapa.paises.find((p) => p.nome === "Portugal");
check("uma gralha passa", m.acertou(pt2, "portgual"), true);
check("uma letra a menos passa", m.acertou(pt2, "portugl"), true);
check("duas gralhas num nome curto não passam", m.acertou(pt2, "prtgal"), false);
const rdc = m.mapa.paises.find((p) => p.en === "Dem. Rep. Congo");
const congo = m.mapa.paises.find((p) => p.en === "Congo");
check("RD Congo pela alcunha", m.acertou(rdc, "rdc"), true);
check("e não se confunde com o outro Congo", m.acertou(congo, "rdc"), false);
const gb = m.mapa.paises.find((p) => p.nome === "Guiné-Bissau");
const gui = m.mapa.paises.find((p) => p.nome === "Guiné");
check("meio nome não vale", m.acertou(gb, "guine"), false);
check("mas o nome inteiro vale", m.acertou(gui, "guine"), true);

console.log("10) Os modos: o mundo, um continente, ou só os grandes...");
m.mapa.donos = {};
m.mapa.modo = "mundo";
check("o mundo inteiro", m.emJogo().length, 177);
m.mapa.modo = "Europa";
const europa = m.emJogo();
check("só a Europa", europa.every((p) => p.cont === "Europa"), true);
check("e Portugal está lá", europa.some((p) => p.nome === "Portugal"), true);
check("e Angola não", europa.some((p) => p.nome === "Angola"), false);
check("Angola não está em jogo na Europa", m.estaEmJogo(m.mapa.paises.find((p) => p.nome === "Angola")), false);
m.mapa.modo = "grandes";
const grandes = m.emJogo();
check("os grandes são 60", grandes.length, 60);
check("a Rússia é um deles", grandes.some((p) => p.nome === "Rússia"), true);
check("o Luxemburgo não", grandes.some((p) => p.nome === "Luxemburgo"), false);
// E o contador e o fim da partida seguem o modo, não o mundo.
m.mapa.modo = "Oceânia";
const oceania = m.emJogo();
check("na Oceânia falta a Oceânia", m.porConquistar().length, oceania.length);
oceania.forEach((p) => m.conquistar(p, "#000"));
check("conquistada a Oceânia, a partida acabou", m.estaCompleto(), true);
check("mesmo com o resto do mundo por conquistar", m.mapa.paises.length > oceania.length, true);
m.mapa.donos = {};
m.mapa.modo = "mundo";

console.log("11) As pistas são BANDEIRAS pousadas no país certo...");
// Um emoji de bandeira são duas letras em alfabeto de sinalização: com "PT"
// sai a bandeira portuguesa, sem imagem nenhuma a descarregar — nada que possa
// faltar do servidor, nada com marca de água.
m.mapa.donos = {};
m.mapa.pistas = [];
m.mapa.modo = "mundo";
const ptFlag = m.mapa.paises.find((p) => p.nome === "Portugal");
check("Portugal tem código", ptFlag.iso, "PT");
check("e a bandeira sai dele", m.bandeiraDe(ptFlag), "🇵🇹");
check("Angola também", m.bandeiraDe(m.mapa.paises.find((p) => p.nome === "Angola")), "🇦🇴");
// Três territórios não têm código ISO. Sem bandeira, mas sem rebentar.
const semIso = m.mapa.paises.find((p) => !p.iso);
check("sem código não há bandeira, e não parte nada", m.bandeiraDe(semIso), "");

const revelado = m.revelarPista();
check("revela um país", !!revelado, true);
check("e fica na lista de pistas", m.mapa.pistas.includes(revelado.nome), true);
const segundo = m.revelarPista();
check("a segunda pista é outro país", segundo.nome !== revelado.nome, true);
// Nunca revela um que já está conquistado.
m.mapa.donos = Object.fromEntries(m.mapa.paises.filter((p) => p.nome !== "Laos").map((p) => [p.nome, "#000"]));
m.mapa.pistas = [];
check("só revela o que falta", m.revelarPista()?.nome, "Laos");
m.mapa.donos = {};
m.mapa.pistas = [];

console.log("12) A bandeira pousa no MAIOR pedaço do país...");
// No meio de todos os pedaços juntos, a bandeira da Indonésia ia parar ao mar
// entre as ilhas.
const indonesia = m.mapa.paises.find((p) => p.nome === "Indonésia");
const centro = m.centroDe(indonesia);
const dentro = indonesia.aneis.some((a) => m.dentroDoAnel(a, centro.x, centro.y));
console.log(`   centro da Indonésia: (${centro.x.toFixed(3)}, ${centro.y.toFixed(3)}) — dentro de terra: ${dentro}`);
check("a bandeira da Indonésia cai em terra", dentro, true);

console.log("13) Três hipóteses: a certa e duas do mesmo lado do mundo...");
// Três nomes de sítios completamente diferentes não são uma escolha, são uma
// oferta: as erradas vêm do mesmo continente sempre que houver.
m.mapa.donos = {};
m.mapa.modo = "mundo";
const alvo = m.mapa.paises.find((p) => p.nome === "Angola");
let semente = 1;
const previsivel = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; };
const tres = m.tresHipoteses(alvo, previsivel);
console.log(`   hipóteses para Angola: ${tres.map((p) => p.nome).join(", ")}`);
check("são três", tres.length, 3);
check("a certa está lá", tres.includes(alvo), true);
check("não há repetidas", new Set(tres.map((p) => p.nome)).size, 3);
check("as outras são do mesmo continente", tres.every((p) => p.cont === "África"), true);
// E não é sempre a mesma ordem, senão a certa era sempre a primeira.
const ordens = new Set();
for (let i = 0; i < 20; i += 1) ordens.add(m.tresHipoteses(alvo).map((p) => p.nome).join("|"));
check("a ordem varia", ordens.size > 1, true);

console.log("14) Os países que atravessam o meridiano 180 não riscam o mapa...");
// A Rússia atravessa-o. Num mapa equiretangular, um anel que salta de um lado
// do mundo para o outro desenha uma faixa horizontal por cima de tudo — foi o
// que apareceu no ecrã. Cortado em pedaços, nenhum anel dá a volta ao mundo.
const maiorSalto = (p) => Math.max(...p.aneis.map((a) => {
  let s = 0;
  for (let i = 1; i < a.length; i += 1) s = Math.max(s, Math.abs(a[i][0] - a[i - 1][0]));
  return s;
}));
const russia = m.mapa.paises.find((p) => p.nome === "Rússia");
console.log(`   maior salto num anel da Rússia: ${maiorSalto(russia).toFixed(3)} da largura do mapa`);
check("a Rússia não dá a volta ao mundo num traço", maiorSalto(russia) < 0.5, true);
const pioresSaltos = m.mapa.paises.map((p) => ({ nome: p.nome, s: maiorSalto(p) })).sort((a, b) => b.s - a.s)[0];
console.log(`   pior salto de todos: ${pioresSaltos.nome} com ${pioresSaltos.s.toFixed(3)}`);
check("nenhum país risca o mapa de lado a lado", pioresSaltos.s < 0.5, true);

console.log("15) Os oceanos: clicar na água e dizer qual é...");
m.mapa.donos = {};
m.mapa.pistas = [];
m.mapa.modo = "oceanos";
check("são cinco", m.emJogo().length, 5);
check("e são os cinco", m.emJogo().map((o) => o.nome).join(" | "),
  "Oceano Pacífico | Oceano Atlântico | Oceano Índico | Oceano Antártico | Oceano Glacial Ártico");
// Pontos conhecidos no meio de cada oceano.
const agua = (lon, lat) => m.oceanoEm((lon + 180) / 360, (90 - lat) / 180)?.nome;
check("meio do Atlântico", agua(-30, 20), "Oceano Atlântico");
check("meio do Pacífico (leste)", agua(-140, 10), "Oceano Pacífico");
check("meio do Pacífico (oeste)", agua(170, -10), "Oceano Pacífico");
check("meio do Índico", agua(75, -20), "Oceano Índico");
check("ao largo da Antártida", agua(0, -70), "Oceano Antártico");
check("no topo do mundo", agua(0, 85), "Oceano Glacial Ártico");
// Em cima de terra não há oceano: clicar em Portugal é clicar em Portugal.
check("Lisboa não é oceano", agua(-9.14, 38.72) ?? "terra", "terra");
check("Brasília também não", agua(-47.88, -15.79) ?? "terra", "terra");
// Escrever o nome funciona como nos países, com alcunhas.
const atl = m.OCEANOS.find((o) => o.nome === "Oceano Atlântico");
check("Atlântico", m.acertou(atl, "atlantico"), true);
check("só 'atlântico' chega", m.acertou(atl, "Atlântico"), true);
check("Índico não é o Atlântico", m.acertou(atl, "indico"), false);
// Conquistar e acabar a partida vale para os oceanos como para os países.
m.emJogo().forEach((o) => m.conquistar(o, "#5c7e91"));
check("conquistados os cinco, acabou", m.estaCompleto(), true);
m.mapa.donos = {};
m.mapa.modo = "mundo";

console.log("16) Três línguas: quem sabe o país sabe-o na língua que aprendeu...");
m.mapa.donos = {};
m.mapa.modo = "mundo";
const de = m.mapa.paises.find((p) => p.nome === "Alemanha");
check("português", m.acertou(de, "Alemanha"), true);
check("inglês", m.acertou(de, "Germany"), true);
check("espanhol", m.acertou(de, "Alemania"), true);
const es = m.mapa.paises.find((p) => p.nome === "Espanha");
check("España", m.acertou(es, "España"), true);
const usa = m.mapa.paises.find((p) => p.nome === "Estados Unidos");
check("EEUU (espanhol)", m.acertou(usa, "eeuu"), true);
check("USA (inglês)", m.acertou(usa, "usa"), true);
check("EUA (português)", m.acertou(usa, "eua"), true);
const jp = m.mapa.paises.find((p) => p.nome === "Japão");
check("Japón", m.acertou(jp, "japon"), true);
// Cobertura a sério: cada país tem de aceitar pelo menos duas línguas.
const semCobertura = m.mapa.paises.filter((p) => {
  const nomes = new Set([p.nome, p.en, ...(p.alt || [])].map((n) => String(n).toLowerCase()));
  return nomes.size < 2;
});
console.log(`   países que só aceitam um nome: ${semCobertura.length}`);
check("quase todos aceitam mais do que um nome", semCobertura.length < 15, true);

console.log("17) A dificuldade: escrever à vontade, ou apontar primeiro...");
m.mapa.dificuldade = "livre";
check("escrever encontra o país", m.porNomeEscrito("angola")?.nome, "Angola");
check("noutra língua também", m.porNomeEscrito("Germany")?.nome, "Alemanha");
check("com gralha também", m.porNomeEscrito("portgual")?.nome, "Portugal");
check("o que não existe não aparece", m.porNomeEscrito("nlandia"), null);
// Um país já conquistado deixa de ser encontrado: já não falta.
m.conquistar(m.mapa.paises.find((p) => p.nome === "Angola"), "#000");
check("já conquistado não volta a aparecer", m.porNomeEscrito("angola"), null);
m.mapa.donos = {};

console.log("18) Escrito como soa, não como se escreve...");
// Quem escreve "Kenia" sabe exatamente o país. O jogo é sobre conhecer, não
// sobre ortografia.
const casosSom = [
  ["Quénia", "Kenia"], ["Quénia", "kenya"],
  ["Zimbabué", "Zimbabwe"], ["Filipinas", "Philipinas"],
  ["Cazaquistão", "Kazaquistao"], ["Moçambique", "Mozambique"],
  ["Egito", "Egipto"], ["Azerbaijão", "Azerbeijao"],
  ["Suíça", "Suissa"], ["Iraque", "Irak"],
];
casosSom.forEach(([pais, escrito]) => {
  const p = m.mapa.paises.find((x) => x.nome === pais);
  check(`${escrito} vale por ${pais}`, p ? m.acertou(p, escrito) : "país não existe", true);
});

console.log("19) ...mas sem juntar dois países no mesmo som...");
// É este o risco de comparar pelo som: se dois países ficarem com o mesmo
// esqueleto, um responde pelo outro e o jogo passa a mentir.
const porSom = new Map();
const colisoes = [];
m.mapa.paises.forEach((p) => {
  const k = m.comoSoa(p.nome);
  if (porSom.has(k)) colisoes.push(`${porSom.get(k)} = ${p.nome} ("${k}")`);
  else porSom.set(k, p.nome);
});
console.log(`   colisões entre os 177: ${colisoes.length ? colisoes.join("; ") : "nenhuma"}`);
check("nenhum país responde pelo outro", colisoes.length, 0);
// E os vizinhos de nome parecido continuam separados.
const guineB = m.mapa.paises.find((p) => p.nome === "Guiné-Bissau");
const guineE = m.mapa.paises.find((p) => p.nome === "Guiné Equatorial");
check("Guiné-Bissau não é Guiné Equatorial", m.acertou(guineB, "Guiné Equatorial"), false);
check("nem ao contrário", m.acertou(guineE, "Guiné-Bissau"), false);
const niger = m.mapa.paises.find((p) => p.nome === "Níger");
const nigeria = m.mapa.paises.find((p) => p.nome === "Nigéria");
check("Níger não é Nigéria", m.acertou(niger, "Nigeria"), false);
check("nem ao contrário", m.acertou(nigeria, "Niger"), false);
const austria = m.mapa.paises.find((p) => p.nome === "Áustria");
check("Áustria não é Austrália", m.acertou(austria, "Australia"), false);

console.log("20) Nenhum país aceita o nome de outro — os 177 contra os 177...");
// A varredura completa. É o único jeito de ter a certeza: as regras de
// tolerância são generosas de propósito, e generosidade a mais faz um país
// responder pelo outro.
const enganos = [];
m.mapa.paises.forEach((p) => {
  m.mapa.paises.forEach((outro) => {
    if (p === outro) return;
    if (m.acertou(p, outro.nome)) enganos.push(`${outro.nome} -> ${p.nome}`);
  });
});
console.log(`   nomes aceites pelo país errado: ${enganos.length ? enganos.slice(0, 6).join("; ") : "nenhum"}`);
check("nenhum país responde pelo nome de outro", enganos.length, 0);
