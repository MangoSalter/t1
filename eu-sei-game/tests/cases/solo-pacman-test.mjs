import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Abrir Kota Corre!...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-pac-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-pacman"].active', { timeout: 3000 });
const wallCount = await page.locator(".pac-wall").count();
const dotCount = await page.locator(".pac-dot").count();
const pelletCount = await page.locator(".pac-pellet").count();
console.log(`   paredes: ${wallCount}, pastilhas pequenas: ${dotCount}, pastilhas grandes: ${pelletCount}`);
if (wallCount === 0 || dotCount === 0 || pelletCount !== 4) { console.log("   FALHOU"); process.exitCode = 1; }
const ghostCount = await page.locator(".pac-ghost").count();
console.log(`   fantasmas: ${ghostCount} (esperado 4)`);
if (ghostCount !== 4) { console.log("   FALHOU"); process.exitCode = 1; }
const livesText = await page.locator("#pac-lives").textContent();
console.log(`   ${livesText}`);

console.log("2) Mover com as setas e confirmar que a posição do jogador muda...");
const posBefore = await page.evaluate(() => {
  const el = document.querySelector(".pac-player");
  return { left: el.style.left, top: el.style.top };
});
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(700);
const posAfter = await page.evaluate(() => {
  const el = document.querySelector(".pac-player");
  return { left: el.style.left, top: el.style.top };
});
console.log(`   antes: ${JSON.stringify(posBefore)}, depois: ${JSON.stringify(posAfter)}`);
if (posBefore.left === posAfter.left && posBefore.top === posAfter.top) {
  console.log("   FALHOU: jogador não se moveu");
  process.exitCode = 1;
}

console.log("3) Confirmar que o HUD mostra pontos em tempo real (pastilhas comidas)...");
await page.waitForTimeout(1500);
const hudScore = await page.locator("#game-hud-score-value").textContent();
console.log(`   pontos no HUD: ${hudScore} (esperado > 0, já comeu algumas pastilhas a andar)`);
if (Number(hudScore) <= 0) { console.log("   FALHOU: esperava pontos > 0"); process.exitCode = 1; }

console.log("4) Testar pausa/retoma sem rebentar...");
await page.click("#game-hud-pause-btn");
await page.waitForFunction(() => !document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
await page.waitForTimeout(400);
await page.click("#pause-resume-btn");
await page.waitForFunction(() => document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
console.log("   OK");

console.log("5) Saltar com o botão do HUD e confirmar ecrã de fim...");
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
const mgeTitle = await page.locator("#mge-title").textContent();
const mgePoints = await page.locator("#mge-points").textContent();
console.log(`   "${mgeTitle}" — ${mgePoints}`);
if (!mgeTitle.includes("Kota Corre")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Continuar relança o jogo (jogar novamente)...");
await page.click("#mge-continue-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-pacman"].active', { timeout: 3000 });
const wallCount2 = await page.locator(".pac-wall").count();
console.log(`   paredes ao relançar: ${wallCount2} (labirinto reconstruído)`);
if (wallCount2 !== wallCount) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("7) Testar túnel: forçar o jogador para a linha do túnel e ir para a esquerda repetidamente...");
// sai e usa o hook temporário de depuração não está disponível; testa de forma indireta:
// anda para a esquerda repetidamente na linha inicial (perto do túnel) e confirma que não trava.
for (let i = 0; i < 15; i++) {
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(170);
}
const stillOnScreen = await page.locator('[data-screen="solo-pacman"].active').count();
console.log(`   ainda no ecrã do jogo depois de 15 movimentos: ${stillOnScreen > 0}`);
if (stillOnScreen === 0) { console.log("   FALHOU: ecrã fechou inesperadamente"); process.exitCode = 1; }

console.log("8) Sair para o menu...");
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK");

console.log("9) Testar dentro da maratona (sozinho selecionado)...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="reflex"]');
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="bug"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
await page.uncheck('[data-marathon-game="map"]');
await page.check('[data-marathon-game="pacman"]');
await page.click("#solo-marathon-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-pacman"].active', { timeout: 3000 });
console.log("   OK: maratona entrou direto no Kota Corre!");
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-continue-btn");
await page.waitForSelector('[data-screen="solo-marathon-result"].active', { timeout: 3000 });
console.log("   OK: maratona terminou normalmente");

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
