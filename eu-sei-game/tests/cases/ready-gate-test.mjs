import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Abrir Mata o Inseto e confirmar que aparece o ecra 'pronto?' antes do jogo...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-bug-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 3000 });
const readyTitle = await page.locator("#ready-title").textContent();
console.log(`   titulo: "${readyTitle}" (esperado Mata o Inseto)`);
if (!readyTitle.includes("Mata o Inseto")) { console.log("   FALHOU"); process.exitCode = 1; }
const bugScreenActive = await page.locator('[data-screen="solo-minigame-bug"]').evaluate(el => el.classList.contains("active"));
console.log(`   ecra do jogo ja ativo antes de clicar Comecar: ${bugScreenActive} (esperado false)`);
if (bugScreenActive) { console.log("   FALHOU: o jogo nao devia comecar antes do clique"); process.exitCode = 1; }

console.log("2) Clicar Comecar e confirmar que o jogo arranca...");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-bug"].active', { timeout: 3000 });
const overlayHidden = await page.locator("#ready-overlay").evaluate(el => el.classList.contains("hidden"));
console.log(`   overlay escondido depois: ${overlayHidden} (esperado true)`);
if (!overlayHidden) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Saltar o jogo (HUD) e confirmar ecra de fim, depois Continuar deve mostrar o ecra 'pronto?' outra vez...");
await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
await page.click("#mge-continue-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 3000 });
console.log("   OK: ecra 'pronto?' reapareceu no Continuar");

console.log("4) Testar a maratona: escolher 2 jogos e confirmar 'pronto?' antes de cada um...");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-bug"].active', { timeout: 3000 });
await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });

await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.click("#solo-marathon-start-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 3000 });
console.log("   OK: 'pronto?' antes do 1o jogo da maratona");
await page.click("#ready-start-btn");
await page.waitForTimeout(300);
const activeAfterStart = await page.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
console.log(`   ecra ativo depois de comecar: ${activeAfterStart} (deve ser um mini-jogo, nao solo-menu)`);
if (activeAfterStart === "solo-menu") { console.log("   FALHOU"); process.exitCode = 1; }

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
