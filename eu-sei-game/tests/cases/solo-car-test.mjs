import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Abrir Estrada Maluca avulso...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-car-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-cargame"].active', { timeout: 3000 });
console.log("   OK: no ecrã do jogo");

console.log("2) Testar pausa logo no início (sem risco de colisão ainda): pontuação não deve mudar...");
await page.click("#game-hud-pause-btn");
await page.waitForSelector("#pause-overlay:not(.hidden)", { timeout: 2000 });
const scoreAtPause = parseFloat(await page.locator("#game-hud-score-value").textContent());
await page.waitForTimeout(600);
const scoreStillPaused = parseFloat(await page.locator("#game-hud-score-value").textContent());
console.log(`   pontuação ao pausar: ${scoreAtPause}, 600ms depois (ainda pausado): ${scoreStillPaused}`);
if (scoreAtPause !== scoreStillPaused) { console.log("   FALHOU: pontuação mudou em pausa"); process.exitCode = 1; }
await page.click("#pause-resume-btn");

console.log("3) Confirmar mudança de faixa com as setas...");
const leftBefore = await page.evaluate(() => document.querySelector(".car-player").style.left);
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(200);
const leftAfterLeft = await page.evaluate(() => document.querySelector(".car-player").style.left);
console.log(`   antes: ${leftBefore}, depois de ArrowLeft: ${leftAfterLeft}`);
if (leftAfterLeft === leftBefore) { console.log("   FALHOU: não mudou de faixa"); process.exitCode = 1; }
await page.keyboard.press("ArrowLeft"); // já na faixa 0, não deve sair dos limites
await page.waitForTimeout(150);
const leftAtEdge = await page.evaluate(() => document.querySelector(".car-player").style.left);
if (leftAtEdge !== leftAfterLeft) { console.log("   FALHOU: saiu dos limites da estrada"); process.exitCode = 1; }
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(200);
const leftAfterRight = await page.evaluate(() => document.querySelector(".car-player").style.left);
console.log(`   depois de 2x ArrowRight: ${leftAfterRight} (deve ter mudado)`);
if (leftAfterRight === leftAtEdge) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("4) Confirmar que a pontuação sobe e obstáculos aparecem com o tempo (se o jogo ainda estiver ativo)...");
const stillActive = await page.locator('[data-screen="solo-cargame"].active').count();
if (stillActive > 0) {
  await page.waitForTimeout(1000);
  const stillActive2 = await page.locator('[data-screen="solo-cargame"].active').count();
  if (stillActive2 > 0) {
    const score1 = parseFloat(await page.locator("#game-hud-score-value").textContent());
    const obstacleCount = await page.locator(".car-obstacle").count();
    console.log(`   pontuação: ${score1}, obstáculos: ${obstacleCount}`);
    if (score1 <= 0) { console.log("   FALHOU: pontuação não subiu"); process.exitCode = 1; }
    if (obstacleCount === 0) { console.log("   FALHOU: nenhum obstáculo apareceu"); process.exitCode = 1; }
  } else {
    console.log("   (colidiu entretanto — sorte do baralho, não é um problema)");
  }
} else {
  console.log("   (colidiu entretanto — sorte do baralho, não é um problema)");
}

console.log("5) Terminar o jogo (salta se ainda ativo) e confirmar ecrã de fim...");
const activeBeforeSkip = await page.locator('[data-screen="solo-cargame"].active').count();
if (activeBeforeSkip > 0) {
  await page.click("#game-hud-skip-btn");
}
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
const mgeTitle = await page.locator("#mge-title").textContent();
console.log(`   ${mgeTitle}`);
if (!mgeTitle.includes("Estrada Maluca")) { console.log("   FALHOU"); process.exitCode = 1; }
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: voltou ao menu");

console.log("6) Colisão real deve terminar o jogo automaticamente (sem mexer, fica na faixa do meio)...");
await page.click("#solo-play-car-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-cargame"].active', { timeout: 3000 });
const ended = await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 20000 }).then(() => true).catch(() => false);
console.log(`   terminou por colisão dentro de 20s: ${ended}`);
if (!ended) { console.log("   FALHOU: devia ter colidido"); process.exitCode = 1; }
await page.click("#mge-exit-btn");

console.log("7) Testar dentro da maratona (sozinho selecionado)...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="reflex"]');
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="bug"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
await page.uncheck('[data-marathon-game="map"]');
await page.check('[data-marathon-game="car"]');
await page.click("#solo-marathon-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-cargame"].active', { timeout: 3000 });
console.log("   OK: maratona entrou direto na Estrada Maluca");

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
