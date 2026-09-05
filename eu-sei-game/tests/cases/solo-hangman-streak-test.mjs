import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

async function clickThroughMinigameEnd(timeout = 5000) {
  await page.waitForFunction(
    () => !document.getElementById("minigame-end-overlay").classList.contains("hidden"),
    { timeout }
  );
}

console.log("1) Ir a Forca -> ecrã de preparação, desligar todas as categorias menos 'Frutas', ativar modo desafio...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-hangman-btn");
await page.waitForSelector('[data-screen="solo-hangman-setup"].active', { timeout: 3000 });
await page.click("#hangman-cat-clear");
const countAfterClear = await page.locator("#hangman-cat-count").textContent();
console.log(`   categorias depois de 'Limpar': ${countAfterClear} (esperado 1)`);
if (countAfterClear !== "1") { console.log("   FALHOU"); process.exitCode = 1; }
await page.check('[data-hangman-cat="Frutas"]');
await page.uncheck('[data-hangman-cat="Países"]');
await page.uncheck("#hangman-include-own"); // força a usar sempre o banco de palavras (mais previsível para testar)
await page.check("#hangman-challenge-mode");
await page.click("#hangman-solo-setup-start-btn");
// Portão "pronto?" introduzido depois de este teste ter sido escrito.
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 3000 });
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-hangman"].active', { timeout: 3000 });

const cat1 = await page.locator("#solo-hangman-category").textContent();
console.log(`   Categoria da 1ª palavra: ${cat1} (esperado só Frutas, já que só essa está ativa)`);
if (!cat1.includes("Frutas")) { console.log("   FALHOU: devia ter escolhido só da categoria Frutas"); process.exitCode = 1; }
const livesText1 = await page.locator("#solo-hangman-lives").textContent();
console.log(`   ${livesText1} (esperado /4, modo desafio)`);
if (!livesText1.includes("/ 4")) { console.log("   FALHOU: modo desafio devia ter 4 erros permitidos"); process.exitCode = 1; }

console.log("2) Ganhar a palavra (lida via hook de depuração temporário) e confirmar sequência sobe...");
const word1 = await page.evaluate(() => window.__solo.hangmanWord);
console.log(`   palavra secreta (debug): ${word1}`);
for (const letter of new Set(word1)) {
  await page.fill("#solo-hangman-letter-input", letter);
  await page.click("#solo-hangman-guess-letter-btn");
}
await clickThroughMinigameEnd();
const mgePoints1 = await page.locator("#mge-points").textContent();
console.log(`   ${mgePoints1}`);
if (!mgePoints1.includes("Sequência: 1")) { console.log("   FALHOU: esperava sequência 1 após ganhar"); process.exitCode = 1; }

console.log("3) Clicar Continuar -> deve ir logo para a palavra seguinte (sem passar pelo ecrã de preparação)...");
await page.click("#mge-continue-btn");
await page.waitForSelector('[data-screen="solo-hangman"].active', { timeout: 3000 });
const streakInfo = await page.locator("#solo-hangman-streak-info").textContent();
console.log(`   ${streakInfo} (esperado sequência: 1)`);
if (!streakInfo.includes("1 palavra")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("4) Perder de propósito (4 erros, modo desafio) e confirmar fim da sequência...");
const wrongLetters = ["Q", "X", "Z", "W", "K", "J"];
let wrongUsed = 0;
for (const l of wrongLetters) {
  const word2 = await page.evaluate(() => window.__solo.hangmanWord);
  if (word2.includes(l)) continue; // evita acertar sem querer
  await page.fill("#solo-hangman-letter-input", l);
  await page.click("#solo-hangman-guess-letter-btn");
  wrongUsed++;
  const overlayShown = await page.evaluate(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"));
  if (overlayShown) break;
}
await clickThroughMinigameEnd();
const mgePoints2 = await page.locator("#mge-points").textContent();
console.log(`   ${mgePoints2}`);
if (!mgePoints2.includes("sequência acabou")) { console.log("   FALHOU: esperava mensagem de fim de sequência"); process.exitCode = 1; }

console.log("5) Continuar depois de perder deve recomeçar sequência do zero...");
await page.click("#mge-continue-btn");
await page.waitForSelector('[data-screen="solo-hangman"].active', { timeout: 3000 });
const streakInfoRestart = await page.locator("#solo-hangman-streak-info").textContent();
console.log(`   ${streakInfoRestart} (esperado sequência: 0)`);
if (!streakInfoRestart.includes("0 palavra")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Sair para o menu a partir do HUD (skip) confirma que volta tudo ao normal...");
await page.click("#game-hud-skip-btn");
await clickThroughMinigameEnd();
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK");

console.log("7) Confirmar que a Forca dentro da maratona continua a ser de palavra única (sem sequência)...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="reflex"]');
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="bug"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
await page.uncheck('[data-marathon-game="map"]');
await page.check('[data-marathon-game="hangman"]');
await page.click("#solo-marathon-start-btn");
await page.waitForSelector('[data-screen="solo-hangman"].active', { timeout: 3000 });
const streakInfoMarathon = await page.locator("#solo-hangman-streak-info").textContent();
console.log(`   texto de sequência dentro da maratona: "${streakInfoMarathon}" (esperado vazio)`);
if (streakInfoMarathon.trim() !== "") { console.log("   FALHOU: maratona não devia mostrar sequência"); process.exitCode = 1; }
await page.click("#game-hud-skip-btn");
await clickThroughMinigameEnd();
const mgePoints3 = await page.locator("#mge-points").textContent();
console.log(`   ${mgePoints3} (não deve mencionar 'sequência acabou')`);
if (mgePoints3.includes("sequência")) { console.log("   FALHOU: maratona não devia falar de sequência"); process.exitCode = 1; }
await page.click("#mge-continue-btn");
await page.waitForSelector('[data-screen="solo-marathon-result"].active', { timeout: 3000 });
console.log("   OK: maratona terminou normalmente");

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
