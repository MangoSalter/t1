import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
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

console.log("5) Escolher uma cor pinta com essa cor (e a borracha volta a lápis)...");
// Ninguém media isto: as sete cores do avatar nunca tinham sido clicadas por
// teste nenhum. Ficaram sem nome para leitor de ecrã durante todo esse tempo
// (ver a11y-test, passo 12) e o caminho de as escolher não tinha guarda.
await page.click("#avatar-edit-btn");
await page.waitForSelector("#avatar-editor-overlay:not(.hidden)", { timeout: 3000 });
await page.click("#avatar-tool-eraser");
const mostarda = page.locator(".avatar-swatch").nth(2);
const nomeDaCor = await mostarda.getAttribute("aria-label");
await mostarda.click();
console.log(`   cor escolhida: ${nomeDaCor}`);
if (!/amarelo/i.test(nomeDaCor || "")) {
  console.log("   FALHOU: a terceira cor devia anunciar-se pelo nome");
  process.exitCode = 1;
}
// Onde cai o toque depende da moldura de 2px, por isso não se aponta a um
// píxel: pinta-se um e conta-se quantos ficaram com a cor escolhida.
const caixa = await page.locator("#avatar-canvas").boundingBox();
await page.mouse.click(caixa.x + caixa.width * 0.25, caixa.y + caixa.height * 0.25);
const estado = await page.evaluate(() => {
  const dados = document.getElementById("avatar-canvas").getContext("2d").getImageData(0, 0, 16, 16).data;
  const pintados = [];
  for (let i = 0; i < 256; i += 1) {
    if (dados[i * 4 + 3] === 0) continue;
    pintados.push(`#${[0, 1, 2].map((k) => dados[i * 4 + k].toString(16).padStart(2, "0")).join("")}`);
  }
  const escolhidas = [...document.querySelectorAll(".avatar-swatch")]
    .map((b, i) => (b.getAttribute("aria-pressed") === "true" ? i : -1))
    .filter((i) => i >= 0);
  return { pintados, escolhidas, lapis: document.getElementById("avatar-tool-pencil").classList.contains("active") };
});
const comACor = estado.pintados.filter((c) => c === "#e3a53d").length;
console.log(`   ${estado.pintados.length} píxeis pintados, ${comACor} com a cor escolhida · marcadas: [${estado.escolhidas.join(", ")}] · lápis ativo: ${estado.lapis}`);
if (comACor !== 1) {
  console.log(`   FALHOU: ${comACor} píxeis com a cor escolhida (pintados: ${estado.pintados.join(", ")})`);
  process.exitCode = 1;
}
if (estado.escolhidas.length !== 1 || estado.escolhidas[0] !== 2) {
  console.log("   FALHOU: aria-pressed devia estar numa cor só, a que se escolheu");
  process.exitCode = 1;
}
if (!estado.lapis) {
  console.log("   FALHOU: escolher uma cor com a borracha na mão tem de voltar ao lápis");
  process.exitCode = 1;
}


await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
