import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Abrir Mapa-Múndi avulso...");
await page.click("#solo-menu-btn");
await page.click("#solo-play-map-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-map"].active', { timeout: 3000 });
const svgLandCount = await page.locator(".map-land").count();
console.log(`   regiões coloridas no mapa: ${svgLandCount} (esperado > 0, mapa decorativo)`);
if (svgLandCount === 0) { console.log("   FALHOU: mapa sem massas de terra desenhadas"); process.exitCode = 1; }
const pinCount = await page.locator(".map-pin").count();
console.log(`   pins clicáveis: ${pinCount} (esperado 0, agora é resposta escrita)`);
if (pinCount !== 0) { console.log("   FALHOU: ainda há pins clicáveis"); process.exitCode = 1; }

console.log("2) Jogar 8 rondas escrevendo sempre a primeira resposta válida do critério...");
let correctCount = 0;
for (let round = 1; round <= 8; round++) {
  await page.waitForFunction((r) => document.getElementById("map-round-info").textContent.includes(`${r}/8`), round, { timeout: 3000 });
  const prompt = await page.locator("#map-prompt").textContent();
  const promptLower = prompt.toLowerCase();
  let guess;
  if (promptLower.includes("inglês")) guess = "Estados Unidos";
  else if (promptLower.includes("euro")) guess = "Portugal";
  else if (promptLower.includes("áfrica")) guess = "Angola";
  else if (promptLower.includes("ásia")) guess = "China";
  else if (promptLower.includes("europa")) guess = "França";
  else if (promptLower.includes("américa do norte")) guess = "Canadá";
  else if (promptLower.includes("américa do sul")) guess = "Brasil";
  else if (promptLower.includes("oceânia")) guess = "Austrália";
  else guess = "Portugal"; // fallback, não devia acontecer
  console.log(`   Ronda ${round}: "${prompt}" -> tentando "${guess}"`);
  await page.fill("#map-answer-input", guess);
  await page.click("#map-answer-submit-btn");
  await page.waitForTimeout(200);
  const status = await page.locator("#map-status").textContent();
  console.log(`      status: ${status}`);
  if (status.startsWith("Certo")) correctCount++;
  await page.waitForTimeout(900); // espera o avanço automático para a próxima ronda
}
console.log(`   Acertos: ${correctCount}/8 (esperado alto, idealmente 8/8 se as respostas cobrem os critérios)`);
if (correctCount < 6) { console.log("   FALHOU: taxa de acerto suspeitosamente baixa — critério/validação pode estar errada"); process.exitCode = 1; }

console.log("3) Confirmar ecrã de fim (pontos/XP) e clicar Sair para voltar ao menu...");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 3000 });
const mgeTitle = await page.locator("#mge-title").textContent();
console.log(`   ${mgeTitle}`);
if (!mgeTitle.includes("Mapa-Múndi")) { console.log("   FALHOU"); process.exitCode = 1; }
await page.click("#mge-exit-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
console.log("   OK: voltou ao menu");

console.log("4) Testar normalização de maiúsculas/acentos diretamente na função pura...");
const normResults = await page.evaluate(async () => {
  const mod = await import("./js/data.js");
  return {
    upper: mod.normalizeCountryName("PORTUGAL") === mod.normalizeCountryName("Portugal"),
    accent: mod.normalizeCountryName("frança") === mod.normalizeCountryName("França"),
    spaces: mod.normalizeCountryName("  Angola  ") === mod.normalizeCountryName("Angola"),
  };
});
console.log(`   maiúsculas iguais: ${normResults.upper}, acentos iguais: ${normResults.accent}, espaços ignorados: ${normResults.spaces}`);
if (!normResults.upper || !normResults.accent || !normResults.spaces) {
  console.log("   FALHOU: normalizeCountryName não está a normalizar como esperado");
  process.exitCode = 1;
}

console.log("5) Testar dentro da maratona (sozinho selecionado)...");
await page.click("#solo-marathon-menu-btn");
await page.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 3000 });
await page.uncheck('[data-marathon-game="reflex"]');
await page.uncheck('[data-marathon-game="word"]');
await page.uncheck('[data-marathon-game="bug"]');
await page.uncheck('[data-marathon-game="monkey"]');
await page.uncheck('[data-marathon-game="memory"]');
const mapChecked = await page.locator('[data-marathon-game="map"]').isChecked();
console.log(`   map checked por omissão: ${mapChecked}`);
await page.click("#solo-marathon-start-btn");
await page.click("#ready-start-btn");
await page.waitForSelector('[data-screen="solo-minigame-map"].active', { timeout: 3000 });
console.log("   OK: maratona entrou direto no Mapa-Múndi");

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
