import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala com Ana (host) e 2 bots, forcar so 'tag' como bonus...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 15000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 15000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
console.log(`   sala ${code}, hostId=${hostId}`);
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
  window.__testDb.update(`rooms/${code}/config`, { bonusGames: ["tag"] });
}, code);
const numRounds = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).config.numRounds, code);
await page.evaluate(({ code, numRounds }) => {
  window.__testDb.update(`rooms/${code}`, { round: numRounds, state: "roundScore" });
}, { code, numRounds });
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 15000 });
await page.click("#round-next-btn");
await page.waitForSelector('[data-screen="tag"].active', { timeout: 15000 });
console.log("   OK: entrou no ecrã da Fuga da Infeção");

console.log("2) Confirmar arena/posições/3 jogadores renderizados...");
await page.waitForTimeout(400);
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   arena: ${room.tag.arenaW}x${room.tag.arenaH}, infetado inicial: ${Object.keys(room.tag.infected)[0]}`);
const playerElCount = await page.locator(".tag-player").count();
console.log(`   elementos .tag-player: ${playerElCount} (esperado 3)`);
if (playerElCount !== 3) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Forçar Ana a estar infetada (via a função real, para testar a deteção de contacto)...");
await page.evaluate(async ({ code, hostId }) => {
  const roomModule = await import("./js/room.js");
  await roomModule.claimTagInfection(code, hostId);
}, { code, hostId });
await page.waitForTimeout(200);
const anaPos = await page.evaluate(() => {
  const el = document.querySelector(".tag-player.tag-player-me");
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
});
console.log(`   posição atual da Ana: ${JSON.stringify(anaPos)}`);

console.log("4) Colocar p2 mesmo ao lado da Ana e confirmar que é infetado automaticamente...");
await page.evaluate(({ code, anaPos }) => {
  window.__testDb.update(`rooms/${code}/tag/positions/p2`, { x: anaPos.left + 5, y: anaPos.top + 5, updatedAt: Date.now() });
}, { code, anaPos });
await page.waitForFunction((code) => {
  const r = window.__testDb.get(`rooms/${code}`);
  return r.tag.infected.p2 === true;
}, code, { timeout: 15000 });
console.log("   OK: p2 foi infetado por contacto");

console.log("5) Testar apanha de power-up: Ana deixa de estar infetada (reset de teste) e um power-up aparece na posição dela...");
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/tag`, { infected: { p2: true } }); // so p2 infetado agora
}, code);
await page.waitForTimeout(150);
const anaPos2 = await page.evaluate(() => {
  const el = document.querySelector(".tag-player.tag-player-me");
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
});
await page.evaluate(({ code, anaPos2 }) => {
  window.__testDb.update(`rooms/${code}/tag/powerups`, { testpower: { type: "shield", x: anaPos2.left, y: anaPos2.top } });
}, { code, anaPos2 });
await page.waitForFunction((code) => {
  const r = window.__testDb.get(`rooms/${code}`);
  return r.tag.powerups.testpower === undefined;
}, code, { timeout: 15000 });
console.log("   OK: power-up foi apanhado (removido)");
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const anaShielded = (room.tag.effects?.[hostId]?.shieldUntil || 0) > Date.now();
console.log(`   Ana tem escudo ativo: ${anaShielded} (esperado true)`);
if (!anaShielded) { console.log("   FALHOU: efeito de escudo não foi aplicado"); process.exitCode = 1; }

console.log("6) Forçar fim da ronda (endAt no passado) e confirmar resolução + pontos...");
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/tag`, { endAt: Date.now() - 1000 });
}, code);
await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).tag.resolved === true, code, { timeout: 15000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   resolvido. survived: ${JSON.stringify(room.tag.survived)}, roundPoints: ${JSON.stringify(room.tag.roundPoints)}`);
if (room.tag.survived[hostId] !== false || room.tag.survived.p3 !== true) {
  console.log("   FALHOU: estado de sobrevivência inesperado (Ana devia estar infetada=false sobrevivente, p3 devia ter sobrevivido)");
  process.exitCode = 1;
}
await page.waitForSelector('[data-screen="tag"].active [id="tag-results"]:not(.hidden)', { timeout: 15000 });
console.log("   OK: resultados visíveis");

console.log("7) Continuar (fim da fila de bonus, so 1 jogo) -> deve ir para ecra final...");
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/tag`, { resolvedAt: Date.now() - 10000 });
}, code);
await page.waitForSelector('[data-screen="final"].active', { timeout: 5000 });
console.log("   OK: chegou ao ecrã final");
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   scores finais: ${JSON.stringify(Object.fromEntries(Object.entries(room.players).map(([k, v]) => [k, v.score])))}`);

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
