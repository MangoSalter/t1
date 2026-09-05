// Caos da Dona Manga: tem de aparecer a meio de um jogo, tem de PODER ser
// desligado, e — o mais importante — nenhum evento pode tirar vidas, tempo
// ou pontos, nem engolir cliques.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

console.log("1) REGRA DE DESENHO: nenhum evento pode tirar vidas/tempo/pontos...");
const evs = await page.evaluate(async () => (await import("./js/data.js")).CHAOS_EVENTS);
console.log(`   eventos: ${evs.map((e) => `${e.id}(${e.kind})`).join(", ")}`);
const allowed = new Set(["paw", "wobble", "bonus"]);
const bad = evs.filter((e) => !allowed.has(e.kind) || (e.bonus !== undefined && e.bonus < 0));
console.log(`   eventos que podiam prejudicar: ${JSON.stringify(bad.map((e) => e.id))} (esperado nenhum)`);
if (bad.length > 0) { console.log("   FALHOU"); process.exitCode = 1; }
const tooLong = evs.filter((e) => e.ms > 6000);
if (tooLong.length > 0) { console.log(`   FALHOU: ${tooLong.map((e) => e.id)} duram demasiado`); process.exitCode = 1; }

console.log("2) A pata nunca engole cliques (pointer-events: none)...");
const pawPE = await page.evaluate(() => getComputedStyle(document.getElementById("chaos-paw")).pointerEvents);
console.log(`   pointer-events da pata: ${pawPE} (esperado none)`);
if (pawPE !== "none") { console.log("   FALHOU: um clique decisivo podia ser engolido"); process.exitCode = 1; }

console.log("3) Dispara mesmo a meio de um jogo...");
// A Memória é o único mini-jogo sem pressão de tempo na fase de escolha: o
// HUD fica de pé até se confirmar. Os outros ou acabam depressa (Mata o
// Inseto) ou matam quem não se mexe (Kota Corre!), e o evento — que cai
// entre os 6 e os 14 segundos — podia nunca chegar a tempo. Assim o teste
// falha por defeito, não por azar de temporização.
await page.click("#solo-menu-btn");
await page.click("#solo-play-memory-btn");
await page.waitForSelector('[data-screen="solo-memory-setup"].active', { timeout: 5000 });
await page.click("#memory-setup-start-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 }).catch(() => {});
if (await page.locator("#ready-overlay").isVisible()) await page.click("#ready-start-btn");
await page.waitForTimeout(300);
// Forçar o evento em vez de esperar 6-14s reais.
const fired = await page.evaluate(async () => {
  const d = await import("./js/data.js");
  return d.CHAOS_EVENTS.map((e) => e.id);
});
await page.evaluate(() => {
  const b = document.getElementById("chaos-banner");
  return b && !b.classList.contains("hidden");
});
await page.waitForFunction(() => !document.getElementById("chaos-banner").classList.contains("hidden"), null, { timeout: 20000 });
const bannerText = await page.locator("#chaos-banner").textContent();
const bannerVisible = await page.locator("#chaos-banner").isVisible();
console.log(`   visível: ${bannerVisible} — "${bannerText}"`);
if (!bannerVisible || !bannerText.trim()) { console.log("   FALHOU"); process.exitCode = 1; }
if (!/Dona Manga|Brasa/.test(bannerText)) { console.log("   FALHOU: devia ser uma das mascotes"); process.exitCode = 1; }

console.log("4) O efeito passa sozinho (não fica preso no ecrã)...");
await page.waitForFunction(() => document.getElementById("chaos-banner").classList.contains("hidden"), null, { timeout: 10000 });
const pawStillOn = await page.locator("#chaos-paw").isVisible();
const wobbleStuck = await page.locator(".chaos-wobble").count();
console.log(`   pata ainda visível: ${pawStillOn}, ecrãs a abanar: ${wobbleStuck} (esperado false/0)`);
if (pawStillOn || wobbleStuck > 0) { console.log("   FALHOU: o efeito ficou preso"); process.exitCode = 1; }

console.log("5) Se calhou o bónus do Brasa, ele aparece mesmo no fim (não é só texto no banner)...");
const gotBonus = bannerText.includes("Brasa");
// O jogo pode já ter acabado sozinho durante a espera do passo 4 — nesse
// caso o ecrã de fim já está à espera e não há nada para saltar.
if (await page.locator("#game-hud-skip-btn").isVisible()) await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 15000 });
const endPoints = await page.locator("#mge-points").textContent();
console.log(`   fim: "${endPoints}" (evento do Brasa: ${gotBonus})`);
if (gotBonus && !endPoints.includes("Brasa")) { console.log("   FALHOU: o bónus prometido não chegou aos pontos"); process.exitCode = 1; }
if (!gotBonus && endPoints.includes("Brasa")) { console.log("   FALHOU: bónus sem evento"); process.exitCode = 1; }

console.log("6) Sair do jogo limpa tudo (nada transita para o menu)...");
await page.click("#mge-exit-btn");
await page.waitForTimeout(300);
const leftovers = await page.evaluate(() => ({
  banner: !document.getElementById("chaos-banner").classList.contains("hidden"),
  paw: !document.getElementById("chaos-paw").classList.contains("hidden"),
  wobble: document.querySelectorAll(".chaos-wobble").length,
}));
console.log(`   restos: ${JSON.stringify(leftovers)}`);
if (leftovers.banner || leftovers.paw || leftovers.wobble > 0) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("7) Dá para DESLIGAR, e aí não dispara nada...");
await page.click("#solo-chaos-toggle");
const stored = await page.evaluate(() => localStorage.getItem("euSei_soloChaos"));
console.log(`   preferência guardada: ${stored} (esperado off)`);
if (stored !== "off") { console.log("   FALHOU"); process.exitCode = 1; }
await page.click("#solo-play-memory-btn");
await page.waitForSelector('[data-screen="solo-memory-setup"].active', { timeout: 5000 });
await page.click("#memory-setup-start-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 }).catch(() => {});
if (await page.locator("#ready-overlay").isVisible()) await page.click("#ready-start-btn");
await page.waitForTimeout(16000);
const firedWhileOff = await page.locator("#chaos-banner").isVisible();
console.log(`   apareceu algum evento com o caos desligado: ${firedWhileOff} (esperado false)`);
if (firedWhileOff) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("8) A preferência sobrevive a um recarregamento...");
await page.reload({ waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
const checked = await page.locator("#solo-chaos-toggle").isChecked();
console.log(`   caixa marcada depois de recarregar: ${checked} (esperado false)`);
if (checked) { console.log("   FALHOU"); process.exitCode = 1; }

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
