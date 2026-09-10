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

// Nota: o "ok" final só se diz no fim do ficheiro. Há mais secções a seguir,
// e dizer que está tudo bem a meio já enganou uma vez.

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
// Um país com UM só nome não é falta de cobertura quando o nome é o mesmo nas
// três línguas — "Portugal" é Portugal em português, inglês e espanhol, e não
// há terceiro nome para dar. A lista está fechada de propósito: se um dia a
// geração de dados perder as traduções de um país qualquer, ele aparece aqui e
// o teste dá o nome dele.
const SEM_TRADUCAO_PORQUE_NAO_PRECISAM = [
  "Angola", "Argentina", "Brunei", "Chile", "China", "Costa Rica", "Cuba",
  "El Salvador", "Guatemala", "Haiti", "Honduras", "Israel", "Jamaica",
  "Kosovo", "Kuwait", "Mali", "Montenegro", "Nepal", "Peru", "Portugal",
  "Senegal", "Togo", "Uganda", "Vanuatu", "Venezuela",
];
const inesperados = semCobertura
  .map((p) => p.nome)
  .filter((n) => !SEM_TRADUCAO_PORQUE_NAO_PRECISAM.includes(n));
check("nenhum país perdeu as traduções", inesperados.join(", ") || "nenhum", "nenhum");

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

console.log("20b) As capitais: dados escritos à mão, por isso medidos...");
// A lista de capitais em português é curada à mão, e listas à mão têm erros.
// O que se pode verificar sozinho verifica-se aqui: que estão lá, que têm as
// duas grafias, e — o mais importante — que nenhuma responde pelo nome de
// outra, que foi o defeito que os nomes dos países já tiveram.
const comCapital = dados.filter((p) => p.cap);
console.log(`   ${comCapital.length} de ${dados.length} países têm capital`);
check("quase todos têm capital", comCapital.length >= 170, true);
// Os que não têm são conhecidos: não são países com governo próprio.
const semCapital = dados.filter((p) => !p.cap).map((p) => p.nome).sort();
console.log(`   sem capital: ${semCapital.join(", ")}`);
check("só os do costume ficam sem capital",
  semCapital.join("|"), "Antártida|Chipre do Norte|Kosovo|Somalilândia");
check("todas as capitais têm nome em português", comCapital.every((p) => p.cap.pt && p.cap.pt.length > 1), true);
check("e nome internacional", comCapital.every((p) => p.cap.en && p.cap.en.length > 1), true);
// Onde o português difere do inglês, o inglês tem de continuar a ser aceite:
// quem aprendeu "Copenhagen" sabe a capital tão bem como quem aprendeu
// "Copenhaga".
// Testa-se a ACEITAÇÃO e não a lista: onde a diferença é só um acento
// ("Sofia"/"Sófia"), a forma inglesa não precisa de estar guardada porque as
// regras de comparação já ignoram acentos. O que interessa é se passa.
const diferentes = comCapital.filter((p) => p.cap.pt !== p.cap.en);
const recusadas = diferentes.filter((p) => {
  const alvo = { nome: p.cap.pt, en: p.cap.en, alt: p.cap.alt || [] };
  return !m.acertou(alvo, p.cap.en);
});
console.log(`   ${diferentes.length} capitais escrevem-se diferente em português; formas inglesas recusadas: ${recusadas.length ? recusadas.map((p) => p.cap.en).join(", ") : "nenhuma"}`);
check("a forma inglesa é sempre aceite", recusadas.length, 0);

console.log("20c) Nenhuma capital responde pelo nome de outra...");
// A mesma varredura que se fez aos países. As regras de tolerância são
// generosas de propósito, e generosidade a mais faz uma capital responder
// pela outra — "Viena" e "Vienciana" são o tipo de par que engana.
const capitais = comCapital.map((p) => ({
  pais: p.nome,
  nomes: [p.cap.pt, p.cap.en, ...(p.cap.alt || [])].filter(Boolean),
}));
const confusoes = [];
capitais.forEach((a) => {
  const alvo = { nome: a.nomes[0], en: a.nomes[1], alt: a.nomes.slice(2) };
  capitais.forEach((b) => {
    if (a === b) return;
    // Uma capital com o mesmo nome noutro país não é engano — é o mundo a ser
    // assim (São José, Santiago). O que não pode é uma responder por outra
    // por causa da tolerância a gralhas.
    if (a.nomes.some((n) => b.nomes.some((m) => m.toLowerCase() === n.toLowerCase()))) return;
    if (b.nomes.some((n) => m.acertou(alvo, n))) confusoes.push(`${b.nomes[0]} (${b.pais}) -> ${a.nomes[0]} (${a.pais})`);
  });
});
console.log(`   capitais aceites pela capital errada: ${confusoes.length ? confusoes.slice(0, 6).join("; ") : "nenhuma"}`);
check("nenhuma capital responde pela outra", confusoes.length, 0);

console.log("20d) A camada das capitais: o mesmo mapa, outra pergunta...");
m.mapa.modo = "mundo";
m.mapa.donos = {};
m.mapa.pistas = [];
const portugal = m.mapa.paises.find((p) => p.nome === "Portugal");
const franca = m.mapa.paises.find((p) => p.nome === "França");

