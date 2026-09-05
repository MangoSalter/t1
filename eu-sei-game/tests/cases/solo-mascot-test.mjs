// As mascotes têm de aparecer antes de CADA mini-jogo, com uma fala sobre
// esse jogo (não uma frase genérica), e também no fim a jogar avulso.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

console.log("1) Todos os mini-jogos do menu têm falas próprias definidas...");
const { keys, intros } = await page.evaluate(async () => {
  const d = await import("./js/data.js");
  return { keys: Object.keys(d.MASCOT_INTROS), intros: d.MASCOT_INTROS };
});
const menuKeys = ["reflex", "word", "bug", "monkey", "memory", "hangman", "map", "pacman", "golf", "cards", "car", "landmark"];
const missing = menuKeys.filter((k) => !keys.includes(k));
console.log(`   jogos com falas: ${keys.length}; em falta: ${JSON.stringify(missing)}`);
if (missing.length > 0) { console.log("   FALHOU"); process.exitCode = 1; }
const thin = keys.filter((k) => intros[k].length < 2);
if (thin.length > 0) { console.log(`   FALHOU: só uma fala em ${thin} — repetia-se sempre`); process.exitCode = 1; }
const bothMascots = keys.filter((k) => new Set(intros[k].map((i) => i.who)).size < 2);
console.log(`   jogos onde só fala uma das mascotes: ${JSON.stringify(bothMascots)} (esperado nenhum)`);
if (bothMascots.length > 0) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("2) A fala aparece no ecrã 'pronto?' e é a do jogo escolhido...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-pac-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 });
const mascotVisible = await page.locator("#ready-mascot").isVisible();
const mascotText = await page.locator("#ready-mascot").textContent();
console.log(`   visível: ${mascotVisible} — "${mascotText}"`);
if (!mascotVisible) { console.log("   FALHOU"); process.exitCode = 1; }
const pacTexts = intros.pacman.map((i) => `${i.who}: “${i.text}”`);
if (!pacTexts.includes(mascotText)) { console.log("   FALHOU: a fala não é a do Kota Corre!"); process.exitCode = 1; }

console.log("3) Outro jogo -> outra fala (não é a mesma frase para tudo)...");
await page.click("#ready-start-btn");
await page.waitForTimeout(300);
await page.click("#game-hud-exit-btn").catch(() => {});
await page.waitForTimeout(300);
let onMenu = await page.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
if (onMenu !== "solo-menu") { await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" }); await page.click("#solo-menu-btn"); }
await page.click("#solo-play-memory-btn");
await page.waitForSelector('[data-screen="solo-memory-setup"].active', { timeout: 5000 });
await page.click("#memory-setup-start-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 });
const memText = await page.locator("#ready-mascot").textContent();
console.log(`   Memória: "${memText}"`);
const memTexts = intros.memory.map((i) => `${i.who}: “${i.text}”`);
if (!memTexts.includes(memText)) { console.log("   FALHOU: a fala não é a da Memória"); process.exitCode = 1; }
if (memText === mascotText) { console.log("   FALHOU: é a mesma frase dos dois jogos"); process.exitCode = 1; }

console.log("4) A jogar AVULSO (fora da maratona), o fim também tem fala — antes era mudo...");
await page.click("#ready-start-btn");
await page.waitForTimeout(400);
await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 8000 });
const endQuipVisible = await page.locator("#mge-quip").isVisible();
const endQuip = await page.locator("#mge-quip").textContent();
console.log(`   visível: ${endQuipVisible} — "${endQuip}"`);
if (!endQuipVisible || endQuip.trim().length === 0) { console.log("   FALHOU"); process.exitCode = 1; }

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
