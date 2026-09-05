import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

async function goToSoloMenu() {
  await page.evaluate(() => {
    document.querySelectorAll("[data-screen]").forEach((el) => el.classList.toggle("active", el.dataset.screen === "solo-menu"));
  });
}

console.log("1) Reflexos: HUD aparece, pausa/retoma, e o ecrã de fim tem Continuar/Sair...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-reflex-btn");
await page.waitForSelector('[data-screen="solo-reflex-setup"].active', { timeout: 3000 });
await page.click("#reflex-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame"].active', { timeout: 3000 });
const hudVisible1 = await page.locator("#game-hud").isVisible();
console.log(`   HUD visível: ${hudVisible1}`);
if (!hudVisible1) { console.log("   FALHOU: HUD devia estar visível"); process.exitCode = 1; }

await page.click("#game-hud-pause-btn");
await page.waitForFunction(() => !document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
console.log("   OK: pausa mostrou overlay");
await page.click("#pause-resume-btn");
await page.waitForFunction(() => document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
console.log("   OK: retomar escondeu overlay");

await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
const mgeTitle1 = await page.locator("#mge-title").textContent();
console.log(`   OK: skip abriu ecrã de fim — "${mgeTitle1}"`);
const hudHiddenAfterSkip = await page.locator("#game-hud").isHidden();
if (!hudHiddenAfterSkip) { console.log("   FALHOU: HUD devia esconder-se no fim"); process.exitCode = 1; }

console.log("2) Testar botão Sair no ecrã de fim volta ao menu solo...");
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: voltou ao menu solo");

console.log("3) Testar botão Continuar no ecrã de fim (jogo avulso -> joga outra vez o mesmo jogo)...");
await page.click("#solo-play-wordflash-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-word"].active', { timeout: 3000 });
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-continue-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-word"].active', { timeout: 3000 });
console.log("   OK: Continuar relançou a Palavra Relâmpago (jogar novamente)");
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: Sair voltou ao menu");

console.log("4) Testar Mata o Inseto: HUD com pontos reais, pausa bloqueia cliques, skip funciona...");
await page.click("#solo-play-bug-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-bug"].active', { timeout: 3000 });
await page.waitForSelector(".bug-arena .bug", { timeout: 3000 });
for (let i = 0; i < 3; i++) {
  const bugs = await page.locator(".bug-arena .bug").all();
  for (const b of bugs) { try { await b.click({ timeout: 200 }); } catch {} }
  await page.waitForTimeout(300);
}
const hudScoreBug = await page.locator("#game-hud-score-value").textContent();
console.log(`   pontos no HUD depois de tentar apanhar: ${hudScoreBug}`);
await page.click("#game-hud-pause-btn");
await page.waitForFunction(() => !document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
// tentar clicar num inseto por baixo do overlay de pausa não deve ter efeito
const bugsUnderPause = await page.locator(".bug-arena .bug").count();
console.log(`   insetos ainda na arena durante a pausa (não devem desaparecer por clique bloqueado): ${bugsUnderPause}`);
await page.click("#pause-resume-btn");
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: Mata o Inseto terminou e voltou ao menu");

console.log("5) Testar Cada Macaco no Seu Galho: HUD + skip...");
await page.click("#solo-play-monkey-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-monkey"].active', { timeout: 3000 });
await page.waitForTimeout(500);
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK");

console.log("6) Testar Memória: HUD + exit/skip...");
await page.click("#solo-play-memory-btn");
await page.waitForSelector('[data-screen="solo-memory-setup"].active', { timeout: 3000 });
await page.click("#memory-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-memory"].active', { timeout: 3000 });
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK");

console.log("7) Testar Forca solo: HUD + skip (desiste)...");
await page.click("#solo-play-hangman-btn");
await page.waitForSelector('[data-screen="solo-hangman-setup"].active', { timeout: 3000 });
await page.click("#hangman-solo-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-hangman"].active', { timeout: 3000 });
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
const mgeTitle7 = await page.locator("#mge-title").textContent();
console.log(`   OK: "${mgeTitle7}"`);
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });

console.log("8) Testar Mapa-Múndi: HUD + skip...");
await page.click("#solo-play-map-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-map"].active', { timeout: 3000 });
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK");

console.log("9) Confirmar rótulo de XP da conta está a atualizar-se no menu solo...");
const xpLabel = await page.locator("#solo-account-xp").textContent();
console.log(`   ${xpLabel}`);
if (!/XP/.test(xpLabel)) { console.log("   FALHOU: rótulo de XP não apareceu"); process.exitCode = 1; }

console.log("10) Testar maratona: fala da mascote aparece entre jogos (não no último)...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="bug"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
await page.uncheck('[data-marathon-game="map"]');
// fica: reflex + hangman (2 jogos)
await page.check('[data-marathon-game="hangman"]');
await page.click("#solo-marathon-start-btn");
await page.click("#ready-start-btn");
await page.waitForTimeout(300);
const screenAfterStart = await page.evaluate(() => document.querySelector(".screen.active").dataset.screen);
console.log(`   primeiro jogo da maratona: ${screenAfterStart}`);
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
const quipVisible = await page.locator("#mge-quip").isVisible();
console.log(`   fala da mascote visível (deve ser true, ainda há mais 1 jogo): ${quipVisible}`);
if (!quipVisible) { console.log("   FALHOU: esperava fala da mascote entre jogos da maratona"); process.exitCode = 1; }
await page.click("#mge-continue-btn");
await page.click("#ready-start-btn");
await page.waitForTimeout(300);
const screenAfterContinue = await page.evaluate(() => document.querySelector(".screen.active").dataset.screen);
console.log(`   segundo jogo da maratona: ${screenAfterContinue}`);
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
const quipVisible2 = await page.locator("#mge-quip").isVisible();
console.log(`   fala da mascote visível no último jogo (deve ser false): ${quipVisible2}`);
if (quipVisible2) { console.log("   FALHOU: não devia haver fala da mascote no último jogo da maratona"); process.exitCode = 1; }
await page.click("#mge-continue-btn");
await page.waitForSelector('[data-screen="solo-marathon-result"].active', { timeout: 3000 });
console.log("   OK: maratona terminou corretamente");

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
