// "Um de cada vez" no quadro branco: a caneta tem de poder passar de pessoa
// para pessoa (à escolha ou à sorte), e só quem a tem é que consegue escrever.
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

console.log("3) Beto tenta escrever sem ter a caneta — não deve acontecer nada...");
await guest.evaluate(async ({ c, uid }) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.pushHangmanDoodlePoints(c, r, uid, [{ x: 0.2, y: 0.2, newStroke: true }]);
}, { c: code, uid: betoId });
await guest.waitForTimeout(200);
let room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   pontos no quadro: ${Object.keys(room.hangman.doodle.points || {}).length} (esperado 0)`);
if (Object.keys(room.hangman.doodle.points || {}).length !== 0) { console.log("   FALHOU"); process.exitCode = 1; }

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

console.log("5) Agora é o Beto que escreve — e a Ana já não consegue...");
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
console.log(`   depois de a Ana tentar escrever: ${Object.keys(room.hangman.doodle.points || {}).length} (esperado continuar ${afterBeto})`);
if (Object.keys(room.hangman.doodle.points || {}).length !== afterBeto) { console.log("   FALHOU: quem já não tem a caneta conseguiu escrever"); process.exitCode = 1; }

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

console.log("8) O texto de estado explica de quem é a vez (as regras combinam-se por voz)...");
const guestStatus = await guest.locator("#hangman-status").textContent();
console.log(`   Beto vê: "${guestStatus}"`);
if (!guestStatus.includes("Ana")) { console.log("   FALHOU: devia dizer quem tem a caneta"); process.exitCode = 1; }

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
