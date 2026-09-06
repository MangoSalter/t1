// O mapa-múndi a ser jogado num browser.
//
// A lógica tem o seu teste sem browser (test-mapa.mjs); este responde à outra
// metade: clicar mesmo no mapa acerta no país certo, escrever o nome pinta-o e
// tranca-o, e quem se engana percebe porquê.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text()); });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) O mapa abre a partir do menu de jogar sozinho...");
await page.click("#solo-menu-btn");
await page.click('[data-screen="solo-menu"] [data-open-mapa]');
await page.waitForSelector('[data-screen="mapa"].active', { timeout: 5000 });
// Os países vêm de um ficheiro: espera-se que cheguem.
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return m.mapa.paises.length > 0;
}, { timeout: 10000 });
const quantos = await page.evaluate(async () => (await import("./js/mapa.js")).mapa.paises.length);
console.log(`   ${quantos} países carregados`);
if (quantos !== 177) fail(`esperava 177 países, tenho ${quantos}`);

const progresso = () => page.locator("#mapa-progresso").textContent();
console.log(`   contador: "${(await progresso()).trim()}"`);
if (!/0 de 177/.test(await progresso())) fail("devia começar com nenhum conquistado");

// Onde é que um país está no ecrã, agora, com a câmara como está.
const ecraDe = (lon, lat) => page.evaluate(async ([lo, la]) => {
  const m = await import("./js/mapa.js");
  const caixa = document.getElementById("mapa-canvas").getBoundingClientRect();
  const s = m.ecraDoMundo((lo + 180) / 360, (90 - la) / 180);
  return { x: caixa.left + s.x, y: caixa.top + s.y };
}, [lon, lat]);

console.log("2) Clicar num país escolhe-o (e o mar não escolhe nada)...");
const mar = await ecraDe(-25, -30);
await page.mouse.click(mar.x, mar.y);
console.log(`   no oceano: "${(await page.locator("#mapa-status").textContent()).trim()}"`);
if (!/mar/i.test(await page.locator("#mapa-status").textContent())) fail("clicar no mar devia dizer que é mar");

const brasil = await ecraDe(-47.88, -15.79);
await page.mouse.click(brasil.x, brasil.y);
const escolhido = await page.evaluate(async () => (await import("./js/mapa.js")).mapa.selecionado?.nome);
console.log(`   cliquei em Brasília e escolheu: ${escolhido}`);
if (escolhido !== "Brasil") fail(`clicar em Brasília devia escolher o Brasil, escolheu ${escolhido}`);

console.log("3) Escrever o nome errado não conquista nada...");
await page.fill("#mapa-input", "Argentina");
await page.click("#mapa-form button[type=submit]");
const depoisDoErro = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { donos: Object.keys(m.mapa.donos).length, texto: document.getElementById("mapa-status").textContent };
});
console.log(`   "${depoisDoErro.texto.trim()}" — conquistados: ${depoisDoErro.donos}`);
if (depoisDoErro.donos !== 0) fail("um nome errado não pode conquistar o país");

console.log("4) Escrever o nome certo pinta e tranca...");
await page.fill("#mapa-input", "brasil");
await page.click("#mapa-form button[type=submit]");
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos.Brasil;
}, { timeout: 5000 });
console.log(`   contador: "${(await progresso()).trim()}"`);
if (!/1 de 177/.test(await progresso())) fail("o contador devia subir");
// E clicar outra vez diz que já está — não deixa reescrever nem mudar de cor.
await page.mouse.click(brasil.x, brasil.y);
const jaEsta = await page.locator("#mapa-status").textContent();
console.log(`   ao clicar outra vez: "${jaEsta.trim()}"`);
if (!/já está/i.test(jaEsta)) fail("um país conquistado devia dizer que já está");

console.log("5) O território pintado vê-se mesmo no ecrã...");
// Lê o pixel onde está Brasília: tem de ter a cor de quem o conquistou, e não
// o creme do mapa por preencher.
const cor = await page.evaluate(async ([lo, la]) => {
  const m = await import("./js/mapa.js");
  const c = document.getElementById("mapa-canvas");
  const s = m.ecraDoMundo((lo + 180) / 360, (90 - la) / 180);
  const d = c.getContext("2d").getImageData(Math.round(s.x * m.mapa.dpr), Math.round(s.y * m.mapa.dpr), 1, 1).data;
  return `${d[0]},${d[1]},${d[2]}`;
}, [-47.88, -15.79]);
console.log(`   cor em Brasília: rgb(${cor}) — esperado o vermelho do jogador (178,75,56)`);
if (cor !== "178,75,56") fail("o território conquistado devia estar pintado da cor do jogador");

console.log("6) Recomeçar limpa o mapa...");
await page.click("#mapa-recomecar-btn");
if (!/0 de 177/.test(await progresso())) fail("recomeçar devia limpar tudo");

console.log("7) A roda dá zoom e o botão direito arrasta, como no quadro...");
const camara = () => page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { zoom: m.mapa.zoom, panX: Math.round(m.mapa.panX) };
});
const antes = await camara();
await page.mouse.move(600, 400);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(120);
const comZoom = await camara();
console.log(`   zoom ${antes.zoom.toFixed(0)} -> ${comZoom.zoom.toFixed(0)}`);
if (!(comZoom.zoom > antes.zoom)) fail("a roda para cima devia aproximar");
await page.mouse.move(600, 400);
await page.mouse.down({ button: "right" });
await page.mouse.move(700, 430);
await page.mouse.up({ button: "right" });
await page.waitForTimeout(120);
const arrastado = await camara();
console.log(`   pan ${comZoom.panX} -> ${arrastado.panX}`);
if (arrastado.panX === comZoom.panX) fail("o botão direito devia arrastar o mapa");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mapa-ecra FALHOU" : "=> mapa-ecra ok");
