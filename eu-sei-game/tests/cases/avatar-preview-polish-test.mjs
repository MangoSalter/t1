import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Botão de avatar deve ter classe ghost-primary...");
const btnClass = await page.locator("#avatar-edit-btn").getAttribute("class");
console.log(`   class="${btnClass}"`);
if (!btnClass.includes("ghost-primary")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("2) Sem avatar guardado, preview deve ter .avatar-preview-empty...");
await page.evaluate(() => localStorage.removeItem("eusei_avatar"));
await page.reload({ waitUntil: "networkidle" });
const emptyClass = await page.locator("#avatar-preview").getAttribute("class");
console.log(`   class="${emptyClass}"`);
if (!emptyClass.includes("avatar-preview-empty")) { console.log("   FALHOU"); process.exitCode = 1; }

const box1 = await page.locator("#avatar-preview").boundingBox();
console.log(`   tamanho: ${box1.width}x${box1.height} (esperado ~48x48)`);
if (Math.abs(box1.width - 48) > 2) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Desenhar e guardar avatar, preview deve perder .avatar-preview-empty...");
await page.click("#avatar-edit-btn");
await page.waitForSelector("#avatar-editor-overlay:not(.hidden)", { timeout: 3000 });
const canvasBox = await page.locator("#avatar-canvas").boundingBox();
await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
await page.click("#avatar-save-btn");
await page.waitForFunction(() => document.getElementById("avatar-editor-overlay").classList.contains("hidden"), { timeout: 3000 });
const filledClass = await page.locator("#avatar-preview").getAttribute("class");
console.log(`   class="${filledClass}"`);
if (filledClass.includes("avatar-preview-empty")) { console.log("   FALHOU"); process.exitCode = 1; }

const src = await page.locator("#avatar-preview").getAttribute("src");
if (!src || !src.startsWith("data:image/png")) { console.log("   FALHOU: src inválido"); process.exitCode = 1; }
console.log("   OK: avatar guardado e preview atualizado");

console.log("4) Reload deve manter avatar guardado (persistência)...");
await page.reload({ waitUntil: "networkidle" });
const persistedClass = await page.locator("#avatar-preview").getAttribute("class");
if (persistedClass.includes("avatar-preview-empty")) { console.log("   FALHOU: não persistiu"); process.exitCode = 1; }
console.log("   OK: persistiu após reload");

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
