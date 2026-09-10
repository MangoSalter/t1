import { chromium } from "playwright";
import { entrarNoSolo, abrirBrowser } from "./test-helpers.mjs";

// A lista dos ecras de mini-jogo tem de estar COMPLETA: estes testes
// esperam que a run caia num deles, e quando saiu um jogo novo (memoria,
// mapa) a espera rebentava por timeout num jogo perfeitamente valido.
const MINIGAME_SCREENS = ["solo-minigame", "solo-minigame-word", "solo-minigame-bug", "solo-minigame-monkey", "solo-minigame-memory", "solo-minigame-map"];

const browser = await abrirBrowser(chromium);
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html?oficina=1", { waitUntil: "networkidle" });

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
  // A lista tem de ser PASSADA para o browser: o callback corre la dentro,
  // onde a constante do Node nao existe.
  await page.waitForFunction(
    (screens) => screens.some((id) => {
      const el = document.querySelector(`[data-screen="${id}"]`);
      return el && el.classList.contains("active");
    }),
    MINIGAME_SCREENS,
    { timeout: 15000 }
  );
}

async function currentMinigame() {
  for (const id of MINIGAME_SCREENS) {
    const active = await page.locator(`[data-screen="${id}"].active`).count();
    if (active > 0) return id;
  }
  return null;
}

// PELA PORTA, e não à sorte.
//
// Isto jogava rondas clássicas até o bónus aleatório calhar no Cada Macaco,
// com dezasseis tentativas de teto. Com cinco jogos no sorteio, a hipótese de
// nunca calhar em dezasseis é de uns 3% — e foi o que aconteceu numa corrida
// destas: vermelho sem nada partido. Um teste que falha três vezes em cem
// ensina a ignorar o vermelho, que é o pior que um teste pode fazer.
//
// O menu tem um botão para cada mini-jogo. Entra-se por ele: fica
// determinista e passa de 28s para poucos segundos.
await entrarNoSolo(page);
await page.click("#solo-play-monkey-btn");
await page.waitForSelector("#ready-overlay:not(.hidden) #ready-start-btn", { timeout: 8000 });
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-monkey"].active', { timeout: 8000 });

{
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

  // Acabar o jogo e confirmar que a arena fica limpa. O "e a seguir volta-se
  // à escolha de letra" saiu daqui com o sorteio: isso é o caminho da
  // maratona, não é do Cada Macaco, e é exercitado por todos os casos do solo
  // que passam por um bónus (ver backToLetterpick em test-helpers).
  console.log("A acabar o mini-jogo e a ver a arena limpa...");
  await page.click("#game-hud-skip-btn");
  await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 8000 });
  const residual = await page.locator(".falling-monkey").count();
  console.log(`   Macacos residuais na arena após terminar: ${residual} (esperado 0)`);
  if (residual !== 0) process.exitCode = 1;
}

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
