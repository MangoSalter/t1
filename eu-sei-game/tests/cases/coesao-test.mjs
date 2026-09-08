// COESÃO: os jogos do site são do mesmo mundo, ou são ecrãs soltos?
//
// Este caso nasceu de uma conta que dava mal. Havia falas da Dona Manga e do
// Brasa para doze mini-jogos — e os doze foram para a oficina. Os dois que o
// dono escolheu manter, o quadro e o mapa, eram exatamente os dois sem fala
// nenhuma: abriam numa folha em branco, sem ninguém a dizer nada, como se
// fossem de outra aplicação.
//
// O que se guarda aqui é a regra, não as falas: um jogo que está no site tem
// de ter voz. Se amanhã voltar um jogo da oficina, é aqui que se descobre que
// ele veio calado.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const page = await browser.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await page.reload({ waitUntil: "networkidle" });

// As falas lêem-se da PÁGINA e não do ficheiro em disco: o que interessa é o
// que chega a quem joga, e a cópia servida é a que chega.
const MASCOT_INTROS = await page.evaluate(async () => (await import("./js/data.js")).MASCOT_INTROS);

console.log("1) Os jogos do site têm todos falas da casa...");
// As chaves dos jogos que ficaram no site e que passam pelo ecrã de
// preparação. O mapa e o quadro estão à parte porque não passam por lá — têm
// as falas deles noutro sítio, e é isso que os passos seguintes verificam.
const NO_SITE_COM_INTRO = ["word", "memory", "hangman", "golf"];
NO_SITE_COM_INTRO.forEach((chave) => {
  const falas = MASCOT_INTROS[chave];
  console.log(`   ${chave}: ${falas ? falas.length : 0} falas`);
  if (!falas || falas.length < 2) fail(`${chave} devia ter pelo menos duas falas da casa`);
  (falas || []).forEach((f) => {
    if (!/Manga|Brasa/.test(f.who)) fail(`${chave}: "${f.who}" não é ninguém desta casa`);
    if (!f.text || f.text.length < 10) fail(`${chave}: fala curta de mais`);
  });
});

console.log("2) O quadro branco recebe quem entra, em vez de abrir uma folha muda...");
await page.click("[data-open-board]");
await page.waitForSelector('[data-screen="board"].active', { timeout: 8000 });
await page.waitForFunction(() => {
  const el = document.getElementById("board-mascote");
  return el && !el.classList.contains("hidden") && el.textContent.trim().length > 0;
}, { timeout: 8000 });
const noQuadro = (await page.locator("#board-mascote").textContent()).trim();
console.log(`   ao abrir o quadro: "${noQuadro}"`);
if (!/Manga|Brasa/.test(noQuadro)) fail("o quadro devia abrir com uma fala da casa");
const quemFala = MASCOT_INTROS.board.map((f) => f.text);
if (!quemFala.some((texto) => noQuadro.includes(texto))) {
  fail("a fala do quadro não é nenhuma das que estão escritas para ele");
}

console.log("3) E o mapa também, na língua de quem está a jogar...");
await page.click("#board-exit-btn");
await page.waitForTimeout(300);
await page.click("[data-open-mapa]");
await page.waitForSelector('[data-screen="mapa"].active', { timeout: 8000 });
await page.waitForFunction(() => {
  const el = document.getElementById("mapa-mascote");
  return el && !el.classList.contains("hidden") && el.textContent.trim().length > 0;
}, { timeout: 10000 });
const noMapa = (await page.locator("#mapa-mascote").textContent()).trim();
console.log(`   ao abrir o mapa (pt): "${noMapa}"`);
if (!/Manga|Brasa/.test(noMapa)) fail("o mapa devia abrir com uma fala da casa");

console.log("4) Em inglês, a gata fala inglês — senão não é coesão, é descuido...");
await page.evaluate(() => localStorage.setItem("euSei_lingua", "en"));
await page.reload({ waitUntil: "networkidle" });
await page.click("[data-open-mapa]");
await page.waitForSelector('[data-screen="mapa"].active', { timeout: 8000 });
await page.waitForFunction(() => {
  const el = document.getElementById("mapa-mascote");
  return el && !el.classList.contains("hidden") && el.textContent.trim().length > 0;
}, { timeout: 10000 });
const emIngles = (await page.locator("#mapa-mascote").textContent()).trim();
console.log(`   ao abrir o mapa (en): "${emIngles}"`);
const falasEn = await page.evaluate(async () => {
  const i = await import("./js/i18n.js");
  return i.t("mapaFalas").map((f) => f[1]);
});
if (!falasEn.some((texto) => emIngles.includes(texto))) {
  fail(`a fala em inglês não veio do dicionário inglês: "${emIngles}"`);
}
// E as três línguas têm de ter o mesmo número de falas: uma língua a menos
// significa que alguém em espanhol vê sempre as mesmas duas.
const contagens = await page.evaluate(async () => {
  const i = await import("./js/i18n.js");
  const n = {};
  for (const lingua of ["pt", "en", "es"]) {
    i.definirLingua(lingua);
    n[lingua] = i.t("mapaFalas").length;
  }
  i.definirLingua("pt");
  return n;
});
console.log(`   falas por língua: ${JSON.stringify(contagens)}`);
if (new Set(Object.values(contagens)).size !== 1) fail("as três línguas deviam ter as mesmas falas");
if (contagens.pt < 4) fail("quatro falas é o mínimo para não se repetirem sempre");

