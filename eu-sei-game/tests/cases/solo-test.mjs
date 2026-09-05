import { chromium } from "playwright";
import { backToLetterpick } from "./test-helpers.mjs";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Clicar 'Jogar sozinho'...");
await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");
await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
console.log("   OK: ecrã de escolha de letra ativo");

const letterCount = await page.locator("#solo-letter-buttons .letter-btn").count();
console.log(`   ${letterCount} letras candidatas mostradas`);

console.log("2) Escolher a primeira letra...");
const chosenLetter = await page.locator("#solo-letter-buttons .letter-btn .letter-big").first().textContent();
await page.locator("#solo-letter-buttons .letter-btn").first().click();
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 3000 });
console.log(`   OK: ronda ativa, letra escolhida = ${chosenLetter}`);

const catCount = await page.locator("#solo-cat-list .cat-item").count();
console.log(`   ${catCount} categorias na ronda 1 (esperado 5)`);

console.log("3) Preencher respostas (todas começando pela letra certa, exceto a última)...");
const inputs = await page.locator("#solo-cat-list .cat-item input").all();
for (let i = 0; i < inputs.length; i++) {
  const text = i < inputs.length - 1 ? `${chosenLetter}teste${i}` : "resposta errada";
  await inputs[i].fill(text);
}

console.log("4) Clicar 'Acabei!'...");
await page.click("#solo-finish-btn");
await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 3000 });
const resultTitle = await page.locator("#solo-result-title").textContent();
const resultSummary = await page.locator("#solo-result-summary").textContent();
console.log(`   OK: ${resultTitle}`);
console.log(`   ${resultSummary}`);

const continueVisible = await page.locator("#solo-continue-btn").isVisible();
console.log(`   Botão 'Próxima ronda' visível: ${continueVisible} (esperado true, ${inputs.length - 1}/${inputs.length} corretas)`);

if (continueVisible) {
  console.log("5) Continuar para a ronda 2...");
  await page.click("#solo-continue-btn");
  await backToLetterpick(page);
  const infoText = await page.locator("#solo-letter-info").textContent();
  console.log(`   OK: ${infoText}`);
}

console.log("6) Testar 'Sair' volta ao menu do modo sozinho, e daí ao ecrã inicial...");
// "Sair" de uma ronda passou a voltar ao MENU do modo sozinho, não direto ao
// ecrã inicial — dali dá para escolher outro jogo sem repetir o caminho todo.
await page.click('.screen.active [data-solo-leave]');
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 5000 });
console.log("   OK: voltou ao menu do modo sozinho");
await page.click('.screen.active [data-solo-home]');
await page.waitForSelector('[data-screen="home"].active', { timeout: 3000 });
console.log("   OK: e daí ao ecrã inicial");

console.log("7) Testar falha de ronda (todas as respostas erradas)...");
await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");
await backToLetterpick(page);
await page.locator("#solo-letter-buttons .letter-btn").first().click();
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 3000 });
const inputs2 = await page.locator("#solo-cat-list .cat-item input").all();
for (const inp of inputs2) await inp.fill("777"); // não começa por nenhuma letra
await page.click("#solo-finish-btn");
await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 3000 });
const failTitle = await page.locator("#solo-result-title").textContent();
const restartVisible = await page.locator("#solo-restart-btn").isVisible();
console.log(`   OK: ${failTitle}`);
console.log(`   Botão 'Jogar outra vez' visível: ${restartVisible} (esperado true)`);

await browser.close();

console.log("\n--- Erros de consola/página ---");
// Ruído do sandbox (fontes Google cortadas pelo proxy) não é erro do jogo —
// os outros testes já o filtravam; este dava sempre falha por causa dele.
const realErrors = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
errors.forEach((e) => console.log("ERRO:", e));
if (realErrors.length > 0) {
  process.exitCode = 1;
  console.log("\nHÁ ERROS REAIS.");
} else {
  console.log("\nSem erros reais.");
}
