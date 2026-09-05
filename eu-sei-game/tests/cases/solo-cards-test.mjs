import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Entrar no jogo solo e abrir 'Descartando Juntos'...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-cards-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-cards"].active', { timeout: 3000 });
console.log("   OK: no ecrã do jogo de cartas");

async function handCount() {
  return page.locator(".card-hand-area .playing-card").count();
}

console.log("2) Confirmar mao inicial de 7 cartas e stats...");
const initialHand = await handCount();
console.log(`   Cartas na mão: ${initialHand} (esperado 7)`);
if (initialHand !== 7) { console.log("   FALHOU"); process.exitCode = 1; }
const statsText = await page.locator("#card-stats").textContent();
console.log(`   Stats: ${statsText}`);
if (!statsText.includes("Jogadas: 4") || !statsText.includes("Descartes: 3")) {
  console.log("   FALHOU: contadores iniciais errados");
  process.exitCode = 1;
}

console.log("3) Selecionar 1 carta e jogar (deve dar pelo menos 'Carta Alta')...");
await page.locator(".card-hand-area .playing-card").first().click();
const preview = await page.locator("#card-hand-type-preview").textContent();
console.log(`   Preview: ${preview}`);
if (!preview.includes("Carta Alta")) { console.log("   FALHOU: devia mostrar Carta Alta para 1 carta"); process.exitCode = 1; }
await page.click("#card-play-btn");
await page.waitForTimeout(200);
const playArea = await page.locator("#card-play-area").textContent();
console.log(`   Resultado da jogada: ${playArea}`);
if (!playArea.includes("pts")) { console.log("   FALHOU: nao mostrou resultado da jogada"); process.exitCode = 1; }
const handAfterPlay = await handCount();
console.log(`   Mão depois de jogar (deve voltar a 7, puxou carta nova): ${handAfterPlay}`);
if (handAfterPlay !== 7) { console.log("   FALHOU"); process.exitCode = 1; }
const statsAfter1 = await page.locator("#card-stats").textContent();
console.log(`   Stats depois: ${statsAfter1} (esperado Jogadas: 3)`);
if (!statsAfter1.includes("Jogadas: 3")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("4) Testar descarte: selecionar 2 cartas e descartar...");
await page.locator(".card-hand-area .playing-card").nth(0).click();
await page.locator(".card-hand-area .playing-card").nth(1).click();
await page.click("#card-discard-btn");
await page.waitForTimeout(200);
const statsAfterDiscard = await page.locator("#card-stats").textContent();
console.log(`   Stats depois do descarte: ${statsAfterDiscard} (esperado Descartes: 2)`);
if (!statsAfterDiscard.includes("Descartes: 2")) { console.log("   FALHOU"); process.exitCode = 1; }
const handAfterDiscard = await handCount();
if (handAfterDiscard !== 7) { console.log("   FALHOU: mão devia voltar a 7 depois do descarte"); process.exitCode = 1; }

console.log("5) Jogar até vencer o 1º blind ou esgotar jogadas, e confirmar loja de coringas...");
// Joga agressivamente até vencer ou esgotar jogadas, usando
// sempre a maior mão possível (5 cartas) para maximizar pontos por jogada.
async function playBestAvailable() {
  const cards = await page.locator(".card-hand-area .playing-card").all();
  const n = Math.min(5, cards.length);
  for (let i = 0; i < n; i++) await cards[i].click();
  await page.click("#card-play-btn");
  await page.waitForTimeout(150);
}

let attempts = 0;
while (attempts < 6) {
  attempts++;
  const stats = await page.locator("#card-stats").textContent();
  console.log(`   tentativa ${attempts}: ${stats}`);
  const shopVisible = await page.locator("#card-shop-panel").isVisible();
  const resultVisible = await page.locator("#minigame-end-overlay").isVisible().catch(() => false);
  if (shopVisible || resultVisible) break;
  const playsLeftMatch = stats.match(/Jogadas: (\d+)/);
  if (playsLeftMatch && parseInt(playsLeftMatch[1], 10) <= 0) break;
  await playBestAvailable();
}

const shopVisible = await page.locator("#card-shop-panel").isVisible();
const resultVisible = await page.locator("#minigame-end-overlay").isVisible().catch(() => false);
console.log(`   loja visível: ${shopVisible}, ecrã de fim visível: ${resultVisible}`);

if (shopVisible) {
  console.log("6) Comprar um coringa na loja...");
  const buyBtns = await page.locator("#card-shop-offers button").all();
  if (buyBtns.length > 0) {
    const enabled = await buyBtns[0].isEnabled();
    console.log(`   botão de compra disponível: ${enabled}`);
    if (enabled) {
      await buyBtns[0].click();
      await page.waitForTimeout(200);
      const jokerRowVisible = await page.locator("#card-joker-row").isVisible();
      console.log(`   linha de coringas visível depois da compra: ${jokerRowVisible}`);
      if (!jokerRowVisible) { console.log("   FALHOU: coringa comprado devia aparecer"); process.exitCode = 1; }
    }
  }
  console.log("7) Continuar para o próximo blind...");
  await page.click("#card-shop-continue-btn");
  await page.waitForTimeout(200);
  const blindInfo = await page.locator("#card-blind-info").textContent();
  console.log(`   ${blindInfo} (esperado Blind 2/5)`);
  if (!blindInfo.includes("Blind 2/5")) { console.log("   FALHOU"); process.exitCode = 1; }
  const handAfterShop = await handCount();
  if (handAfterShop !== 7) { console.log("   FALHOU: mão devia ter 7 cartas no novo blind"); process.exitCode = 1; }
} else if (resultVisible) {
  console.log("6) Perdeu o 1º blind antes de tempo (mão azarada) — ainda válido, testa o ecrã de fim.");
} else {
  console.log("   AVISO: nem loja nem ecrã de fim apareceram depois de 6 tentativas");
  process.exitCode = 1;
}

console.log("8) Sair a meio do jogo via o botão de saltar do HUD e confirmar ecrã de fim...");
if (!resultVisible) {
  await page.click("#game-hud-skip-btn");
  await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
}
const mgeTitle = await page.locator("#mge-title").textContent();
console.log(`   ${mgeTitle} (esperado mencionar Descartando Juntos)`);
if (!mgeTitle.includes("Descartando Juntos")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("9) Clicar 'Sair' e confirmar volta ao menu solo...");
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: voltou ao menu solo");

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS DE CONSOLA:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
