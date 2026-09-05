import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Abrir Onde Fica Isto? avulso...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-landmark-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-landmark"].active', { timeout: 3000 });
console.log("   OK: no ecrã do jogo");

console.log("2) Jogar as 8 rondas, tentando sempre acertar (testa cada opção até acertar, deteta pela cor)...");
let correctCount = 0;
const seenIds = new Set();
for (let round = 1; round <= 8; round++) {
  await page.waitForFunction((r) => document.getElementById("landmark-round-info").textContent.includes(`${r}/8`), round, { timeout: 3000 });
  const svgHtml = await page.locator("#landmark-image svg").innerHTML();
  if (seenIds.has(svgHtml)) { console.log(`   FALHOU: marco repetido na ronda ${round}`); process.exitCode = 1; }
  seenIds.add(svgHtml);
  const options = await page.locator(".landmark-option-btn").all();
  if (options.length !== 4) { console.log("   FALHOU: não há 4 opções"); process.exitCode = 1; }
  // Clica em cada opção até acertar (o jogo trava depois da 1ª escolha, por isso
  // descobre-se a certa jogando várias rondas — aqui simplificamos: usa a
  // dica visível no status depois de errar, na PRÓXIMA ronda tentaríamos essa,
  // mas como cada ronda é um marco novo, o mais simples é aceitar erros e
  // confirmar que o feedback está correto.
  await options[0].click();
  await page.waitForTimeout(200);
  const status = await page.locator("#landmark-status").textContent();
  if (status.startsWith("Certo")) correctCount++;
  const correctBtnCount = await page.locator(".landmark-option-btn.correct-flash").count();
  if (correctBtnCount !== 1) { console.log(`   FALHOU: devia haver exatamente 1 opção marcada como certa (ronda ${round})`); process.exitCode = 1; }
  await page.waitForTimeout(1300);
}
console.log(`   marcos únicos vistos: ${seenIds.size}/8 (esperado 8, sem repetição)`);
if (seenIds.size !== 8) { console.log("   FALHOU"); process.exitCode = 1; }
console.log(`   acertos (clicando sempre na 1ª opção): ${correctCount}/8`);

console.log("3) Confirmar ecrã de fim...");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
const mgeTitle = await page.locator("#mge-title").textContent();
console.log(`   ${mgeTitle}`);
if (!mgeTitle.includes("Onde Fica Isto")) { console.log("   FALHOU"); process.exitCode = 1; }
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: voltou ao menu");

console.log("4) Testar tempo esgotado (não clicar em nada)...");
await page.click("#solo-play-landmark-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-landmark"].active', { timeout: 3000 });
await page.waitForFunction(() => document.getElementById("landmark-status").textContent.includes("Tempo esgotado"), { timeout: 12000 });
console.log("   OK: tempo esgotado detetado corretamente");
await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
await page.click("#mge-exit-btn");

console.log("5) Testar dentro da maratona (sozinho selecionado)...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="reflex"]');
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="bug"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
await page.uncheck('[data-marathon-game="map"]');
await page.check('[data-marathon-game="landmark"]');
await page.click("#solo-marathon-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-landmark"].active', { timeout: 3000 });
console.log("   OK: maratona entrou direto no Onde Fica Isto?");

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
