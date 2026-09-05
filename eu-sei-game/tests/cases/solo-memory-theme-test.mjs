import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Ir a Memória -> ecrã de tema, escolher 'Harry Potter'...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-memory-btn");
await page.waitForSelector('[data-screen="solo-memory-setup"].active', { timeout: 3000 });
await page.selectOption("#memory-theme-select", "Harry Potter");
await page.click("#memory-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-memory"].active', { timeout: 3000 });

console.log("2) Confirmar que os itens mostrados são do tema Harry Potter (não do jogo normal)...");
const shownTexts = await page.locator(".mem-card.shown-preview").allTextContents();
console.log(`   itens mostrados: ${shownTexts.join(", ")}`);
const hpNames = ["Harry Potter", "Rony Weasley", "Hermione Granger", "Alvo Dumbledore", "Severo Snape", "Draco Malfoy", "Rúbeo Hagrid", "Minerva McGonagall", "Voldemort", "Sirius Black", "Luna Lovegood", "Gina Weasley", "Neville Longbottom", "Bellatrix Lestrange", "Dobby"];
const allFromHP = shownTexts.every((t) => hpNames.includes(t));
console.log(`   todos pertencem à lista Harry Potter: ${allFromHP}`);
if (!allFromHP || shownTexts.length === 0) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Esperar a fase de escolha e selecionar tudo o que estava certo...");
await page.waitForSelector("#mem-confirm-btn:not(.hidden)", { timeout: 4000 });
for (const label of shownTexts) {
  await page.locator(".mem-card", { hasText: label }).first().click();
}
await page.click("#mem-confirm-btn");

console.log("4) Confirmar ecrã de fim com botão Sair e clicar nele...");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
const points = await page.locator("#mge-points").textContent();
console.log(`   ${points}`);
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: Sair voltou ao menu");

console.log("5) Jogar de novo e clicar Continuar (deve voltar a jogar Memória direto, sem passar pelo menu)...");
await page.click("#solo-play-memory-btn");
await page.waitForSelector('[data-screen="solo-memory-setup"].active', { timeout: 3000 });
const selectedTheme = await page.locator("#memory-theme-select").inputValue();
console.log(`   tema pré-selecionado ao voltar: ${selectedTheme} (esperado Harry Potter, persistido)`);
if (selectedTheme !== "Harry Potter") { console.log("   FALHOU: tema não persistiu"); process.exitCode = 1; }
await page.click("#memory-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-memory"].active', { timeout: 3000 });
await page.click("#game-hud-skip-btn");
await page.waitForFunction(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"), { timeout: 3000 });
await page.click("#mge-continue-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-memory"].active', { timeout: 3000 });
console.log("   OK: Continuar relançou a Memória diretamente (jogar novamente)");

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
