import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

// O seletor de categorias vive no ecra de configuracao do modo classico. O
// teste contava as checkboxes sem la chegar: count() nao precisa que o ecra
// esteja visivel, mas o clique a seguir precisava — e falhava.
await page.click("#solo-menu-btn");
await page.click("#solo-classic-btn");
await page.waitForSelector('[data-screen="solo-setup"].active', { timeout: 5000 });

console.log("1) Confirmar 40 checkboxes, todas marcadas por defeito...");
const total = await page.locator("#solo-cat-grid input[type=checkbox]").count();
console.log(`   Total: ${total} (esperado 40)`);
if (total !== 40) process.exitCode = 1;

console.log("2) Abrir <details> e restringir a só 4 categorias...");
// O <details> passou a vir aberto por omissao: clicar no summary FECHAVA-o e
// escondia os botoes que o teste ia usar a seguir. Garante aberto em vez de
// alternar.
await page.locator("#solo-cat-grid").locator("xpath=ancestor::details").evaluate((d) => { d.open = true; });
await page.click("#solo-cat-clear");
const count1 = await page.locator("#solo-cat-count").textContent();
console.log(`   Contagem: ${count1} (esperado 4)`);
if (count1 !== "4") process.exitCode = 1;

const enabledNames = await page.locator("#solo-cat-grid input:checked").evaluateAll(
  (inputs) => inputs.map((i) => i.closest("label").textContent.trim())
);
console.log(`   Categorias ativas: ${enabledNames.join(", ")}`);

console.log("3) Iniciar uma run e confirmar que a ronda só usa essas 4 categorias...");
// Ja estamos no ecra de configuracao (a navegacao passou para o inicio do
// teste, porque o passo 1 precisava dela): so falta comecar.
await page.click("#solo-setup-start-btn");
await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
await page.locator("#solo-letter-buttons .letter-btn").first().click();
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 3000 });
const roundCats = await page.locator("#solo-cat-list .cat-item span").allTextContents();
console.log(`   Categorias na ronda: ${roundCats.join(", ")}`);
const allFromEnabled = roundCats.every((c) => enabledNames.includes(c));
console.log(`   Todas dentro das ativas: ${allFromEnabled} (esperado true)`);
if (!allFromEnabled) process.exitCode = 1;
// ronda 1 pede 5 categorias por defeito, mas só há 4 ativas -> deve ficar limitada a 4
console.log(`   Nº de categorias na ronda: ${roundCats.length} (esperado 4, limitado pelo pool ativado)`);
if (roundCats.length !== 4) process.exitCode = 1;

console.log("4) Recarregar a página — a seleção deve persistir (localStorage)...");
const stored = await page.evaluate(() => localStorage.getItem("euSei_soloEnabledCategories"));
console.log(`   Guardado no localStorage: ${stored}`);
await page.reload({ waitUntil: "networkidle" });
const countAfterReload = await page.locator("#solo-cat-count").textContent();
console.log(`   Contagem após recarregar: ${countAfterReload} (esperado continuar em 4)`);
if (countAfterReload !== "4") process.exitCode = 1;

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
