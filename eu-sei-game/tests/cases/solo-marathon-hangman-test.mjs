import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

async function clickThroughMinigameEnd(timeout = 5000) {
  await page.waitForFunction(
    () => !document.getElementById("minigame-end-overlay").classList.contains("hidden"),
    { timeout }
  );
}

console.log("1) Testar Forca avulso (sem respostas próprias, usa lista de reserva)...");
await page.click("#solo-menu-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
await page.click("#solo-play-hangman-btn");
await page.waitForSelector('[data-screen="solo-hangman-setup"].active', { timeout: 3000 });
await page.click("#hangman-solo-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-hangman"].active', { timeout: 3000 });
const cat = await page.locator("#solo-hangman-category").textContent();
console.log(`   ${cat}`);
const wordDisplay = await page.locator("#solo-hangman-word-display").textContent();
console.log(`   Palavra mascarada inicial: "${wordDisplay}" (só underscores esperado)`);
if (/[A-Z]/.test(wordDisplay.replace(/\s/g, ""))) {
  console.log("   FALHOU: palavra não devia estar visível no início");
  process.exitCode = 1;
}

console.log("2) Perder de propósito (letras raras) e confirmar revelação + volta ao menu...");
// Mais letras do que o necessário — algumas podem calhar de estar na palavra
// (ex.: "MEXICO" tem X, "JAPAO" tem J), por isso pára assim que o ecrã de fim aparecer.
const wrongLetters = ["Q", "X", "Z", "J", "W", "K", "Y", "H", "B", "V"];
for (const l of wrongLetters) {
  await page.fill("#solo-hangman-letter-input", l);
  await page.click("#solo-hangman-guess-letter-btn");
  await page.waitForTimeout(50);
  const overlayShown = await page.evaluate(() => !document.getElementById("minigame-end-overlay").classList.contains("hidden"));
  if (overlayShown) break;
}
await clickThroughMinigameEnd();
const statusText = await page.locator("#mge-points").textContent();
console.log(`   ${statusText}`);
// A Forca avulso agora é sempre em modo sequência, por isso a mensagem de
// derrota é "a sequência acabou..." em vez do antigo "Não desta vez".
if (!statusText.includes("sequência acabou")) {
  console.log("   FALHOU: esperava mensagem de fim de sequência no ecrã de fim");
  process.exitCode = 1;
}
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: ecrã de fim mostrou o resultado e 'Sair' voltou ao menu solo");

console.log("3) Testar a Maratona: selecionar só Reflexos + Mata o Inseto...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
await page.uncheck('[data-marathon-game="hangman"]');
await page.uncheck('[data-marathon-game="map"]');
// fica: reflex + bug
await page.click("#solo-marathon-start-btn");
await page.click("#ready-start-btn");

const playedGames = [];
for (let step = 0; step < 3; step++) {
  await page.waitForTimeout(300); // deixa o DOM assentar antes de ler o ecrã ativo
  const screen = await page.evaluate(() => document.querySelector(".screen.active").dataset.screen);
  if (screen === "solo-marathon-result") break;
  playedGames.push(screen);
  console.log(`   Jogo da maratona nº${step + 1}: ${screen}`);
  if (screen === "solo-minigame") {
    // Olho de Lince (antigo "Reflexos") — usa o skip do HUD, já testado à parte.
    await page.click("#game-hud-skip-btn");
  } else if (screen === "solo-minigame-bug") {
    // usa o skip do HUD em vez de esperar 9s a tentar apanhar insetos — mais rápido e já testado à parte
    await page.click("#game-hud-skip-btn");
  } else {
    console.log(`   FALHOU: ecrã inesperado na maratona: ${screen}`);
    process.exitCode = 1;
    break;
  }
  await clickThroughMinigameEnd();
  await page.click("#mge-continue-btn");
  // "Continuar" no último jogo da maratona vai direto para o ecrã de
  // resultado, sem overlay "pronto?" (não há mais nenhum jogo a preparar).
  const readyShown = await page.locator("#ready-overlay:not(.hidden)").isVisible().catch(() => false);
  if (readyShown) await page.click("#ready-start-btn");
}
console.log(`   Jogos jogados: ${playedGames.join(", ")} (esperado exatamente 1x cada de solo-minigame e solo-minigame-bug)`);
const uniquePlayed = new Set(playedGames);
if (playedGames.length !== 2 || uniquePlayed.size !== 2) {
  console.log("   FALHOU: a maratona não jogou exatamente os 2 jogos escolhidos, uma vez cada");
  process.exitCode = 1;
}

console.log("4) Confirmar ecrã de resultado final da maratona...");
await page.waitForSelector('[data-screen="solo-marathon-result"].active', { timeout: 5000 });
const summary = await page.locator("#marathon-result-summary").textContent();
console.log(`   ${summary}`);
if (!/\d+ pts/.test(summary)) {
  console.log("   FALHOU: resumo não menciona pontuação");
  process.exitCode = 1;
}

console.log("5) Voltar ao menu principal a partir do resultado...");
await page.click('[data-screen="solo-marathon-result"] [data-solo-home]');
await page.waitForSelector('[data-screen="home"].active', { timeout: 3000 });
console.log("   OK: voltou ao ecrã inicial");

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
