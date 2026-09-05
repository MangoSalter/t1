// Passar a caneta no quadro: à escolha, à sorte, e sempre com um dono claro.
//
// Este caso já testou também "só quem tem a caneta escreve". Deixou de o
// fazer porque essa regra MUDOU: no desenho livre a folha é de todos, e a
// caneta diz apenas quem manda no quadro (modo, definições, limpar). Quem
// pode escrever passou a ser assunto do mp-board-shared-test, que cobre os
// três casos — livre, Forca com palavra em jogo, e Forca à espera de palavra.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [n, p] of [["host", host], ["guest", guest]]) {
  p.on("pageerror", (e) => errors.push(`${n}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${n}: ${m.text()}`); });
}

console.log("1) Ana cria a sala, Beto entra, abrem o quadro branco...");
await host.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
await host.fill("#name-input", "Ana");
await host.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await host.click("#create-room-btn");
await host.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await host.locator("#lobby-code").textContent()).trim();
await guest.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
await guest.fill("#name-input", "Beto");
await guest.fill("#join-code-input", code);
await guest.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await guest.click("#join-room-btn");
await guest.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await host.waitForTimeout(400);
await host.click('[data-mp-game="hangman"]');
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
const room0 = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const hostId = room0.hostId;
const betoId = Object.keys(room0.players).find((u) => room0.players[u].name === "Beto");
console.log(`   caneta começa com a Ana (anfitriã): ${room0.hangman.leaderId === hostId}`);
if (room0.hangman.leaderId !== hostId) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("2) Só a Ana vê o botão de passar a caneta; o Beto não...");
const hostSees = await host.locator("#hangman-pass-pen-btn").isVisible();
const guestSees = await guest.locator("#hangman-pass-pen-btn").isVisible();
console.log(`   Ana: ${hostSees} (esperado true), Beto: ${guestSees} (esperado false)`);
if (!hostSees || guestSees) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) No desenho livre, quem NÃO tem a caneta escreve à mesma...");
// É a regra nova, e é o contrário do que este passo testava antes: a folha do
// desenho livre é coletiva. A caneta aqui não é permissão de escrita, é quem
// manda no quadro.
await guest.evaluate(async ({ c, uid }) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.pushHangmanDoodlePoints(c, r, uid, [{ x: 0.2, y: 0.2, newStroke: true }]);
}, { c: code, uid: betoId });
await guest.waitForTimeout(200);
let room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const doBeto = Object.keys(room.hangman.doodle.points || {}).length;
console.log(`   pontos escritos pelo Beto, sem ter a caneta: ${doBeto} (esperado > 0)`);
if (doBeto === 0) { console.log("   FALHOU: no desenho livre a folha é de todos"); process.exitCode = 1; }

console.log("4) Ana passa a caneta ao Beto pelo seletor...");
await host.click("#hangman-pass-pen-btn");
await host.waitForSelector("#hangman-pen-overlay:not(.hidden)", { timeout: 3000 });
const listed = await host.locator("#hangman-pen-list button").allTextContents();
console.log(`   lista de quem pode receber: ${JSON.stringify(listed)} (a Ana não se deve listar a si própria)`);
if (listed.length !== 1 || !listed[0].includes("Beto")) { console.log("   FALHOU"); process.exitCode = 1; }
await host.locator("#hangman-pen-list button").first().click();
await guest.waitForFunction((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return r.hangman.leaderId !== r.hostId;
}, code, { timeout: 5000 });
room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   caneta agora com o Beto: ${room.hangman.leaderId === betoId}`);
if (room.hangman.leaderId !== betoId) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) Com a caneta trocada, os dois continuam a poder escrever...");
await guest.waitForTimeout(300);
const canvasBox = await guest.locator("#hangman-doodle-canvas").boundingBox();
await guest.mouse.move(canvasBox.x + 120, canvasBox.y + 160);
await guest.mouse.down();
await guest.mouse.move(canvasBox.x + 320, canvasBox.y + 260, { steps: 10 });
await guest.mouse.up();
await guest.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman.doodle.points || {}).length > 0, code, { timeout: 5000 });
room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const afterBeto = Object.keys(room.hangman.doodle.points || {}).length;
console.log(`   pontos escritos pelo Beto: ${afterBeto}`);
await host.evaluate(async ({ c, uid }) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.pushHangmanDoodlePoints(c, r, uid, [{ x: 0.9, y: 0.9, newStroke: true }]);
}, { c: code, uid: hostId });
await host.waitForTimeout(200);
room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const depoisDaAna = Object.keys(room.hangman.doodle.points || {}).length;
console.log(`   depois de a Ana escrever: ${depoisDaAna} (esperado mais do que ${afterBeto})`);
if (depoisDaAna <= afterBeto) { console.log("   FALHOU: no desenho livre, quem não tem a caneta devia escrever à mesma"); process.exitCode = 1; }

console.log("6) A Ana continua a ver o botão (é anfitriã, pode destravar) e o Beto passa a vê-lo...");
const hostStill = await host.locator("#hangman-pass-pen-btn").isVisible();
const guestNow = await guest.locator("#hangman-pass-pen-btn").isVisible();
console.log(`   Ana (anfitriã): ${hostStill} (esperado true), Beto (tem a caneta): ${guestNow} (esperado true)`);
if (!hostStill || !guestNow) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("7) Botão aleatório: o Beto passa a caneta à sorte — só pode calhar a outra pessoa...");
await guest.click("#hangman-pass-pen-btn");
await guest.waitForSelector("#hangman-pen-overlay:not(.hidden)", { timeout: 3000 });
await guest.click("#hangman-pen-random-btn");
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman.leaderId === window.__testDb.get(`rooms/${c}`).hostId, code, { timeout: 5000 });
room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   caneta voltou para a Ana: ${room.hangman.leaderId === hostId} (com 2 jogadores é o único destino possível)`);
if (room.hangman.leaderId !== hostId) { console.log("   FALHOU"); process.exitCode = 1; }
const overlayClosed = await guest.evaluate(() => document.getElementById("hangman-pen-overlay").classList.contains("hidden"));
if (!overlayClosed) { console.log("   FALHOU: o seletor devia fechar"); process.exitCode = 1; }

console.log("8) O texto de estado diz o que se pode fazer agora...");
// No desenho livre não faz sentido dizer "fulano tem a caneta" como se os
// outros não pudessem escrever — podem. O texto tem de dizer a verdade sobre
// a folha, senão as pessoas nem tentam.
const guestStatus = (await guest.locator("#hangman-status").textContent()).trim();
console.log(`   Beto vê: "${guestStatus}"`);
if (!guestStatus) { console.log("   FALHOU: o estado não devia ficar vazio"); process.exitCode = 1; }
if (/só .*caneta|apenas .*caneta/i.test(guestStatus)) {
  console.log("   FALHOU: no desenho livre não se pode dizer que só um escreve");
  process.exitCode = 1;
}

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