m.mapa.camada = "paises";
check("na camada dos países, o país acerta", m.acertou(portugal, "Portugal"), true);
check("e a capital não", m.acertou(portugal, "Lisboa"), false);

m.mapa.camada = "capitais";
check("na camada das capitais, a capital acerta", m.acertou(portugal, "Lisboa"), true);
check("na grafia inglesa também", m.acertou(portugal, "Lisbon"), true);
check("com uma gralha também", m.acertou(portugal, "Lisbooa"), true);
check("e o nome do país já não serve", m.acertou(portugal, "Portugal"), false);
check("a capital de outro país não serve", m.acertou(portugal, "Paris"), false);
check("escrever encontra o país pela capital", m.porNomeEscrito("Paris")?.nome, "França");
check("e as duas grafias levam ao mesmo sítio", m.porNomeEscrito("Moscow")?.nome, "Rússia");

// Quem não tem capital sai de jogo: pedir a capital da Antártida era pedir
// uma resposta que não existe, e o mapa nunca ficaria completo.
const emJogoCapitais = m.emJogo().length;
m.mapa.camada = "paises";
const emJogoPaises = m.emJogo().length;
console.log(`   territórios em jogo: ${emJogoPaises} com países, ${emJogoCapitais} com capitais`);
check("a camada das capitais deixa de fora quem não tem capital", emJogoCapitais, 173);
check("e a dos países leva-os todos", emJogoPaises, 177);
m.mapa.camada = "capitais";
check("a Antártida sai de jogo", m.emJogo().some((p) => p.nome === "Antártida"), false);
m.mapa.camada = "paises";

console.log("21) O marcador: pontos, sequências e o retrato da partida...");
// Tempo fingido. As contas do marcador dependem do relógio, e um teste que
// depende do relógio a sério é um teste que falha à sexta-feira.
const t0 = 1_700_000_000_000;
const conquistar = (nome, segundos, cor = "#b24b38") =>
  m.conquistar(m.mapa.paises.find((p) => p.nome === nome), cor, t0 + segundos * 1000);

m.mapa.modo = "mundo";
m.mapa.donos = {};
m.mapa.pistas = [];
m.reiniciarMarcador();
check("um marcador novo não tem cronómetro a andar", m.marcador.inicio, null);
check("nem pontos", m.marcador.pontos, 0);

// Primeiro país: só a base, que ainda não há sequência nenhuma.
conquistar("França", 0);
check("o 1.º país vale a base", m.marcador.pontos, m.PONTOS_BASE);
check("e arranca o cronómetro", m.marcador.inicio, t0);

// Segundo país no MESMO continente: soma o bónus de seguidos e o de continente.
conquistar("Espanha", 10);
check("dois seguidos na Europa contam a sequência", m.marcador.cadeia, 2);
check("e os seguidos no continente", m.marcador.seguidosNoContinente, 2);
check("o 2.º vale base + 2 de sequência + 5 de continente",
  m.marcador.pontos - m.PONTOS_BASE, m.PONTOS_BASE + 2 + 5);

// Saltar de continente parte a corrente do continente, mas não a dos seguidos.
conquistar("Japão", 20);
check("mudar de continente não parte a sequência", m.marcador.cadeia, 3);
check("mas recomeça a do continente", m.marcador.seguidosNoContinente, 1);

// Errar parte tudo.
m.registarErro(t0 + 25_000);
check("errar parte a sequência", m.marcador.cadeia, 0);
check("e a do continente", m.marcador.seguidosNoContinente, 0);
check("mas a melhor sequência fica guardada", m.marcador.melhorCadeia, 3);

// Com a bandeira já dada, vale metade — a pista tem custo.
const italia = m.mapa.paises.find((p) => p.nome === "Itália");
m.mapa.pistas = ["Itália"];
const antesDaPista = m.marcador.pontos;
conquistar("Itália", 30);
check("um país com a bandeira revelada vale metade", m.marcador.pontos - antesDaPista, Math.round(m.PONTOS_BASE / 2));
check("e fica marcado como feito com pista", m.marcador.jogadas.at(-1).compista, true);
m.mapa.pistas = [];

// O mesmo país outra vez não pode contar duas vezes.
const pontosAntes = m.marcador.pontos;
const jogadasAntes = m.marcador.jogadas.length;
conquistar("França", 40);
check("reconquistar não dá pontos", m.marcador.pontos, pontosAntes);
check("nem regista jogada", m.marcador.jogadas.length, jogadasAntes);

console.log("22) O retrato: o que se conta a alguém no fim...");
const r = m.resumo(t0 + 60_000);
console.log(`   ${r.certos} países, ${r.pontos} pontos, ${r.porMinuto}/min, melhor sequência ${r.melhorCadeia}, ${r.precisao}% de acerto`);
check("conta os acertos", r.certos, 4);
check("conta o erro", r.erros, 1);
check("a precisão são 4 em 5", r.precisao, 80);
check("um minuto certo dá 4 por minuto", r.porMinuto, 4);
check("o continente mais forte é a Europa", r.favorito.cont, italia.cont);
check("o mais rápido foi o que demorou menos", r.maisRapido.nome, "França");
check("separa os feitos com pista dos feitos de cabeça", `${r.comPista}/${r.semPista}`, "1/3");
check("a cobertura da Europa conta o total do continente",
  r.cobertura[italia.cont].feitos, 3);

