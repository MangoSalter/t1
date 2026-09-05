// Mini-Golfe em equipa com dois clientes reais. O que interessa provar é o
// que o utilizador pediu: os power-ups funcionam CONTRA os outros jogadores
// — a barreira aparece no campo do outro, e o interruptor desliga-lhe mesmo
// os comandos.
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

console.log("1) Ana cria a sala, Beto entra, abrem o Mini-Golfe...");
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
await host.click('[data-mp-game="golf"]');
await host.waitForSelector('[data-screen="golf"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="golf"].active', { timeout: 5000 });
const room0 = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const anaId = room0.hostId;
const betoId = Object.keys(room0.players).find((u) => room0.players[u].name === "Beto");
console.log("   OK: ambos no campo");

console.log("2) Cada um vê as DUAS bolas (é o mesmo buraco para todos)...");
await host.waitForTimeout(600);
const ballsHost = await host.locator("#golf-mp-arena .golf-mp-ball").count();
const ballsGuest = await guest.locator("#golf-mp-arena .golf-mp-ball").count();
console.log(`   bolas no ecrã da Ana: ${ballsHost}, no do Beto: ${ballsGuest} (esperado 2/2)`);
if (ballsHost !== 2 || ballsGuest !== 2) { console.log("   FALHOU"); process.exitCode = 1; }
const myIsHighlighted = await host.locator("#golf-mp-arena .golf-mp-ball-me").count();
console.log(`   a própria bola vem destacada: ${myIsHighlighted === 1}`);
if (myIsHighlighted !== 1) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) A Ana move a bola com as setas e o Beto vê-a mexer-se...");
const before = (await guest.evaluate((c) => window.__testDb.get(`rooms/${c}`).golf.balls, code))[anaId];
await host.keyboard.down("ArrowRight");
await host.waitForTimeout(900);
await host.keyboard.up("ArrowRight");
await host.waitForTimeout(400);
const after = (await guest.evaluate((c) => window.__testDb.get(`rooms/${c}`).golf.balls, code))[anaId];
console.log(`   bola da Ana: x ${before.x} -> ${after.x} (visto pelo cliente do Beto)`);
if (!(after.x > before.x + 20)) { console.log("   FALHOU: a posição não chegou ao outro cliente"); process.exitCode = 1; }

console.log("4) POWER-UP 🧱 BARREIRA: a Ana larga uma parede e ela aparece no campo do BETO...");
await host.evaluate((c) => window.__testDb.update(`rooms/${c}/golf/charges`, { [window.__testDb.get(`rooms/${c}`).hostId]: "barrier" }), code);
await host.waitForTimeout(250);
const statusWithCharge = await host.locator("#golf-mp-status-line").textContent();
console.log(`   estado da Ana: "${statusWithCharge}"`);
if (!statusWithCharge.includes("barreira")) { console.log("   FALHOU: devia avisar que tem a carga"); process.exitCode = 1; }
await host.keyboard.press(" ");
await guest.waitForFunction(() => document.querySelectorAll("#golf-mp-arena .golf-mp-barrier").length > 0, null, { timeout: 5000 });
const barriersGuest = await guest.locator("#golf-mp-arena .golf-mp-barrier").count();
console.log(`   barreiras visíveis no ecrã do Beto: ${barriersGuest} (esperado 1)`);
if (barriersGuest !== 1) { console.log("   FALHOU"); process.exitCode = 1; }
const roomB = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const barrier = Object.values(roomB.golf.barriers)[0];
console.log(`   barreira em (${barrier.x},${barrier.y}) ${barrier.w}x${barrier.h}, largada por ${barrier.byId === anaId ? "Ana" : "?"}`);
if (barrier.byId !== anaId) { console.log("   FALHOU"); process.exitCode = 1; }
if (roomB.golf.charges?.[anaId]) { console.log("   FALHOU: a carga devia ser gasta"); process.exitCode = 1; }

