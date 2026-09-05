// Com 8 jogos bónus, o risco passou a ser de integração: o menu tem de os
// mostrar todos e a fila tem de conseguir percorrê-los sem encravar.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1000, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled);
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active');
const code = (await page.locator("#lobby-code").textContent()).trim();

console.log("1) O menu da sala mostra os 8 jogos, e a lista de definições também...");
const menu = await page.locator("[data-mp-game]").allTextContents();
const cfg = await page.locator("[data-bonus-game]").evaluateAll((els) => els.map((e) => e.dataset.bonusGame));
console.log(`   menu: ${JSON.stringify(menu)}`);
console.log(`   definições: ${JSON.stringify(cfg)}`);
const keys = await page.evaluate(async () => (await import("./js/room.js")).BONUS_GAME_KEYS);
console.log(`   BONUS_GAME_KEYS: ${JSON.stringify(keys)}`);
if (menu.length !== keys.length) { console.log("   FALHOU: o menu não cobre todos os jogos bónus"); process.exitCode = 1; }
if (cfg.length !== keys.length) { console.log("   FALHOU: as definições não cobrem todos os jogos bónus"); process.exitCode = 1; }
const missing = keys.filter((k) => !cfg.includes(k));
if (missing.length) { console.log(`   FALHOU: em falta nas definições: ${missing}`); process.exitCode = 1; }

console.log("2) Nenhum botão do menu fica cortado nem fora do cartão...");
const overflow = await page.evaluate(() => {
  const grid = document.querySelector("[data-mp-game]")?.closest(".solo-menu-grid");
  if (!grid) return "sem grelha";
  const gb = grid.getBoundingClientRect();
  const bad = Array.from(grid.querySelectorAll("[data-mp-game]")).filter((btn) => {
    const r = btn.getBoundingClientRect();
    return r.right > gb.right + 1 || r.left < gb.left - 1 || r.width < 40;
  }).map((b) => b.textContent);
  return bad;
});
console.log(`   botões com problema de espaço: ${JSON.stringify(overflow)}`);
if (Array.isArray(overflow) && overflow.length > 0) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Com 4 jogadores, todos os jogos ficam ativos (nenhum mínimo por cumprir)...");
await page.evaluate((c) => window.__testDb.update(`rooms/${c}/players`, {
  p2: { name: "Beto", score: 0, connected: true },
  p3: { name: "Carla", score: 0, connected: true },
  p4: { name: "Dinis", score: 0, connected: true },
}), code);
await page.waitForTimeout(300);
const disabled = await page.locator("[data-mp-game]").evaluateAll((els) => els.filter((e) => e.disabled).map((e) => e.dataset.mpGame));
console.log(`   desativados: ${JSON.stringify(disabled)} (esperado nenhum)`);
if (disabled.length > 0) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("4) A fila percorre TODOS os 8 jogos sem encravar, e acaba no ecrã final...");
await page.evaluate(({ c, keys }) => {
  window.__testDb.update(`rooms/${c}/config`, { bonusGames: keys });
  const r = window.__testDb.get(`rooms/${c}`);
  window.__testDb.update(`rooms/${c}`, { round: r.config.numRounds, state: "roundScore" });
}, { c: code, keys });
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 5000 });
await page.click("#round-next-btn");

const seen = [];
for (let step = 0; step < keys.length + 2; step++) {
  await page.waitForTimeout(400);
  const screen = await page.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
  if (screen === "final") break;
  if (screen && !seen.includes(screen)) seen.push(screen);
  // Avança este jogo pelo caminho mais curto disponível.
  await page.evaluate(async (c) => {
    const m = await import("./js/room.js");
    const r = window.__testDb.get(`rooms/${c}`);
    await m.startNextBonusGame(c, r);
  }, code);
}
await page.waitForSelector('[data-screen="final"].active', { timeout: 10000 });
console.log(`   ecrãs visitados: ${JSON.stringify(seen)}`);
console.log(`   ${seen.length} de ${keys.length} jogos vistos, e chegou ao final`);
if (seen.length < keys.length) { console.log("   FALHOU: a fila não passou por todos"); process.exitCode = 1; }

await b.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
