import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
console.log("   OK: no lobby");

console.log("2) Confirmar 40/40 categorias por defeito...");
const count1 = await page.locator("#cfg-cat-count").textContent();
console.log(`   Contagem mostrada: ${count1}/40`);
if (count1 !== "40") process.exitCode = 1;

console.log("3) Abrir o <details> e desmarcar uma categoria...");
// As definicoes da partida passaram para dentro de um <details> proprio
// quando a sala virou menu de jogos: ha dois .cat-picker aninhados, e o de
// dentro so existe depois de abrir o de fora.
await page.locator('[data-screen="lobby"] .cat-picker summary', { hasText: "Definições" }).click();
await page.locator('[data-screen="lobby"] .cat-picker summary', { hasText: "Categorias ativas" }).click();
await page.locator("#cfg-cat-grid input[type=checkbox]").first().uncheck();
await page.waitForTimeout(400); // debounce
const count2 = await page.locator("#cfg-cat-count").textContent();
console.log(`   Contagem depois de desmarcar 1: ${count2}/40 (esperado 39)`);
if (count2 !== "39") process.exitCode = 1;

console.log("4) Clicar 'Limpar' (deve ficar no mínimo, 4)...");
await page.click("#cfg-cat-clear");
await page.waitForTimeout(400);
const count3 = await page.locator("#cfg-cat-count").textContent();
const checkedAfterClear = await page.locator("#cfg-cat-grid input[type=checkbox]:checked").count();
console.log(`   Contagem: ${count3}/40, marcadas: ${checkedAfterClear} (esperado 4 em ambos)`);
if (count3 !== "4" || checkedAfterClear !== 4) process.exitCode = 1;

console.log("5) Tentar desmarcar abaixo do mínimo (deve reverter)...");
const boxes = await page.locator("#cfg-cat-grid input[type=checkbox]").all();
let firstCheckedBox = null;
for (const b of boxes) {
  if (await b.isChecked()) { firstCheckedBox = b; break; }
}
await firstCheckedBox.click({ force: true }); // .uncheck() falharia "com razão", pois o guarda reverte
await page.waitForTimeout(300);
const stillChecked = await firstCheckedBox.isChecked();
console.log(`   Continua marcada após tentativa de desmarcar: ${stillChecked} (esperado true, reverteu)`);
if (!stillChecked) process.exitCode = 1;
const countAfterGuard = await page.locator("#cfg-cat-grid input[type=checkbox]:checked").count();
console.log(`   Marcadas: ${countAfterGuard} (esperado continuar em 4, não descer)`);
if (countAfterGuard !== 4) process.exitCode = 1;

console.log("6) Clicar 'Selecionar todas'...");
await page.click("#cfg-cat-selectall");
await page.waitForTimeout(400);
const count4 = await page.locator("#cfg-cat-count").textContent();
console.log(`   Contagem: ${count4}/40 (esperado 40)`);
if (count4 !== "40") process.exitCode = 1;

console.log("7) Verificar que 'Iniciar jogo' está visível (sou host) mas desativado (só 1 jogador)...");
const startVisible = await page.locator("#start-game-btn").isVisible();
const startDisabled = await page.locator("#start-game-btn").isDisabled();
console.log(`   Visível: ${startVisible}, desativado: ${startDisabled} (esperado true, true)`);
if (!startVisible || !startDisabled) process.exitCode = 1;

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
