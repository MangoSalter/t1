import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

const checkboxCount = await page.locator("#cfg-cat-grid input[type=checkbox]").count();
console.log(`Checkboxes na grelha: ${checkboxCount} (esperado 40)`);
if (checkboxCount !== 40) process.exitCode = 1;

const allChecked = await page.locator("#cfg-cat-grid input[type=checkbox]:checked").count();
console.log(`Marcadas por defeito: ${allChecked} (esperado 40)`);
if (allChecked !== 40) process.exitCode = 1;

const labelText = await page.locator("#cfg-cat-grid label").first().textContent();
console.log(`Primeira etiqueta: "${labelText.trim()}"`);

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
