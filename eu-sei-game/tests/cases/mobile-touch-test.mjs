import { chromium, devices } from "playwright";

const iPhone = devices["iPhone 13"];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ ...iPhone });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Num telemóvel, os comandos no ecrã começam escondidos (fora de jogo)...");
let hidden = await page.locator("#touch-controls").evaluate((el) => el.classList.contains("hidden"));
console.log(`   escondidos: ${hidden} (esperado true)`);
if (!hidden) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("2) Abrir a Estrada Maluca -> comandos aparecem...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-car-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-cargame"].active', { timeout: 3000 });
await page.waitForTimeout(300);
const visible = await page.locator("#touch-controls").isVisible();
console.log(`   visíveis: ${visible} (esperado true)`);
if (!visible) { console.log("   FALHOU: sem comandos, o jogo é injogável no telemóvel"); process.exitCode = 1; }

console.log("3) Tocar em ◀ / ▶ muda mesmo de faixa (evento de teclado sintético chega ao jogo)...");
const laneOf = () => page.evaluate(() => {
  const el = document.querySelector(".car-player");
  return el ? Math.round(parseFloat(el.style.left)) : null;
});
const before = await laneOf();
await page.locator('[data-touch-key="ArrowLeft"]').tap();
await page.waitForTimeout(250);
const afterLeft = await laneOf();
console.log(`   posição: ${before} -> ${afterLeft} depois de ◀`);
if (before === null || afterLeft === null || afterLeft >= before) {
  console.log("   FALHOU: tocar em ◀ devia mover o carro para a esquerda");
  process.exitCode = 1;
}
await page.locator('[data-touch-key="ArrowRight"]').tap();
await page.waitForTimeout(250);
const afterRight = await laneOf();
console.log(`   posição: ${afterLeft} -> ${afterRight} depois de ▶`);
if (afterRight <= afterLeft) { console.log("   FALHOU: ▶ devia mover para a direita"); process.exitCode = 1; }

console.log("4) O botão de ação só aparece onde é preciso (na Estrada Maluca não é)...");
const actionHidden = await page.locator("#touch-action-btn").evaluate((el) => el.classList.contains("hidden"));
console.log(`   botão de ação escondido: ${actionHidden} (esperado true)`);
if (!actionHidden) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) Sair do jogo -> comandos desaparecem...");
await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
hidden = await page.locator("#touch-controls").evaluate((el) => el.classList.contains("hidden"));
console.log(`   escondidos: ${hidden} (esperado true)`);
if (!hidden) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Kota Corre! (labirinto) também mostra comandos...");
await page.click("#solo-play-pac-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-pacman"].active', { timeout: 3000 });
await page.waitForTimeout(200);
const pacVisible = await page.locator("#touch-controls").isVisible();
console.log(`   visíveis: ${pacVisible} (esperado true)`);
if (!pacVisible) { console.log("   FALHOU"); process.exitCode = 1; }
await page.screenshot({ path: "/tmp/claude-0/-home-user-desktop-tutorial/b81067ab-4fa8-5d81-a9c7-2903e1cb5f64/scratchpad/shot-mobile-pac.png" });

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