console.log("22b) Uma partida só de oceanos não inventa um continente...");
// Os oceanos não têm continente. O retrato dizia "és mais forte em undefined"
// — apanhado no ecrã, com o painel de fim já feito, e é o tipo de coisa que
// faz o jogo parecer partido justamente quando se acabou de o ganhar.
m.mapa.donos = {};
m.mapa.pistas = [];
m.reiniciarMarcador();
const pacifico = m.OCEANOS[0];
m.conquistar(pacifico, "#b24b38", t0);
m.conquistar(m.OCEANOS[1], "#b24b38", t0 + 5000);
const soMar = m.resumo(t0 + 60_000);
check("conta os oceanos", soMar.certos, 2);
check("e não inventa um continente favorito", String(soMar.favorito), "null");

console.log("23) Recomeçar limpa o marcador...");
m.reiniciarMarcador();
const vazio = m.resumo(t0 + 60_000);
check("sem jogadas", vazio.certos, 0);
check("sem ritmo", vazio.porMinuto, 0);
check("sem precisão para mostrar", String(vazio.precisao), "null");

console.log("24) As três línguas: o mapa entende quem escreve em espanhol e em inglês...");
// O jogo diz que fala PT/EN/ES, e para o mapa isso quer dizer ACEITAR o que
// um espanhol escreve. Quase tudo já batia certo sozinho: tirar os acentos
// faz "Grécia" e "Grecia" serem a mesma palavra, e a lista de alternativas
// cobre "Alemania", "Francia", "Suiza". As capitais é que tinham buracos —
// dez, todas do mesmo feitio: um artigo à frente ("El Cairo", "La Habana") ou
// um nome mesmo diferente ("Tiflis", "Yakarta", "Jartum"). O quaseIgual exige
// que a PRIMEIRA letra bata certo, e com razão, por isso "El Cairo" nunca
// chegaria a "Cairo" por semelhança — tinha de estar na lista.
{
  // Primeiro o inglês, que é um campo próprio e tem de estar preenchido em
  // toda a gente — se faltar num país, quem joga em inglês não tem por onde
  // lá chegar.
  check("nenhum país sem nome em inglês", dados.filter((p) => !p.en).length, 0);
  check("nenhuma capital sem nome em inglês", dados.filter((p) => p.cap && !p.cap.en).length, 0);

  const emEspanhol = {
    // Países, para não voltarem a fugir.
    Alemania: "Alemanha", Francia: "França", Suiza: "Suíça", "Países Bajos": "Países Baixos",
    Sudáfrica: "África do Sul", Marruecos: "Marrocos", "Nueva Zelanda": "Nova Zelândia",
    // As dez capitais que faltavam.
    "El Cairo": "Egito", "La Habana": "Cuba", Tiflis: "Geórgia", Yakarta: "Indonésia",
    Jartum: "Sudão", Dacca: "Bangladeche", "Puerto España": "Trindade e Tobago",
    "Ciudad de Guatemala": "Guatemala", "Ciudad de Panamá": "Panamá", "Ciudad de México": "México",
    // E o inglês, medido ao mesmo tempo: 36 em 36 do que experimentei, sem
    // nada a corrigir. Ficam alguns aqui para não fugirem depois.
    Germany: "Alemanha", Netherlands: "Países Baixos", "Czech Republic": "Chéquia",
    "Ivory Coast": "Costa do Marfim", Copenhagen: "Dinamarca", Khartoum: "Sudão",
  };
  const nomesDoPais = (pais) => [pais.nome, pais.en, ...(pais.alt || [])].filter(Boolean);
  const nomesDaCapital = (pais) => (pais.cap ? [pais.cap.pt, pais.cap.en, ...(pais.cap.alt || [])].filter(Boolean) : []);
  // A mesma ordem do porNomeEscrito: primeiro o que bate certo, só depois a
  // gralha — senão uma gralha rouba um nome escrito bem.
  const aQuemPertence = (escrito) => {
    const todos = dados.flatMap((pais) => [
      { pais: pais.nome, nomes: nomesDoPais(pais) },
      { pais: pais.nome, nomes: nomesDaCapital(pais) },
    ]);
    const exato = todos.find((a) => a.nomes.some((n) => m.limpar(escrito) === m.limpar(n)));
    return (exato || todos.find((a) => a.nomes.some((n) => m.quaseIgual(escrito, n))) || {}).pais || null;
  };
  Object.entries(emEspanhol).forEach(([escrito, esperado]) => {
    check(`"${escrito}"`, aQuemPertence(escrito), esperado);
  });
}

if (falhas > 0) { console.log(`=> test-mapa FALHOU (${falhas})`); process.exit(1); }
console.log("=> test-mapa ok");
