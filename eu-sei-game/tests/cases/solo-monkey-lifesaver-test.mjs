import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Abrir Cada Macaco no Seu Galho...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-monkey-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-monkey"].active', { timeout: 3000 });

console.log("2) Clicar no chão coloca uma boia...");
const arena = page.locator("#monkey-arena");
await arena.click({ position: { x: 60, y: 150 } });
await page.waitForTimeout(100);
let lifesaverCount = await page.locator(".monkey-lifesaver").count();
console.log(`   boias na arena: ${lifesaverCount} (esperado 1)`);
if (lifesaverCount !== 1) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Clicar logo a seguir (dentro do cooldown) não coloca outra...");
await arena.click({ position: { x: 200, y: 150 } });
await page.waitForTimeout(100);
lifesaverCount = await page.locator(".monkey-lifesaver").count();
console.log(`   boias na arena: ${lifesaverCount} (esperado continuar 1, cooldown ativo)`);
if (lifesaverCount !== 1) { console.log("   FALHOU: cooldown não foi respeitado"); process.exitCode = 1; }

console.log("4) Esperar o cooldown passar e colocar a 2ª boia (limite máximo)...");
await page.waitForTimeout(2200);
await arena.click({ position: { x: 200, y: 150 } });
await page.waitForTimeout(100);
lifesaverCount = await page.locator(".monkey-lifesaver").count();
console.log(`   boias na arena: ${lifesaverCount} (esperado 2)`);
if (lifesaverCount !== 2) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) Tentar colocar uma 3ª (acima do máximo de 2 ativas) não deve funcionar...");
await page.waitForTimeout(300);
await arena.click({ position: { x: 100, y: 150 } });
await page.waitForTimeout(100);
lifesaverCount = await page.locator(".monkey-lifesaver").count();
console.log(`   boias na arena: ${lifesaverCount} (esperado continuar 2, máximo ativo)`);
if (lifesaverCount > 2) { console.log("   FALHOU: excedeu o máximo de boias ativas"); process.exitCode = 1; }

console.log("6) Esperar as boias expirarem sozinhas (mas antes do jogo acabar aos 10s)...");
await page.waitForTimeout(5200);
lifesaverCount = await page.locator(".monkey-lifesaver").count();
const stillPlaying = await page.locator('[data-screen="solo-minigame-monkey"].active').count();
console.log(`   boias na arena depois de expirarem: ${lifesaverCount} (esperado 0), jogo ainda ativo: ${stillPlaying > 0}`);
if (lifesaverCount !== 0) { console.log("   FALHOU: boias não expiraram"); process.exitCode = 1; }
if (stillPlaying === 0) { console.log("   AVISO: jogo já tinha terminado sozinho (timing apertado) — ajustar tempos se repetir"); }

console.log("7) Confirmar que o jogo continua normal até ao fim (HUD, skip, ecrã de fim)...");
const overlayAlreadyShown = await page.evaluate(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"));
if (!overlayAlreadyShown) await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 6000 });
const mgeTitle = await page.locator("#mge-title").textContent();
console.log(`   OK: "${mgeTitle}"`);
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: voltou ao menu");

console.log("8) Testar pausa a meio do jogo com boias colocadas (não deve rebentar)...");
await page.click("#solo-play-monkey-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-monkey"].active', { timeout: 3000 });
await arena.click({ position: { x: 60, y: 150 } });
await page.click("#game-hud-pause-btn");
await page.waitForFunction(() => !document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
await page.waitForTimeout(500);
await page.click("#pause-resume-btn");
await page.waitForFunction(() => document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: pausa/retoma com boia ativa não causou erro");

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
