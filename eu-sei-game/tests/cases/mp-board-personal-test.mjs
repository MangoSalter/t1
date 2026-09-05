// Folha pessoal de quem adivinha. A regra que interessa é uma só, e é dura:
// NADA do que se rabisca aqui pode chegar ao quadro dos outros. E, ao mesmo
// tempo, o quadro de quem tem a caneta tem de continuar a chegar por baixo em
// tempo real — as duas coisas ao mesmo tempo é que fazem isto valer a pena.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [name, p] of [["Ana", host], ["Beto", guest]]) {
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${name}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

console.log("1) Sala com a Ana (caneta) e o Beto (a adivinhar)...");
await host.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await host.fill("#name-input", "Ana");
await host.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await host.click("#create-room-btn");
await host.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await host.locator("#lobby-code").textContent()).trim();
await guest.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await guest.fill("#name-input", "Beto");
await guest.fill("#join-code-input", code);
await guest.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await guest.click("#join-room-btn");
await guest.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await host.click('[data-mp-game="hangman"]');
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });

const pontosNaSala = () => host.evaluate((c) =>
  Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length, code);

console.log("1b) Pôr uma palavra em jogo: é aí que o rascunho faz sentido...");
// O rascunho existe para quem NÃO pode escrever no quadro comum. No desenho
// livre toda a gente escreve, por isso não há rascunho nenhum a mostrar — só
// com uma palavra da Forca em jogo é que o Beto fica de fora da folha.
await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
await host.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await host.click('[data-color-choice="#b24b38"]');
await guest.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await guest.click('[data-color-choice="#5c7e91"]');
const idAnaP = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, code);
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await host.click(`[data-pen-vote-choice="${idAnaP}"]`);
await host.waitForFunction((a) => window.__testDb.get(`rooms/${a[0]}`).hangman?.leaderId === a[1], [code, idAnaP], { timeout: 8000 });
await host.fill("#hangman-word-input", "banana");
await host.click("#hangman-word-form button[type=submit]");
await guest.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
await guest.waitForTimeout(400);

console.log("2) As ferramentas do rascunho são de quem NÃO pode escrever no quadro...");
const temRascunho = (p) => p.evaluate(() =>
  !document.getElementById("hangman-personal-tools").classList.contains("hidden"));
console.log(`   Ana (com caneta): ${await temRascunho(host)}, Beto (sem): ${await temRascunho(guest)}`);
if (await temRascunho(host)) fail("quem escreve no quadro não precisa de rascunho por cima do próprio traço");
if (!(await temRascunho(guest))) fail("com palavra em jogo, quem adivinha devia ter a folha de rascunho");

console.log("3) A Ana desenha no quadro de todos, e o Beto vê...");
const caixaAna = await host.locator("#hangman-doodle-canvas").boundingBox();
await host.mouse.move(caixaAna.x + 200, caixaAna.y + 200);
await host.mouse.down();
for (let i = 1; i <= 10; i += 1) await host.mouse.move(caixaAna.x + 200 + i * 20, caixaAna.y + 200 + i * 8);
await host.mouse.up();
await guest.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length > 0, code, { timeout: 8000 });
const pontosDoQuadro = await pontosNaSala();
console.log(`   pontos do quadro na sala: ${pontosDoQuadro}`);
if (pontosDoQuadro === 0) fail("o traço da Ana não chegou à sala");