console.log("5) A barreira BLOQUEIA mesmo: conta como parede na física de quem passa por lá...");
const blocks = await guest.evaluate(async ({ c }) => {
  const m = await import("./js/room.js");
  const g = window.__testDb.get(`rooms/${c}`).golf;
  const b = Object.values(g.barriers)[0];
  const walls = m.golfActiveWalls(g, Date.now());
  return walls.some((w) => w.x === b.x && w.y === b.y && w.w === b.w && w.h === b.h);
}, { c: code });
console.log(`   a barreira aparece nas paredes ativas do cliente do Beto: ${blocks}`);
if (!blocks) { console.log("   FALHOU: seria só decoração"); process.exitCode = 1; }

console.log("6) POWER-UP 🔌 INTERRUPTOR: o Beto usa e a ANA fica sem comandos (ele não)...");
await guest.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  const beto = Object.keys(r.players).find((u) => r.players[u].name === "Beto");
  window.__testDb.update(`rooms/${c}/golf/charges`, { [beto]: "offswitch" });
}, code);
await guest.waitForTimeout(250);
await guest.keyboard.press(" ");
await host.waitForFunction((ids) => {
  const r = window.__testDb.get(`rooms/${ids.c}`);
  return (r.golf.frozenUntil?.[ids.ana] || 0) > Date.now();
}, { c: code, ana: anaId }, { timeout: 5000 });
const roomF = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   congelados: ${JSON.stringify(Object.keys(roomF.golf.frozenUntil || {}))} (esperado só a Ana)`);
if (!roomF.golf.frozenUntil?.[anaId]) { console.log("   FALHOU: a Ana devia estar congelada"); process.exitCode = 1; }
if (roomF.golf.frozenUntil?.[betoId]) { console.log("   FALHOU: quem usa não se congela a si próprio"); process.exitCode = 1; }
await host.waitForTimeout(200);
const frozenStatus = await host.locator("#golf-mp-status-line").textContent();
console.log(`   a Ana vê: "${frozenStatus}"`);
if (!frozenStatus.includes("desligou")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("7) Congelada, a bola da Ana já não responde às setas...");
const posBefore = await host.evaluate(() => ({ x: 0 })); // marca simbólica
const xBefore = (await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).golf.balls, code))[anaId].x;
await host.keyboard.down("ArrowRight");
await host.waitForTimeout(700);
await host.keyboard.up("ArrowRight");
const xAfter = (await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).golf.balls, code))[anaId].x;
console.log(`   x da Ana enquanto congelada: ${xBefore} -> ${xAfter} (só a inércia que já trazia)`);
if (xAfter > xBefore + 60) { console.log("   FALHOU: continuou a acelerar apesar de congelada"); process.exitCode = 1; }

console.log("8) Meter a bola no buraco fecha a ronda e dá pontos por ordem de chegada...");
await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  const beto = Object.keys(r.players).find((u) => r.players[u].name === "Beto");
  window.__testDb.update(`rooms/${c}/golf`, { finished: { [r.hostId]: 8000, [beto]: 14000 } });
}, code);
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).golf?.resolved === true, code, { timeout: 8000 });
const roomEnd = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   classificação: ${JSON.stringify(roomEnd.golf.standings)}`);
console.log(`   pontos: ${JSON.stringify(roomEnd.golf.roundPoints)}`);
if (roomEnd.golf.standings[anaId].place !== 1) { console.log("   FALHOU: quem meteu primeiro devia ser 1º"); process.exitCode = 1; }
if (!(roomEnd.golf.roundPoints[anaId] > roomEnd.golf.roundPoints[betoId])) { console.log("   FALHOU"); process.exitCode = 1; }
if (!(roomEnd.players[anaId].score > 0)) { console.log("   FALHOU: pontos não somados"); process.exitCode = 1; }
await host.waitForSelector("#golf-mp-results:not(.hidden)", { timeout: 5000 });
const rows = await host.locator("#golf-mp-results .score-row").allTextContents();
console.log(`   resultados no ecrã: ${JSON.stringify(rows)}`);
if (rows.length !== 2) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("9) Continuar -> ecrã final...");
await host.click("#golf-mp-continue-btn");
await host.waitForSelector('[data-screen="final"].active', { timeout: 8000 });
await guest.waitForSelector('[data-screen="final"].active', { timeout: 8000 });
console.log("   OK");

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