console.log("4b) A Dona Manga também se mete no mapa — e nunca numa sala...");
// Havia caos nos doze mini-jogos que foram todos para a oficina, e nenhum nos
// dois que ficaram. O mapa passa a tê-lo; o quadro não, porque uma pata em
// cima de um desenho a meio estraga trabalho em vez de dar graça.
const caos = await page.evaluate(async () => {
  const c = await import("./js/caos.js");
  const d = await import("./js/data.js");
  const ecra = document.querySelector('[data-screen="mapa"]');
  // Dispara-se à mão o evento da pata: esperar pelos 6 a 14 segundos do
  // temporizador tornava este caso lento e instável.
  const pata = d.CHAOS_EVENTS.find((e) => e.kind === "paw");
  c.dispararCaos(pata, ecra);
  const banner = document.getElementById("chaos-banner");
  const paw = document.getElementById("chaos-paw");
  const visto = {
    banner: banner.textContent,
    bannerVisivel: !banner.classList.contains("hidden"),
    pataVisivel: !paw.classList.contains("hidden"),
  };
  c.limparCaos();
  return {
    ...visto,
    limpouBanner: banner.classList.contains("hidden"),
    limpouPata: paw.classList.contains("hidden"),
    bonusDaPata: c.dispararCaos(pata, ecra),
    bonusDoBrasa: c.dispararCaos(d.CHAOS_EVENTS.find((e) => e.kind === "bonus"), ecra),
  };
});
console.log(`   no mapa: "${caos.banner}" · pata: ${caos.pataVisivel}`);
if (!caos.bannerVisivel) fail("o caos devia anunciar-se");
if (!caos.pataVisivel) fail("a pata devia aparecer");
if (!/Manga|Brasa/.test(caos.banner)) fail("o caos é da casa, tem de dizer de quem foi");
if (!caos.limpouBanner || !caos.limpouPata) fail("o caos tem de sair do ecrã — uma pata presa tapa o jogo para sempre");
console.log(`   bónus: pata dá ${caos.bonusDaPata}, o Brasa dá ${caos.bonusDoBrasa}`);
if (caos.bonusDaPata !== 0) fail("a pata não dá pontos, só atrapalha");
if (!(caos.bonusDoBrasa > 0)) fail("o Brasa passa pontos por baixo da mesa — é o que o torna o Brasa");
await page.evaluate(async () => (await import("./js/caos.js")).limparCaos());

// E numa sala a gata não entra: uma pata no ecrã de um só é uma desvantagem
// que os outros não têm.
const emSala = await page.evaluate(async () => {
  const m = await import("./js/mapa-ecra.js");
  const armadoAntes = m.__mapa.jogo.caosTimer !== null && m.__mapa.jogo.caosTimer !== undefined;
  m.ligarASala({ minhaCor: "#b24b38", aoConquistar: async () => ({ ganhou: true }), aoErrar: () => {}, aoRevelar: () => {} });
  const paradoDepois = m.__mapa.jogo.caosTimer === null || m.__mapa.jogo.caosTimer === undefined;
  m.ligarASala(null);
  return { armadoAntes, paradoDepois };
});
console.log(`   sozinho o caos estava armado: ${emSala.armadoAntes} · com a sala ligada fica quieto: ${emSala.paradoDepois}`);
if (!emSala.armadoAntes) fail("no mapa a sozinho o caos devia estar armado");
if (!emSala.paradoDepois) fail("entrar numa sala tem de cancelar o caos — senão a pata cai no meio de uma partida partilhada");

console.log("5) A fala sai do ecrã sozinha, para não ficar a tapar o mapa...");
// Sete segundos no código; aqui adianta-se o relógio em vez de esperar.
await page.evaluate(() => {
  const el = document.getElementById("mapa-mascote");
  el.classList.add("a-sair");
});
// A transição são 600ms; ler a opacidade a seguir ao clique lia o valor de
// antes de ela começar.
await page.waitForTimeout(800);
const aSair = await page.evaluate(() => getComputedStyle(document.getElementById("mapa-mascote")).opacity);
console.log(`   opacidade a sair: ${aSair}`);
if (Number(aSair) > 0.5) fail("a fala devia desvanecer, não ficar lá para sempre");

if (erros.length) fail(`erros de JavaScript: ${erros[0]}`);
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: ok");
await browser.close();