console.log("4) O BETO RABISCA NO SEU RASCUNHO — e nada disso vai para a sala...");
await guest.click("#hangman-personal-toggle");
const ligado = await guest.evaluate(() => window.__hangmanPersonal.on);
if (!ligado) fail("o rascunho não ficou ligado");
const caixaBeto = await guest.locator("#hangman-personal-canvas").boundingBox();
for (let n = 0; n < 3; n += 1) {
  await guest.mouse.move(caixaBeto.x + 100 + n * 40, caixaBeto.y + 300);
  await guest.mouse.down();
  for (let i = 1; i <= 12; i += 1) await guest.mouse.move(caixaBeto.x + 100 + n * 40 + i * 6, caixaBeto.y + 300 + i * 10);
  await guest.mouse.up();
}
await guest.waitForTimeout(600);
const meusTracos = await guest.evaluate(() => window.__hangmanPersonal.strokes.length);
console.log(`   traços no rascunho do Beto: ${meusTracos}`);
if (meusTracos !== 3) fail(`esperava 3 traços no rascunho, tenho ${meusTracos}`);
// A regra dura: a sala não pode ter crescido nem um ponto.
const pontosDepois = await pontosNaSala();
console.log(`   pontos do quadro na sala depois de rabiscar: ${pontosDepois} (era ${pontosDoQuadro})`);
if (pontosDepois !== pontosDoQuadro) {
  fail("o rascunho do Beto foi parar ao quadro de todos");
}
// E a Ana não vê nada disso.
const anaVeRascunho = await host.evaluate(() => window.__hangmanPersonal.strokes.length);
if (anaVeRascunho !== 0) fail("o rascunho do Beto apareceu no ecrã da Ana");

console.log("5) E o quadro de todos continua a chegar ao Beto POR BAIXO do rascunho...");
// Isto é o que faz a coisa valer a pena: rabiscar não congela o jogo.
await host.mouse.move(caixaAna.x + 600, caixaAna.y + 150);
await host.mouse.down();
for (let i = 1; i <= 10; i += 1) await host.mouse.move(caixaAna.x + 600 + i * 10, caixaAna.y + 150 + i * 12);
await host.mouse.up();
await guest.waitForFunction((args) => Object.keys(window.__testDb.get(`rooms/${args[0]}`).hangman?.doodle?.points || {}).length > args[1], [code, pontosDoQuadro], { timeout: 8000 });
console.log("   o traço novo da Ana chegou ao Beto enquanto ele tinha o rascunho ligado");
// E o rascunho dele continua intacto.
const aindaTem = await guest.evaluate(() => window.__hangmanPersonal.strokes.length);
if (aindaTem !== 3) fail(`o rascunho perdeu-se ao chegar o traço da Ana (${aindaTem})`);

console.log("6) 'Limpar o meu' limpa só o rascunho...");
const antesDeLimpar = await pontosNaSala();
await guest.click("#hangman-personal-clear");
const depoisDeLimpar = await guest.evaluate(() => window.__hangmanPersonal.strokes.length);
console.log(`   traços no rascunho depois de limpar: ${depoisDeLimpar}`);
if (depoisDeLimpar !== 0) fail("limpar o rascunho não o limpou");
if (await pontosNaSala() !== antesDeLimpar) fail("limpar o rascunho mexeu no quadro de todos");

console.log("7) Com o rascunho DESLIGADO, o rato volta a ser do quadro...");
// Se a tela do rascunho continuasse a apanhar cliques desligada, ninguém mais
// conseguia mexer no que está por baixo.
await guest.click("#hangman-personal-toggle");
const desligado = await guest.evaluate(() => ({
  on: window.__hangmanPersonal.on,
  eventos: getComputedStyle(document.getElementById("hangman-personal-canvas")).pointerEvents,
}));
console.log(`   ligado: ${desligado.on}, a tela apanha o rato: ${desligado.eventos}`);
if (desligado.on) fail("o rascunho não desligou");
if (desligado.eventos !== "none") fail("a tela do rascunho continua a roubar o rato ao quadro");

console.log("8) Se o Beto receber a caneta, o rascunho sai do caminho...");
await host.click("#hangman-pass-pen-btn");
const betoId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Beto");
}, code);
await host.click(`#hangman-pen-list button:has-text("Beto")`);
await guest.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [code, betoId], { timeout: 8000 });
await guest.waitForFunction(() => document.getElementById("hangman-personal-tools").classList.contains("hidden"), { timeout: 8000 });
console.log("   com a caneta na mão, o Beto deixa de ver as ferramentas do rascunho");
// E a Ana, que agora adivinha, passa a vê-las.
await host.waitForFunction(() => !document.getElementById("hangman-personal-tools").classList.contains("hidden"), { timeout: 8000 });
console.log("   e a Ana, que passou a adivinhar, passa a vê-las");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-personal FALHOU" : "=> mp-board-personal ok");
