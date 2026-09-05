import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) No ecrã inicial (fora de sala), o botão flutuante de Opções deve estar escondido...");
const fabHiddenAtHome = await page.locator("#options-fab").evaluate((el) => el.classList.contains("hidden"));
console.log(`   escondido: ${fabHiddenAtHome} (esperado true)`);
if (!fabHiddenAtHome) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("2) Criar sala -> o botão de Opções deve aparecer...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 42, connected: true },
    p3: { name: "Carla", score: 7, connected: true },
  });
}, code);
await page.waitForTimeout(200);
const fabVisibleInRoom = await page.locator("#options-fab").isVisible();
console.log(`   visível: ${fabVisibleInRoom} (esperado true)`);
if (!fabVisibleInRoom) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Abrir Opções -> mostra classificação ordenada por pontos...");
await page.click("#options-fab");
await page.waitForSelector("#options-overlay:not(.hidden)", { timeout: 3000 });
const rows = await page.locator("#options-leaderboard-list .score-row").allTextContents();
console.log(`   linhas: ${JSON.stringify(rows)}`);
if (!rows[0].includes("Beto") || !rows[0].includes("42")) {
  console.log("   FALHOU: Beto (42 pts) devia estar em 1º");
  process.exitCode = 1;
}

console.log("4) Mudar para o separador Rabisco e desenhar (Ana, cor de índice 0)...");
await page.click("#options-tab-scratchpad");
await page.waitForSelector("#options-panel-scratchpad:not(.hidden)", { timeout: 3000 });
const canvasBox = await page.locator("#options-scratchpad-canvas").boundingBox();
await page.mouse.move(canvasBox.x + 50, canvasBox.y + 50);
await page.mouse.down();
await page.mouse.move(canvasBox.x + 150, canvasBox.y + 100, { steps: 8 });
await page.mouse.up();
await page.waitForFunction((code) => Object.keys(window.__testDb.get(`rooms/${code}`).scratchpad?.points || {}).length > 0, code, { timeout: 3000 });
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   pontos transmitidos: ${Object.keys(room.scratchpad.points || {}).length}, uid do 1º ponto: ${Object.values(room.scratchpad.points)[0].uid} (esperado ${hostId})`);
if (Object.keys(room.scratchpad.points || {}).length === 0 || Object.values(room.scratchpad.points)[0].uid !== hostId) {
  console.log("   FALHOU"); process.exitCode = 1;
}

console.log("5) Simular p2 a desenhar também (qualquer jogador pode, sem 'vez')...");
await page.evaluate(async ({ code }) => {
  const roomModule = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${code}`);
  await roomModule.pushScratchpadPoints(code, r, [{ x: 0.3, y: 0.3, uid: "p2", newStroke: true }]);
}, { code });
await page.waitForTimeout(150);
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const hasP2Point = Object.values(room.scratchpad.points).some((p) => p.uid === "p2");
console.log(`   p2 conseguiu desenhar também: ${hasP2Point} (esperado true — sem restrição de 'vez' aqui)`);
if (!hasP2Point) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Limpar o rabisco...");
await page.click("#options-scratchpad-clear-btn");
await page.waitForFunction((code) => Object.keys(window.__testDb.get(`rooms/${code}`).scratchpad?.points || {}).length === 0, code, { timeout: 3000 });
console.log("   OK: rabisco limpo");

console.log("7) Fechar Opções e sair da sala -> botão flutuante deve desaparecer...");
await page.click("#options-close-btn");
const overlayHidden = await page.locator("#options-overlay").evaluate((el) => el.classList.contains("hidden"));
if (!overlayHidden) { console.log("   FALHOU: overlay devia fechar"); process.exitCode = 1; }
await page.click('[data-leave]');
await page.waitForSelector('[data-screen="home"].active', { timeout: 3000 });
const fabHiddenAfterLeave = await page.locator("#options-fab").evaluate((el) => el.classList.contains("hidden"));
console.log(`   fab escondido depois de sair: ${fabHiddenAfterLeave} (esperado true)`);
if (!fabHiddenAfterLeave) { console.log("   FALHOU"); process.exitCode = 1; }

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
