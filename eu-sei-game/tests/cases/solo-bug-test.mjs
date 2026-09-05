import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

async function playRoundToMinigame() {
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
    () => ["solo-minigame", "solo-minigame-word", "solo-minigame-bug"].some((id) => {
      const el = document.querySelector(`[data-screen="${id}"]`);
      return el && el.classList.contains("active");
    }),
    { timeout: 3000 }
  );
}

async function currentMinigame() {
  for (const id of ["solo-minigame", "solo-minigame-word", "solo-minigame-bug"]) {
    const active = await page.locator(`[data-screen="${id}"].active`).count();
    if (active > 0) return id;
  }
  return null;
}

await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");

let found = false;
for (let attempt = 0; attempt < 12 && !found; attempt++) {
  await playRoundToMinigame();
  const which = await currentMinigame();
  console.log(`Tentativa ${attempt + 1}: calhou ${which}`);
  if (which === "solo-minigame-bug") {
    found = true;
  } else if (which === "solo-minigame") {
    await page.click("#solo-mg-circle");
    await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
  } else if (which === "solo-minigame-word") {
    await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 16000 });
  }
}

if (!found) {
  console.log("AVISO: não calhou Mata o Inseto em 12 tentativas.");
  process.exitCode = 1;
} else {
  const target = await page.locator("#bug-target-label").textContent();
  console.log(`Alvo: ${target}`);

  console.log("A aguardar insetos aparecerem na arena...");
  await page.waitForSelector(".bug-arena .bug", { timeout: 3000 });
  console.log("   OK: pelo menos 1 inseto apareceu");

  console.log("A clicar em todos os insetos que aparecerem durante ~4s...");
  const deadline = Date.now() + 4000;
  let clicks = 0;
  while (Date.now() < deadline) {
    const bugs = await page.locator(".bug-arena .bug").all();
    for (const bug of bugs) {
      try {
        await bug.click({ timeout: 300 });
        clicks++;
      } catch {
        // pode ter desaparecido entretanto, ok
      }
    }
    await page.waitForTimeout(150);
  }
  console.log(`   Cliques bem sucedidos: ${clicks}`);

  console.log("A aguardar o fim do mini-jogo e avanço automático...");
  await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 8000 });
  const infoAfter = await page.locator("#solo-letter-info").textContent();
  console.log(`   OK: avançou — ${infoAfter}`);

  const arenaEmpty = await page.locator(".bug-arena .bug").count();
  console.log(`   Insetos residuais na arena após terminar: ${arenaEmpty} (esperado 0)`);
  if (arenaEmpty !== 0) process.exitCode = 1;
}

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
