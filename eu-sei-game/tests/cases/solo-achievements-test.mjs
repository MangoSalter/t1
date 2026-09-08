// Conquistas: têm de aparecer ao desbloquear, ficar guardadas entre
// recarregamentos, e ser atribuídas retroativamente a quem já cumpriu.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://localhost:8936/index.html?oficina=1", { waitUntil: "networkidle" });

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

// NENHUMA CONQUISTA PODE SER IMPOSSÍVEL DE GANHAR.
//
// O "Provaste tudo" pedia os DOZE mini-jogos e o "Curioso" pedia cinco, mas
// desde que oito foram para a oficina só quatro estão à frente de quem entra
// no site. As duas ficaram impossíveis no dia do corte, sem ninguém dar por
// isso — e uma conquista impossível é pior do que não existir: está no ecrã,
// bloqueada, a prometer uma coisa que nunca acontece.
//
// A regra que fica: com os jogos que o menu MOSTRA, jogados todos e muitas
// vezes, tudo tem de desbloquear.
console.log("6) Com os jogos que o menu mostra, todas as conquistas são alcançáveis...");
// A oficina fica ABERTA em localStorage desde o passo 1 (?oficina=1). Sem a
// fechar, este passo contava os doze e passava sem querer dizer nada — foi
// o que fez à primeira.
await page.evaluate(() => localStorage.removeItem("euSei_oficina"));
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
const jogosAVista = await page.evaluate(() => document.querySelectorAll(
  '[data-screen="solo-menu"] button[id^="solo-play-"]:not([hidden])',
).length);
const impossiveis = await page.evaluate(async (n) => {
  const { ACHIEVEMENTS } = await import("./js/data.js");
  // Uma conta de alguém que jogou TUDO o que há, muitas vezes, e bem.
  const favorites = {};
  for (let i = 0; i < n; i++) favorites[`jogo${i}`] = 30;
  const conta = {
    xp: 999999, gamesPlayed: 9999, bestCombo: 999, bestHangmanStreak: 999,
    favorites, distinctGames: n, totalGames: n, runs: 999, bestScore: 999999,
  };
  return ACHIEVEMENTS.filter((a) => !a.check(conta)).map((a) => `${a.name} (${a.desc})`);
}, jogosAVista);
console.log(`   mini-jogos à vista no menu: ${jogosAVista}`);
console.log(`   conquistas impossíveis: ${impossiveis.length ? impossiveis.join(" · ") : "nenhuma"}`);
if (jogosAVista === 0) { console.log("   FALHOU: não encontrei os botões do menu — a medição não diz nada"); process.exitCode = 1; }
if (impossiveis.length > 0) {
  console.log(`   FALHOU: estas conquistas não se ganham com ${jogosAVista} jogos à vista`);
  process.exitCode = 1;
}

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
