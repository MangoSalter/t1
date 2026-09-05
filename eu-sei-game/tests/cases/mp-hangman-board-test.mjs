import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala (Ana = anfitriã), injetar 2 jogadores, forçar só Forca como bónus, chegar ao quadro...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
  window.__testDb.update(`rooms/${code}/config`, { bonusGames: ["hangman"] });
}, code);
const numRounds = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).config.numRounds, code);
await page.evaluate(({ code, numRounds }) => {
  window.__testDb.update(`rooms/${code}`, { round: numRounds, state: "roundScore" });
}, { code, numRounds });
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 3000 });
await page.click("#round-next-btn");
await page.waitForSelector('[data-screen="hangman"].active', { timeout: 3000 });
console.log("   OK: no quadro branco da Forca");

console.log("2) Confirmar estado inicial: Ana (anfitriã) é a líder, doodle vazio...");
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   leaderId: ${room.hangman.leaderId} (esperado ${hostId}), pontos: ${Object.keys(room.hangman.doodle.points || {}).length}`);
if (room.hangman.leaderId !== hostId) { console.log("   FALHOU: líder devia ser o anfitrião"); process.exitCode = 1; }
if (Object.keys(room.hangman.doodle.points || {}).length !== 0) { console.log("   FALHOU: devia começar vazio"); process.exitCode = 1; }
const statusText = await page.locator("#hangman-status").textContent();
console.log(`   estado: "${statusText}" (Ana tem a caneta)`);
if (!statusText.includes("caneta")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Confirmar que o ecrã ocupa o browser todo (fora do cartão/moldura normal), com a barra de ferramentas no seu próprio espaço (não sobreposta ao canvas)...");
const canvasBox = await page.locator("#hangman-doodle-canvas").boundingBox();
// A classe .hangman-toolbar é partilhada com o ecrã do Desenha e Adivinha,
// por isso o seletor tem de ser limitado a este ecrã (senão o Playwright
// recusa por corresponder a dois elementos).
const toolbarBox = await page.locator('[data-screen="hangman"] .hangman-toolbar').boundingBox();
// A barra de baixo (zona 3 do desenhador / zona a de quem vê) entrou depois
// deste teste e também ocupa altura: a regra continua a ser "as três peças
// juntas enchem o browser", não "duas".
const modeBarBox = await page.locator('[data-screen="hangman"] .hangman-mode-bar').boundingBox();
const viewport = page.viewportSize();
console.log(`   canvas: ${canvasBox.width}x${canvasBox.height} a partir de y=${canvasBox.y}, barra de cima: ${toolbarBox.height}, barra do modo: ${modeBarBox.height}, viewport: ${viewport.width}x${viewport.height}`);
if (Math.abs(canvasBox.width - viewport.width) > 2) {
  console.log("   FALHOU: canvas devia ocupar a largura toda do browser");
  process.exitCode = 1;
}
if (Math.abs(canvasBox.height + toolbarBox.height + modeBarBox.height - viewport.height) > 2) {
  console.log("   FALHOU: canvas + barra juntos deviam ocupar a altura toda do browser");
  process.exitCode = 1;
}
if (canvasBox.y < toolbarBox.height - 1) {
  console.log("   FALHOU: canvas começa por baixo da barra, não sobreposto (senão desenhar perto do topo fica bloqueado)");
  process.exitCode = 1;
}

console.log("4) Ana (líder) desenha um traço real...");
await page.mouse.move(canvasBox.x + 100, canvasBox.y + 150);
await page.mouse.down();
await page.mouse.move(canvasBox.x + 300, canvasBox.y + 250, { steps: 10 });
await page.mouse.up();
await page.waitForFunction((code) => Object.keys(window.__testDb.get(`rooms/${code}`).hangman.doodle.points || {}).length > 0, code, { timeout: 3000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   pontos transmitidos: ${Object.keys(room.hangman.doodle.points || {}).length}`);
if (Object.keys(room.hangman.doodle.points || {}).length === 0) { console.log("   FALHOU"); process.exitCode = 1; }
const firstPoint = Object.values(room.hangman.doodle.points)[0];
console.log(`   primeiro ponto: ${JSON.stringify(firstPoint)} (newStroke true, sem 'uid' — só o líder desenha, não precisa de cor por jogador)`);
if (firstPoint.newStroke !== true || "uid" in firstPoint) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) Simular p2 (NÃO é líder) a tentar desenhar — não deve ter qualquer efeito...");
const pointsBefore = Object.keys(room.hangman.doodle.points || {}).length;
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}`, { state: "hangman" }); // no-op, só para garantir estado
});
// Simula diretamente a chamada que o cliente da p2 faria (guardada no servidor por confiança,
// mas a função em si já recusa quem não é líder).
await page.evaluate(async ({ code }) => {
  const roomModule = await import("./js/room.js");
  const room = window.__testDb.get(`rooms/${code}`);
  await roomModule.pushHangmanDoodlePoints(code, room, "p2", [{ x: 0.1, y: 0.1, newStroke: true }]);
}, { code });
await page.waitForTimeout(200);
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   pontos depois da tentativa de p2: ${Object.keys(room.hangman.doodle.points || {}).length} (esperado continuar ${pointsBefore}, sem mudança)`);
if (Object.keys(room.hangman.doodle.points || {}).length !== pointsBefore) {
  console.log("   FALHOU: alguém que não é líder conseguiu escrever no quadro");
  process.exitCode = 1;
}

console.log("6) Confirmar que o botão de limpar só aparece para o líder, e que funciona...");
const clearVisibleForLeader = await page.locator("#hangman-doodle-clear-btn").isVisible();
console.log(`   botão 'Limpar' visível para Ana (líder): ${clearVisibleForLeader}`);
if (!clearVisibleForLeader) { console.log("   FALHOU"); process.exitCode = 1; }
await page.click("#hangman-doodle-clear-btn");
await page.waitForFunction((code) => Object.keys(window.__testDb.get(`rooms/${code}`).hangman.doodle.points || {}).length === 0, code, { timeout: 3000 });
console.log("   OK: quadro limpo");

console.log("7) Continuar (fim da fila de bónus, só 1 jogo) -> deve ir para ecrã final, sem alterar pontuações...");
const scoresBefore = await page.evaluate((code) => {
  const r = window.__testDb.get(`rooms/${code}`);
  return Object.fromEntries(Object.entries(r.players).map(([k, v]) => [k, v.score]));
}, code);
await page.click("#hangman-continue-btn");
await page.waitForSelector('[data-screen="final"].active', { timeout: 5000 });
const scoresAfter = await page.evaluate((code) => {
  const r = window.__testDb.get(`rooms/${code}`);
  return Object.fromEntries(Object.entries(r.players).map(([k, v]) => [k, v.score]));
}, code);
console.log(`   pontos antes: ${JSON.stringify(scoresBefore)}, depois: ${JSON.stringify(scoresAfter)} (esperado iguais — sem pontuação própria)`);
if (JSON.stringify(scoresBefore) !== JSON.stringify(scoresAfter)) {
  console.log("   FALHOU: a Forca não devia atribuir pontos");
  process.exitCode = 1;
}
console.log("   OK: chegou ao ecrã final sem mudar pontuações");

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
