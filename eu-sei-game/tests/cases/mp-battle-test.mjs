import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala com Ana (host) e 2 bots, forcar so 'battle' como bonus...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 15000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
console.log(`   sala ${code}, hostId=${hostId}`);
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
  window.__testDb.update(`rooms/${code}/config`, { bonusGames: ["battle"] });
}, code);
const numRounds = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).config.numRounds, code);
await page.evaluate(({ code, numRounds }) => {
  window.__testDb.update(`rooms/${code}`, { round: numRounds, state: "roundScore" });
}, { code, numRounds });
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 3000 });
await page.click("#round-next-btn");
await page.waitForSelector('[data-screen="battle"].active', { timeout: 3000 });
console.log("   OK: entrou no ecrã do Labirinto: Batalha");

console.log("2) Confirmar arena/paredes/3 jogadores renderizados, todos com 3 vidas...");
await page.waitForTimeout(400);
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   arena: ${room.battle.arenaW}x${room.battle.arenaH}, vidas: ${JSON.stringify(room.battle.lives)}`);
const playerElCount = await page.locator(".battle-player").count();
console.log(`   elementos .battle-player: ${playerElCount} (esperado 3)`);
if (playerElCount !== 3) { console.log("   FALHOU"); process.exitCode = 1; }
const wallElCount = await page.locator(".battle-wall").count();
console.log(`   elementos .battle-wall: ${wallElCount}`);
if (wallElCount < 1) { console.log("   FALHOU: sem paredes renderizadas"); process.exitCode = 1; }
if (Object.values(room.battle.lives).some((v) => v !== 3)) { console.log("   FALHOU: nem todos começam com 3 vidas"); process.exitCode = 1; }

console.log("3) Mover a Ana com a seta direita e confirmar que a posição muda e é transmitida...");
const startPos = await page.evaluate(() => {
  const el = document.querySelector(".battle-player.battle-player-me");
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
});
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(500);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(200);
const movedPos = await page.evaluate(() => {
  const el = document.querySelector(".battle-player.battle-player-me");
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
});
console.log(`   posição: ${JSON.stringify(startPos)} -> ${JSON.stringify(movedPos)}`);
if (!(movedPos.left > startPos.left)) { console.log("   FALHOU: Ana não se moveu para a direita"); process.exitCode = 1; }
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const broadcastX = room.battle.positions[hostId].x;
console.log(`   posição transmitida para o Firebase: x=${broadcastX}`);
// Tolerância generosa: a transmissão é limitada a cada ~120ms, por isso o
// último valor puxado do Firebase pode ficar um pouco atrás da posição
// exata do ecrã no instante em que este teste a lê (mesmo com a Ana já
// parada, a desaceleração por atrito continua a mexer a posição real por
// mais alguns frames depois do último broadcast).
if (Math.abs(broadcastX - movedPos.left) > 20) { console.log("   FALHOU: posição transmitida não bate certo com o ecrã"); process.exitCode = 1; }

console.log("4) Colocar uma arma exatamente na posição da Ana e confirmar apanha automática (cliente real)...");
await page.evaluate(({ code, movedPos }) => {
  window.__testDb.update(`rooms/${code}/battle/weapons`, { testweapon: { x: movedPos.left, y: movedPos.top } });
}, { code, movedPos });
await page.waitForFunction((code) => {
  const r = window.__testDb.get(`rooms/${code}`);
  return r.battle.weapons.testweapon === undefined;
}, code, { timeout: 3000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const armedUntil = room.battle.armed?.[hostId] || 0;
console.log(`   OK: arma apanhada. armado até: ${armedUntil} (agora: ${Date.now()})`);
if (armedUntil <= Date.now()) { console.log("   FALHOU: Ana devia estar armada"); process.exitCode = 1; }

console.log("5) Colocar p2 mesmo ao lado da Ana e atacar com Espaço (deteção real do cliente)...");
await page.evaluate(({ code, movedPos }) => {
  window.__testDb.update(`rooms/${code}/battle/positions/p2`, { x: movedPos.left + 10, y: movedPos.top, updatedAt: Date.now() });
}, { code, movedPos });
await page.waitForTimeout(150);
await page.keyboard.press("Space");
await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).battle.lives.p2 === 2, code, { timeout: 15000 });
console.log("   OK: p2 perdeu 1 vida (3 -> 2) por ataque real via Espaço");

console.log("6) Terminar p2 usando a função real do servidor duas vezes (respeitando a transação de vidas)...");
await page.evaluate(async ({ code, hostId }) => {
  const roomModule = await import("./js/room.js");
  const room = window.__testDb.get(`rooms/${code}`);
  await roomModule.claimBattleHit(code, room, hostId, "p2");
}, { code, hostId });
await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).battle.lives.p2 === 1, code, { timeout: 15000 });
await page.evaluate(async ({ code, hostId }) => {
  const roomModule = await import("./js/room.js");
  const room = window.__testDb.get(`rooms/${code}`);
  await roomModule.claimBattleHit(code, room, hostId, "p2");
}, { code, hostId });
await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).battle.eliminated?.p2 === true, code, { timeout: 15000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   OK: p2 eliminado. vidas: ${room.battle.lives.p2}, abates da Ana: ${room.battle.kills?.[hostId]}`);
// Só o golpe que ZERA as vidas conta como abate (3->2 via Espaço, 2->1 e
// 1->0 via claimBattleHit) — 1 abate no total, não 1 por golpe.
if (room.battle.kills?.[hostId] !== 1) { console.log("   FALHOU: Ana devia ter exatamente 1 abate (só o golpe final conta)"); process.exitCode = 1; }

