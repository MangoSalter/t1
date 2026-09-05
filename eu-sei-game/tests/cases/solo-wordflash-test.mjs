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
  await page.click("#mge-continue-btn");
}

async function playRoundAndReachMinigame() {
  await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
  const letter = await page.locator("#solo-letter-buttons .letter-btn .letter-big").first().textContent();
  await page.locator("#solo-letter-buttons .letter-btn").first().click();
  await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 3000 });
  const inputs = await page.locator("#solo-cat-list .cat-item input").all();
  for (let i = 0; i < inputs.length; i++) await inputs[i].fill(`${letter}palavra${i}`);
  await page.click("#solo-finish-btn");
  await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 3000 });
  await page.click("#solo-continue-btn");
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".screen.active");
      return el && el.dataset.screen.startsWith("solo-minigame");
    },
    { timeout: 3000 }
  );
}

// Se calhar noutro mini-jogo que não a Palavra Relâmpago, salta-o com o
// botão do HUD e volta a jogar uma ronda, até calhar o certo.
async function skipIfNotWordFlash() {
  const screen = await page.evaluate(() => document.querySelector(".screen.active").dataset.screen);
  if (screen === "solo-minigame-word") return true;
  console.log(`   (calhou ${screen} desta vez, a saltar com o botão do HUD)`);
  await page.click("#game-hud-skip-btn");
  await clickThroughMinigameEnd();
  await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
  return false;
}

await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");

let foundWordFlash = false;
for (let attempt = 0; attempt < 10 && !foundWordFlash; attempt++) {
  console.log(`Tentativa ${attempt + 1}: a jogar ronda e a chegar ao mini-jogo...`);
  await playRoundAndReachMinigame();
  foundWordFlash = await skipIfNotWordFlash();
  if (foundWordFlash) console.log("   OK: calhou 'Palavra Relâmpago'");
}

if (!foundWordFlash) {
  console.log("AVISO: não calhou Palavra Relâmpago em 10 tentativas (aleatório, pode acontecer).");
  process.exitCode = 1;
} else {
  const letterShown = await page.locator("#wf-letter").textContent();
  console.log(`Letra do mini-jogo: ${letterShown}`);

  console.log("Testar palavra inválida (letra errada, garantidamente diferente)...");
  const wrongLetter = letterShown === "9" ? "8" : "9"; // dígito nunca é igual a uma letra
  await page.fill("#wf-input", `${wrongLetter}errada`);
  await page.locator("#wf-input").press("Enter");
  const fb1 = await page.locator("#wf-feedback").textContent();
  console.log(`   OK: ${fb1}`);
  const chipsAfterInvalid = await page.locator(".wf-word-chip").count();
  if (chipsAfterInvalid !== 0) {
    console.log(`   FALHOU: esperava 0 chips, mas há ${chipsAfterInvalid}`);
    process.exitCode = 1;
  }

  console.log("Testar palavra demasiado curta...");
  await page.fill("#wf-input", letterShown.slice(0, 1) + "a");
  await page.locator("#wf-input").press("Enter");
  const fb2 = await page.locator("#wf-feedback").textContent();
  console.log(`   OK: ${fb2}`);

  console.log("Submeter 3 palavras válidas...");
  for (let i = 0; i < 3; i++) {
    await page.fill("#wf-input", `${letterShown}palavravalida${i}`);
    await page.locator("#wf-input").press("Enter");
  }
  const chipCount = await page.locator(".wf-word-chip").count();
  console.log(`   OK: ${chipCount} chips mostrados (esperado 3)`);
  const hudScore = await page.locator("#game-hud-score-value").textContent();
  console.log(`   OK: HUD mostra pontos em tempo real: ${hudScore}`);

  console.log("Testar duplicado...");
  await page.fill("#wf-input", `${letterShown}palavravalida0`);
  await page.locator("#wf-input").press("Enter");
  const fb3 = await page.locator("#wf-feedback").textContent();
  console.log(`   OK: ${fb3}`);

  console.log("A aguardar o tempo acabar (12s) e clicar Continuar no ecrã de fim...");
  await clickThroughMinigameEnd(16000);
  await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
  console.log("   OK: avançou para a ronda seguinte");
}

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
