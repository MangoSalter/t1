// Conquistas: têm de aparecer ao desbloquear, ficar guardadas entre
// recarregamentos, e ser atribuídas retroativamente a quem já cumpriu.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("1) Conta nova: ecrã de conquistas abre e mostra tudo bloqueado...");
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
await page.click("#solo-achievements-btn");
await page.waitForSelector('[data-screen="solo-achievements"].active', { timeout: 3000 });
const total = await page.locator("#solo-achievements-list .achievement-row").count();
const locked = await page.locator("#solo-achievements-list .achievement-locked").count();
const count = await page.locator("#solo-achievements-count").textContent();
console.log(`   ${count} — ${locked}/${total} bloqueadas`);
if (total === 0 || locked !== total) { console.log("   FALHOU: numa conta nova devia estar tudo bloqueado"); process.exitCode = 1; }
const hint = await page.locator("#solo-achievements-hint").textContent();
console.log(`   pista do que falta: "${hint}"`);
if (!hint.includes("A seguir")) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("2) Jogar um mini-jogo até ao fim -> 'Primeira vez' desbloqueia e é anunciada...");
await page.click('.screen.active [data-solo-leave]');
await page.click("#solo-play-reflex-btn");
await page.waitForSelector('[data-screen="solo-reflex-setup"].active', { timeout: 5000 });
await page.click("#reflex-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForTimeout(300);
// Saltar o jogo conta como terminar (o fim é o mesmo ecrã).
await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 8000 });
const quip = await page.locator("#mge-quip").textContent();
const quipVisible = await page.locator("#mge-quip").isVisible();
console.log(`   anúncio: "${quip}" (visível: ${quipVisible})`);
if (!quipVisible || !quip.includes("Conquista")) { console.log("   FALHOU: devia anunciar a conquista nova"); process.exitCode = 1; }
if (!quip.includes("Primeira vez")) { console.log("   FALHOU: a primeira devia ser 'Primeira vez'"); process.exitCode = 1; }

console.log("3) Sobrevive a um recarregamento (fica no localStorage)...");
const stored = await page.evaluate(() => localStorage.getItem("euSei_soloAchievements"));
console.log(`   guardado: ${stored}`);
await page.reload({ waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
await page.click("#solo-achievements-btn");
await page.waitForSelector('[data-screen="solo-achievements"].active', { timeout: 3000 });
const unlockedAfter = await page.locator("#solo-achievements-list .achievement-row:not(.achievement-locked)").count();
console.log(`   desbloqueadas depois de recarregar: ${unlockedAfter} (esperado >= 1)`);
if (unlockedAfter < 1) { console.log("   FALHOU"); process.exitCode = 1; }
const quipShown = await page.locator("#solo-achievements-list .achievement-quip").first().textContent();
console.log(`   fala da mascote na conquista: "${quipShown}"`);
if (!quipShown || quipShown.trim().length === 0) { console.log("   FALHOU: devia mostrar a fala"); process.exitCode = 1; }

console.log("4) Retroativas: uma conta com muito XP/jogos desbloqueia várias de uma vez...");
await page.evaluate(() => {
  localStorage.setItem("euSei_soloAchievements", "[]");
  localStorage.setItem("euSei_soloAccount", JSON.stringify({
    xp: 2500, gamesPlayed: 60, bestCombo: 9, bestHangmanStreak: 6,
    favorites: { reflex: 20, word: 3, bug: 2, memory: 2, golf: 2 },
  }));
});
await page.reload({ waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
await page.click("#solo-achievements-btn");
await page.waitForSelector('[data-screen="solo-achievements"].active', { timeout: 3000 });
// Abrir o ecrã tem de bastar: quem já cumpre o critério não devia ter de
// jogar mais uma vez só para a conquista aparecer.
const beforePlay = await page.locator("#solo-achievements-list .achievement-row:not(.achievement-locked)").count();
console.log(`   logo ao abrir o ecrã (sem jogar): ${beforePlay} desbloqueadas (esperado >= 8)`);
if (beforePlay < 8) { console.log("   FALHOU: devia avaliar ao abrir"); process.exitCode = 1; }
await page.evaluate(() => localStorage.setItem("euSei_soloAchievements", "[]"));
await page.click('.screen.active [data-solo-leave]');
await page.click("#solo-play-reflex-btn");
await page.waitForSelector('[data-screen="solo-reflex-setup"].active', { timeout: 5000 });
await page.click("#reflex-setup-start-btn");
await page.click("#ready-start-btn");
await page.waitForTimeout(300);
await page.click("#game-hud-skip-btn");
await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 8000 });
const bulkQuip = await page.locator("#mge-quip").textContent();
console.log(`   anúncio em lote: "${bulkQuip}"`);
if (!bulkQuip.includes("(+")) { console.log("   FALHOU: devia dizer quantas mais desbloquearam de uma vez"); process.exitCode = 1; }
await page.click("#mge-exit-btn");
await page.click("#solo-achievements-btn");
await page.waitForSelector('[data-screen="solo-achievements"].active', { timeout: 3000 });
const bulkUnlocked = await page.locator("#solo-achievements-list .achievement-row:not(.achievement-locked)").count();
console.log(`   desbloqueadas: ${bulkUnlocked}/${total} (esperado >= 8 com esta conta)`);
if (bulkUnlocked < 8) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) O jogo favorito passa a sobreviver ao recarregamento (era perdido antes)...");
await page.click('.screen.active [data-solo-leave]');
await page.click("#solo-leaderboard-btn");
await page.waitForSelector('[data-screen="solo-leaderboard"].active', { timeout: 3000 });
const chips = await page.locator("#solo-leaderboard-stats .stat-chip").allTextContents();
const favChip = chips.find((c) => c.includes("favorito"));
console.log(`   ${favChip}`);
if (!favChip || favChip.includes("—")) { console.log("   FALHOU: o favorito devia vir do que ficou guardado"); process.exitCode = 1; }

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