console.log("7) Um jogador eliminado não pode ser atacado de novo (já sem vidas)...");
await page.evaluate(async ({ code, hostId }) => {
  const roomModule = await import("./js/room.js");
  const room = window.__testDb.get(`rooms/${code}`);
  await roomModule.claimBattleHit(code, room, hostId, "p2");
}, { code, hostId });
await page.waitForTimeout(150);
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   vidas de p2 depois de mais um ataque: ${room.battle.lives.p2} (esperado continuar 0)`);
if (room.battle.lives.p2 !== 0) { console.log("   FALHOU: um jogador eliminado não devia poder perder mais vidas"); process.exitCode = 1; }

console.log("8) Eliminar também a p3 (só resta a Ana) e confirmar que o host resolve a ronda sozinho, SEM forçar o tempo (condição de \"só resta 1 vivo\")...");
for (let i = 0; i < 3; i++) {
  await page.evaluate(async ({ code, hostId }) => {
    const roomModule = await import("./js/room.js");
    const room = window.__testDb.get(`rooms/${code}`);
    await roomModule.claimBattleHit(code, room, hostId, "p3");
  }, { code, hostId });
}
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   p3 vidas: ${room.battle.lives.p3}, eliminada: ${room.battle.eliminated?.p3}`);
await page.waitForFunction((code) => window.__testDb.get(`rooms/${code}`).battle.resolved === true, code, { timeout: 15000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   resolvido automaticamente pelo host (sem forçar endAt). alive: ${JSON.stringify(room.battle.alive)}, roundPoints: ${JSON.stringify(room.battle.roundPoints)}`);
if (room.battle.alive[hostId] !== true || room.battle.alive.p2 !== false || room.battle.alive.p3 !== false) {
  console.log("   FALHOU: estado de sobrevivência inesperado");
  process.exitCode = 1;
}
await page.waitForSelector('[data-screen="battle"].active [id="battle-results"]:not(.hidden)', { timeout: 3000 });
console.log("   OK: resultados visíveis");

console.log("9) Continuar (fim da fila de bonus, só 1 jogo) -> deve ir para ecrã final...");
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/battle`, { resolvedAt: Date.now() - 10000 });
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
