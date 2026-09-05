import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

// Neste sandbox o pedido da Google Font falha e tenta repetidamente durante
// uns segundos, o que causa reflow da página nesse período — um clique do
// Playwright em coordenadas de ecrã calculadas antes desse reflow pode
// acabar por não acertar no botão (não acontece num browser real, onde o
// pedido falha uma vez ou carrega normalmente). Para não depender de
// coordenadas de todo, clica diretamente no elemento via .click() no DOM.
async function clickReflexItemByTitle(title) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll(".reflex-item")].find((b) => b.title === t);
    if (!el) throw new Error(`item não encontrado: ${t}`);
    el.click();
  }, title);
}

async function clickThroughMinigameEnd(timeout = 5000) {
  await page.waitForFunction(
    () => !document.getElementById("minigame-end-overlay").classList.contains("hidden"),
    { timeout }
  );
}

console.log("1) Ir a Olho de Lince -> escolher tema 'Mar'...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-reflex-btn");
await page.waitForSelector('[data-screen="solo-reflex-setup"].active', { timeout: 3000 });
await page.selectOption("#reflex-theme-select", "Mar");
await page.click("#reflex-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame"].active', { timeout: 3000 });

console.log("2) Confirmar tema, prompt, e nº de itens espalhados...");
const themeLabel = await page.locator("#reflex-theme-label").textContent();
console.log(`   tema: ${themeLabel} (esperado Mar)`);
if (themeLabel !== "Mar") { console.log("   FALHOU"); process.exitCode = 1; }
const itemCount = await page.locator(".reflex-item").count();
console.log(`   itens no cenário: ${itemCount} (esperado 14, tema Mar tem 15 itens)`);
if (itemCount !== 14) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Ler o alvo pedido e clicar no item errado primeiro...");
const promptHtml = await page.locator("#reflex-prompt").innerHTML();
console.log(`   prompt: ${promptHtml}`);

const { targetTitle, wrongTitle } = await page.evaluate(() => {
  const strong = document.querySelector("#reflex-prompt strong");
  const targetEmoji = strong ? strong.textContent.trim().split(" ")[0] : "";
  const els = [...document.querySelectorAll(".reflex-item")];
  const correct = els.find((b) => b.textContent === targetEmoji);
  const wrong = els.find((b) => b.textContent !== targetEmoji);
  return { targetTitle: correct ? correct.title : null, wrongTitle: wrong ? wrong.title : null };
});
console.log(`   alvo: "${targetTitle}", errado escolhido: "${wrongTitle}"`);
if (!targetTitle) { console.log("   FALHOU: não encontrei o botão correto pelo emoji"); process.exitCode = 1; }

await clickReflexItemByTitle(wrongTitle);
await page.waitForTimeout(150);
const statusAfterWrong = await page.locator("#reflex-status").textContent();
console.log(`   ${statusAfterWrong}`);
if (!statusAfterWrong.includes("não é o que procuras")) { console.log("   FALHOU: esperava feedback de erro"); process.exitCode = 1; }
const hudAfterWrong = await page.locator("#game-hud-score-value").textContent();
console.log(`   pontos no HUD depois do erro: ${hudAfterWrong} (esperado 0, penalização não desce abaixo de 0)`);

console.log("4) Clicar no item certo e confirmar avanço de ronda...");
await clickReflexItemByTitle(targetTitle);
await page.waitForTimeout(150);
const statusAfterCorrect = await page.locator("#reflex-status").textContent();
console.log(`   ${statusAfterCorrect}`);
if (!statusAfterCorrect.includes("Encontraste")) { console.log("   FALHOU"); process.exitCode = 1; }
await page.waitForTimeout(900);
const roundInfo2 = await page.locator("#reflex-round-info").textContent();
console.log(`   ${roundInfo2} (esperado Ronda 2/8)`);
if (!roundInfo2.includes("2/8")) { console.log("   FALHOU: não avançou para a ronda 2"); process.exitCode = 1; }

console.log("5) Saltar o resto com o botão do HUD e confirmar ecrã de fim...");
await page.click("#game-hud-skip-btn");
await clickThroughMinigameEnd();
const mgeTitle = await page.locator("#mge-title").textContent();
const mgePoints = await page.locator("#mge-points").textContent();
console.log(`   "${mgeTitle}" — ${mgePoints}`);
if (!mgeTitle.includes("Olho de Lince")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Continuar deve relançar o mesmo jogo (jogar novamente) com o tema persistido...");
await page.click("#mge-continue-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame"].active', { timeout: 3000 });
const themeLabel2 = await page.locator("#reflex-theme-label").textContent();
console.log(`   tema ao relançar: ${themeLabel2} (esperado continuar Mar)`);
if (themeLabel2 !== "Mar") { console.log("   FALHOU"); process.exitCode = 1; }

console.log("7) Sair e voltar ao ecrã de tema — deve mostrar Mar pré-selecionado...");
await page.click("#game-hud-skip-btn");
await clickThroughMinigameEnd();
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
await page.click("#solo-play-reflex-btn");
await page.waitForSelector('[data-screen="solo-reflex-setup"].active', { timeout: 3000 });
const persistedTheme = await page.locator("#reflex-theme-select").inputValue();
console.log(`   tema pré-selecionado: ${persistedTheme}`);
if (persistedTheme !== "Mar") { console.log("   FALHOU: tema não persistiu"); process.exitCode = 1; }

console.log("8) Testar tema 'Aleatório' e maratona com Olho de Lince...");
await page.selectOption("#reflex-theme-select", "Aleatório");
await page.click("#reflex-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame"].active', { timeout: 3000 });
const randomThemeLabel = await page.locator("#reflex-theme-label").textContent();
console.log(`   tema sorteado: ${randomThemeLabel} (deve ser Selva, Mar ou Casa e Cozinha)`);
if (!["Selva", "Mar", "Casa e Cozinha"].includes(randomThemeLabel)) { console.log("   FALHOU"); process.exitCode = 1; }
await page.click("#game-hud-skip-btn");
await clickThroughMinigameEnd();
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
