// A PALETA GRANDE dos quadros.
//
// Os quadros tinham dez cores. Dez chegam para escrever e não chegam para
// desenhar: quem quer um céu quer três azuis, e quem desenha uma cara quer
// tons de pele que ali não existiam. O dono pediu-as a jogar.
//
// O que se verifica aqui é que a paleta existe nos DOIS quadros (o solo e o
// de sala), que escolher uma cor muda mesmo a tinta, e que as cores são
// distinguíveis umas das outras — uma grelha de setenta tons parecidos seria
// tão inútil como dez.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const page = await browser.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) A paleta tem cores que cheguem, e todas diferentes...");
const cores = await page.evaluate(async () => {
  const m = await import("./js/paleta.js");
  return m.coresDaPaleta();
});
const todas = cores.flatMap((l) => l.cores);
console.log(`   ${cores.length} famílias, ${todas.length} cores ao todo`);
if (todas.length < 50) fail(`uma paleta com ${todas.length} cores não é "muitas mais" do que as dez de antes`);
const distintas = new Set(todas.map((c) => c.toLowerCase()));
console.log(`   cores distintas: ${distintas.size}`);
if (distintas.size !== todas.length) fail("há cores repetidas na paleta");
if (!todas.every((c) => /^#[0-9a-f]{6}$/i.test(c))) fail("nem todas as cores são hexadecimais válidas");
// Tem de haver claros e escuros: uma paleta só de tons médios não deixa
// contornar nem preencher.
const luz = (c) => {
  const n = parseInt(c.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
};
const claros = todas.filter((c) => luz(c) > 0.75).length;
const escuros = todas.filter((c) => luz(c) < 0.25).length;
console.log(`   muito claras: ${claros}, muito escuras: ${escuros}`);
if (claros < 3) fail("faltam cores claras para preencher sem tapar");
if (escuros < 3) fail("faltam cores escuras para contornar");

console.log("2) No quadro solo, escolher da paleta muda mesmo a tinta...");
await page.click("[data-open-board]");
await page.waitForSelector('[data-screen="board"].active', { timeout: 8000 });
await page.click("#board-paleta-btn");
await page.waitForSelector("#paleta-overlay:not(.hidden)", { timeout: 5000 });
const quantosBotoes = await page.locator("#paleta-grelha .paleta-cor").count();
console.log(`   a grelha mostra ${quantosBotoes} cores`);
if (quantosBotoes !== todas.length) fail(`a grelha devia mostrar as ${todas.length} cores`);
// Escolhe uma cor que não está entre as dez de sempre.
const escolhida = await page.evaluate(() => {
  const b = document.querySelectorAll("#paleta-grelha .paleta-cor")[20];
  b.click();
  return b.dataset.cor;
});
await page.waitForTimeout(200);
const corDoQuadro = await page.evaluate(async () => (await import("./js/board.js")).__board?.color ?? null);
console.log(`   escolhida ${escolhida}, tinta do quadro: ${corDoQuadro}`);
const fechou = await page.evaluate(() => document.getElementById("paleta-overlay").classList.contains("hidden"));
if (!fechou) fail("escolher uma cor devia fechar a paleta");
// A cor confirma-se pelo traço: desenha-se e lê-se o pixel.
const box = await page.locator("#board-canvas").boundingBox();
await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const pixel = await page.evaluate(() => {
  const c = document.getElementById("board-canvas");
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(Math.round(c.width / 2), Math.round(c.height / 2), 1, 1).data;
  return `#${[d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
});
console.log(`   o traço saiu ${pixel} (esperado perto de ${escolhida})`);
const perto = (a, b) => {
  const na = parseInt(a.slice(1), 16); const nb = parseInt(b.slice(1), 16);
  return Math.abs(((na >> 16) & 255) - ((nb >> 16) & 255)) < 30
    && Math.abs(((na >> 8) & 255) - ((nb >> 8) & 255)) < 30
    && Math.abs((na & 255) - (nb & 255)) < 30;
};
if (!perto(pixel, escolhida)) fail(`a tinta não mudou: escolhi ${escolhida} e o traço saiu ${pixel}`);

console.log("3) O quadro de sala tem a mesma paleta — não é um privilégio de quem joga sozinho...");
await page.click("#board-exit-btn");
await page.waitForTimeout(300);
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await page.click('[data-mp-game="hangman"]');
await page.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
const temBotao = await page.locator("#hangman-paleta-btn").isVisible();
console.log(`   botão da paleta no quadro de sala: ${temBotao}`);
if (!temBotao) fail("o quadro de sala também devia ter a paleta");
await page.click("#hangman-paleta-btn");
await page.waitForSelector("#paleta-overlay:not(.hidden)", { timeout: 5000 });
const escolhida2 = await page.evaluate(() => {
  const b = document.querySelectorAll("#paleta-grelha .paleta-cor")[33];
  b.click();
  return b.dataset.cor;
});
await page.waitForTimeout(200);
const corDaSala = await page.evaluate(async () => (await import("./js/board-room.js")).__quadroSala?.color ?? null);
console.log(`   escolhida ${escolhida2}, tinta do quadro de sala: ${corDaSala}`);
if (corDaSala && corDaSala.toLowerCase() !== escolhida2.toLowerCase()) {
  fail(`a tinta do quadro de sala não mudou (está ${corDaSala})`);
}

console.log("4) Escape fecha a paleta sem escolher nada...");
await page.click("#hangman-paleta-btn");
await page.waitForSelector("#paleta-overlay:not(.hidden)", { timeout: 5000 });
await page.keyboard.press("Escape");
await page.waitForFunction(() => document.getElementById("paleta-overlay").classList.contains("hidden"), { timeout: 3000 });
const depoisDoEscape = await page.evaluate(async () => (await import("./js/board-room.js")).__quadroSala?.color ?? null);
console.log(`   tinta depois do Escape: ${depoisDoEscape} (devia ser a mesma)`);
if (depoisDoEscape && escolhida2 && depoisDoEscape.toLowerCase() !== escolhida2.toLowerCase()) {
  fail("fechar sem escolher não pode mudar a cor");
}

if (erros.length) fail(`erros de JavaScript: ${erros[0]}`);
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: ok");
await browser.close();
