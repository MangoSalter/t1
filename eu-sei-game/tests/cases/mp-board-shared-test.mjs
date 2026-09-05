// Quem pode escrever no quadro. A regra deixou de ser "só quem tem a caneta":
//   - desenho livre: toda a gente, sempre;
//   - Forca com palavra em jogo: só quem tem a caneta;
//   - Forca à espera de palavra, ou já acertada: toda a gente outra vez.
// É a diferença entre uma folha coletiva e uma folha em que um desenha e os
// outros olham.
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

async function rabiscar(p, x, y) {
  const caixa = await p.locator("#hangman-doodle-canvas").boundingBox();
  await p.mouse.move(caixa.x + x, caixa.y + y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i += 1) await p.mouse.move(caixa.x + x + i * 12, caixa.y + y + i * 6);
  await p.mouse.up();
  await p.waitForTimeout(250);
}

console.log("1) Sala com dois jogadores, no quadro (modo livre)...");
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

const pontos = () => host.evaluate((c) =>
  Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length, code);

console.log("2) NO DESENHO LIVRE, O BETO TAMBÉM ESCREVE...");
// A Ana é a anfitriã e tem a caneta; o Beto não. No livre, isso não importa.
if (!(await guest.evaluate(() => !document.getElementById("hangman-pen-zone").classList.contains("hidden")))) {
  fail("no desenho livre, quem não tem a caneta devia ver as ferramentas");
}
const antes = await pontos();
await rabiscar(guest, 150, 200);
const depois = await pontos();
console.log(`   pontos na sala: ${antes} -> ${depois}`);
if (depois <= antes) fail("o traço do Beto não chegou ao quadro de todos");
// E a Ana vê o traço dele.
await host.waitForFunction((args) => Object.keys(window.__testDb.get(`rooms/${args[0]}`).hangman.doodle.points || {}).length > args[1], [code, antes], { timeout: 8000 });
console.log("   e a Ana viu");

console.log("3) E o rascunho pessoal não aparece a quem já escreve no quadro...");
// Um rascunho por cima de uma folha em que já se pode escrever não serve para
// nada e só confunde.
const temRascunho = await guest.evaluate(() =>
  !document.getElementById("hangman-personal-tools").classList.contains("hidden"));
console.log(`   o Beto vê as ferramentas do rascunho: ${temRascunho} (esperado false)`);
if (temRascunho) fail("o rascunho não devia aparecer a quem pode escrever no quadro");

console.log("4) Na Forca à espera de palavra, ainda é de todos...");
await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
await host.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await host.click('[data-color-choice="#b24b38"]');
await guest.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await guest.click('[data-color-choice="#5c7e91"]');
const idAna = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, code);
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await host.click(`[data-pen-vote-choice="${idAna}"]`);
await host.waitForFunction((a) => window.__testDb.get(`rooms/${a[0]}`).hangman?.leaderId === a[1], [code, idAna], { timeout: 8000 });
await guest.waitForTimeout(500);
const antes2 = await pontos();
await rabiscar(guest, 300, 250);
const depois2 = await pontos();
console.log(`   pontos na sala: ${antes2} -> ${depois2} (ainda não há palavra)`);
if (depois2 <= antes2) fail("sem palavra definida, o Beto devia poder desenhar");

console.log("5) COM PALAVRA EM JOGO, só quem tem a caneta escreve...");
await host.fill("#hangman-word-input", "banana");
await host.click("#hangman-word-form button[type=submit]");
await guest.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
await guest.waitForTimeout(400);
const antes3 = await pontos();
await rabiscar(guest, 400, 300);
const depois3 = await pontos();
console.log(`   pontos na sala: ${antes3} -> ${depois3} (esperado igual)`);
if (depois3 !== antes3) fail("com palavra em jogo, quem adivinha escreveu no quadro — podia escrever a resposta lá");
// E aí sim o rascunho pessoal aparece.
if (!(await guest.evaluate(() => !document.getElementById("hangman-personal-tools").classList.contains("hidden")))) {
  fail("com palavra em jogo, quem adivinha devia ter o rascunho pessoal");
}
// A Ana, essa, continua a poder desenhar a forca.
const antes4 = await pontos();
await rabiscar(host, 500, 200);
if (await pontos() <= antes4) fail("quem tem a caneta devia poder desenhar a forca");
console.log("   e quem tem a caneta continua a desenhar");

console.log("6) DEPOIS DE ACERTAREM, a folha volta a ser de todos...");
await host.click("#hangman-reveal-btn");
await guest.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.solved === true, code, { timeout: 8000 });
await guest.waitForTimeout(500);
const antes5 = await pontos();
await rabiscar(guest, 250, 350);
const depois5 = await pontos();
console.log(`   pontos na sala: ${antes5} -> ${depois5}`);
if (depois5 <= antes5) fail("depois de acertarem, a folha devia voltar a ser de todos");

console.log("7) E quem escreve pode limpar e anular o que escreveu...");
const podeLimpar = await guest.evaluate(() => ({
  limpar: !document.getElementById("hangman-doodle-clear-btn").classList.contains("hidden"),
  anular: !document.getElementById("hangman-undo-btn").classList.contains("hidden"),
}));
console.log(`   o Beto vê limpar: ${podeLimpar.limpar}, anular: ${podeLimpar.anular}`);
if (!podeLimpar.limpar || !podeLimpar.anular) {
  fail("numa folha coletiva, quem escreve tem de poder apagar o que escreveu");
}
const antesAnular = await pontos();
await guest.click("#hangman-undo-btn");
await host.waitForFunction((a) => Object.keys(window.__testDb.get(`rooms/${a[0]}`).hangman.doodle.points || {}).length < a[1], [code, antesAnular], { timeout: 8000 });
console.log("   anular tirou o último traço, e a Ana viu");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-shared FALHOU" : "=> mp-board-shared ok");
