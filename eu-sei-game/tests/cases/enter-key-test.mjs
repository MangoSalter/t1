import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Enter no nome cria a sala...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await page.press("#name-input", "Enter");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
console.log("   OK");

console.log("2) Ronda clássica: Enter salta para a categoria seguinte, e no último campo entrega...");
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");
await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 5000 });
await page.locator("#solo-letter-buttons .letter-btn").first().click();
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 5000 });
const inputs = page.locator("#solo-cat-list .cat-item input");
const n = await inputs.count();
await inputs.nth(0).click();
await inputs.nth(0).type("Abc");
await page.keyboard.press("Enter");
const focusedIdx = await page.evaluate(() => {
  const all = [...document.querySelectorAll("#solo-cat-list .cat-item input")];
  return all.indexOf(document.activeElement);
});
console.log(`   depois de Enter no 1º campo, foco no índice ${focusedIdx} (esperado 1)`);
if (focusedIdx !== 1) { console.log("   FALHOU"); process.exitCode = 1; }
// Enter no último entrega a ronda
await inputs.nth(n - 1).click();
await page.keyboard.press("Enter");
await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 5000 });
console.log("   OK: Enter no último campo entregou a ronda");

console.log("3) Forca solo: Enter no campo da letra entrega o palpite...");
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
await page.click("#solo-play-hangman-btn");
await page.waitForSelector('[data-screen="solo-hangman-setup"].active', { timeout: 5000 });
await page.click("#hangman-solo-setup-start-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 });
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-hangman"].active', { timeout: 5000 });
const before = await page.locator("#solo-hangman-word-display").textContent();
await page.fill("#solo-hangman-letter-input", "A");
await page.press("#solo-hangman-letter-input", "Enter");
await page.waitForTimeout(300);
const inputVal = await page.inputValue("#solo-hangman-letter-input");
const after = await page.locator("#solo-hangman-word-display").textContent();
console.log(`   campo limpo depois de Enter: ${inputVal === ""}; palavra "${before}" -> "${after}"`);
if (inputVal !== "") { console.log("   FALHOU: Enter não entregou o palpite"); process.exitCode = 1; }

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|CONNECTION_RESET/.test(e));
if (real.length) { console.log("ERROS:\n" + real.join("\n")); process.exitCode = 1; }
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
