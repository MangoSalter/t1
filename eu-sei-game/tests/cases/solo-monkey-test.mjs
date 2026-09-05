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
    () => ["solo-minigame", "solo-minigame-word", "solo-minigame-bug", "solo-minigame-monkey"].some((id) => {
      const el = document.querySelector(`[data-screen="${id}"]`);
      return el && el.classList.contains("active");
    }),
    { timeout: 3000 }
  );
}

async function currentMinigame() {
  for (const id of ["solo-minigame", "solo-minigame-word", "solo-minigame-bug", "solo-minigame-monkey"]) {
    const active = await page.locator(`[data-screen="${id}"].active`).count();
    if (active > 0) return id;
  }
  return null;
}

await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");

let found = false;
for (let attempt = 0; attempt < 16 && !found; attempt++) {
  await playRoundToMinigame();
  const which = await currentMinigame();
  console.log(`Tentativa ${attempt + 1}: calhou ${which}`);
  if (which === "solo-minigame-monkey") {
    found = true;
  } else if (which === "solo-minigame") {
    await page.click("#solo-mg-circle");
    await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
  } else if (which === "solo-minigame-word") {
    await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 16000 });
  } else if (which === "solo-minigame-bug") {
    await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 12000 });
  }
}

if (!found) {
  console.log("AVISO: não calhou Cada Macaco no Seu Galho em 16 tentativas.");
  process.exitCode = 1;
} else {
  console.log("A verificar que o apanhador segue o rato...");
  const arenaBox = await page.locator("#monkey-arena").boundingBox();
  await page.mouse.move(arenaBox.x + 50, arenaBox.y + 100);
  await page.waitForTimeout(100);
  const catcherLeft1 = await page.locator("#monkey-catcher").evaluate((el) => el.style.left);
  await page.mouse.move(arenaBox.x + 250, arenaBox.y + 100);
  await page.waitForTimeout(100);
  const catcherLeft2 = await page.locator("#monkey-catcher").evaluate((el) => el.style.left);
  console.log(`   Posição antes: ${catcherLeft1}, depois: ${catcherLeft2} (devem ser diferentes)`);
  if (catcherLeft1 === catcherLeft2) {
    console.log("   FALHOU: o apanhador não se moveu com o rato");
    process.exitCode = 1;
  }

  console.log("A tentar apanhar macacos durante ~6s, seguindo-os com o rato...");
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const monkeys = await page.locator(".falling-monkey").all();
    if (monkeys.length > 0) {
      // segue o macaco mais próximo do fundo (maior "top")
      let best = null;
      let bestTop = -Infinity;
      for (const m of monkeys) {
        const top = await m.evaluate((el) => parseFloat(el.style.top));
        if (top > bestTop) { bestTop = top; best = m; }
      }
      if (best) {
        const left = await best.evaluate((el) => parseFloat(el.style.left));
        await page.mouse.move(arenaBox.x + left, arenaBox.y + 100);
      }
    }
    await page.waitForTimeout(80);
  }

  console.log("A aguardar o fim do mini-jogo e avanço automático...");
  await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 8000 });
  const infoAfter = await page.locator("#solo-letter-info").textContent();
  console.log(`   OK: avançou — ${infoAfter}`);

  const residual = await page.locator(".falling-monkey").count();
  console.log(`   Macacos residuais na arena após terminar: ${residual} (esperado 0)`);
  if (residual !== 0) process.exitCode = 1;
}

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
