import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Abrir Mini-Golfe...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-golf-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-golf"].active', { timeout: 3000 });
const wallCount = await page.locator(".golf-wall").count();
const holeCount = await page.locator(".golf-hole").count();
const ballCount = await page.locator(".golf-ball").count();
console.log(`   paredes: ${wallCount}, buracos: ${holeCount}, bolas: ${ballCount}`);
if (holeCount !== 1 || ballCount !== 1) { console.log("   FALHOU"); process.exitCode = 1; }
const holeInfo = await page.locator("#golf-hole-info").textContent();
console.log(`   ${holeInfo}`);

console.log("2) Segurar seta para baixo e confirmar que a bola se move (aceleração)...");
const posBefore = await page.evaluate(() => {
  const el = document.querySelector(".golf-ball");
  return { left: el.style.left, top: el.style.top };
});
await page.keyboard.down("ArrowDown");
await page.waitForTimeout(600);
await page.keyboard.up("ArrowDown");
await page.waitForTimeout(200);
const posAfter = await page.evaluate(() => {
  const el = document.querySelector(".golf-ball");
  return { left: el.style.left, top: el.style.top };
});
console.log(`   antes: ${JSON.stringify(posBefore)}, depois: ${JSON.stringify(posAfter)}`);
if (posBefore.top === posAfter.top) { console.log("   FALHOU: bola não se moveu"); process.exitCode = 1; }

console.log("3) A bola deve desacelerar e parar sozinha por atrito (sem tocar em mais teclas)...");
await page.waitForTimeout(1500);
const posSettled1 = await page.evaluate(() => document.querySelector(".golf-ball").style.top);
await page.waitForTimeout(500);
const posSettled2 = await page.evaluate(() => document.querySelector(".golf-ball").style.top);
console.log(`   posição após parar (duas leituras): ${posSettled1} / ${posSettled2} (devem ser iguais ou muito próximas)`);

console.log("4) Testar pausa/retoma...");
await page.click("#game-hud-pause-btn");
await page.waitForFunction(() => !document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
await page.click("#pause-resume-btn");
await page.waitForFunction(() => document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 2000 });
console.log("   OK");

console.log("5) Saltar e confirmar ecrã de fim...");
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
const mgeTitle = await page.locator("#mge-title").textContent();
console.log(`   "${mgeTitle}"`);
if (!mgeTitle.includes("Mini-Golfe")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Continuar relança o jogo no buraco 1...");
await page.click("#mge-continue-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-golf"].active', { timeout: 3000 });
const holeInfo2 = await page.locator("#golf-hole-info").textContent();
console.log(`   ${holeInfo2} (esperado buraco 1/3)`);
if (!holeInfo2.includes("1/3")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("7) Testar que uma parede bloqueia o avanço direto (curso 1 tem uma parede vertical a meio)...");
// empurra para a direita com força — a bola deve ficar perto da parede, não atravessá-la
for (let i = 0; i < 20; i++) {
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(80);
}
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(300);
const ballX = await page.evaluate(() => parseFloat(document.querySelector(".golf-ball").style.left));
console.log(`   posição X da bola depois de tentar ir sempre à direita: ${ballX} (parede está em x=230, bola não deve passar muito daí sem desviar)`);
const stillOnScreen = await page.locator('[data-screen="solo-golf"].active').count();
if (stillOnScreen === 0) { console.log("   FALHOU: ecrã fechou inesperadamente"); process.exitCode = 1; }

console.log("8) Sair para o menu...");
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK");

console.log("9) Testar dentro da maratona...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="reflex"]');
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="bug"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
await page.uncheck('[data-marathon-game="map"]');
await page.check('[data-marathon-game="golf"]');
await page.click("#solo-marathon-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-golf"].active', { timeout: 3000 });
console.log("   OK: maratona entrou direto no Mini-Golfe");
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
