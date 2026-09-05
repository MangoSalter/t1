import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

console.log("0) Limpar histórico local antes de testar...");
await page.evaluate(() => localStorage.removeItem("euSei_soloScoreHistory"));

console.log("1) Recordes vazio mostra mensagem...");
await page.click("#solo-menu-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
await page.click("#solo-leaderboard-btn");
await page.waitForSelector('[data-screen="solo-leaderboard"].active', { timeout: 3000 });
const emptyText = await page.locator("#solo-leaderboard-list").textContent();
console.log(`   ${emptyText.trim()}`);
if (!emptyText.includes("Ainda não há pontuações")) {
  console.log("   FALHOU: esperava mensagem de tabela vazia");
  process.exitCode = 1;
}
await page.click('[data-screen="solo-leaderboard"] [data-solo-leave]');
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });

console.log("2) Jogar 1 ronda clássica e falhar de propósito (deixar tudo em branco) para terminar a run...");
await page.click("#solo-classic-btn");
await page.waitForSelector('[data-screen="solo-setup"].active', { timeout: 3000 });
await page.click("#solo-setup-start-btn");
await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
await page.locator("#solo-letter-buttons .letter-btn").first().click();
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 3000 });
await page.click("#solo-finish-btn"); // sem respostas -> 0 corretas -> falha -> fim da run
await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 3000 });
const resultTitle = await page.locator("#solo-result-title").textContent();
console.log(`   ${resultTitle}`);
await page.click('[data-screen="solo-result"] [data-solo-leave]');
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });

console.log("3) Confirmar que a run apareceu nos recordes...");
await page.click("#solo-leaderboard-btn");
await page.waitForSelector('[data-screen="solo-leaderboard"].active', { timeout: 3000 });
const rows1 = await page.locator(".leaderboard-row").count();
console.log(`   linhas na tabela: ${rows1}`);
if (rows1 !== 1) {
  console.log("   FALHOU: esperava exatamente 1 linha após 1 run terminada");
  process.exitCode = 1;
}
const row1Text = await page.locator(".leaderboard-row").first().textContent();
console.log(`   ${row1Text.trim()}`);
if (!row1Text.includes("Clássico") || !row1Text.includes("0 pts")) {
  console.log("   FALHOU: linha não corresponde ao esperado (Clássico, 0 pts)");
  process.exitCode = 1;
}

console.log("4) Injetar histórico falso para testar ordenação e limite de 20...");
await page.evaluate(() => {
  const history = [];
  for (let i = 0; i < 25; i++) {
    history.push({ score: i * 10, mode: "Teste", detail: "injetado", date: Date.now() });
  }
  history.sort((a, b) => b.score - a.score);
  localStorage.setItem("euSei_soloScoreHistory", JSON.stringify(history.slice(0, 20)));
});
await page.click('[data-screen="solo-leaderboard"] [data-solo-leave]');
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 3000 });
await page.click("#solo-leaderboard-btn");
await page.waitForSelector('[data-screen="solo-leaderboard"].active', { timeout: 3000 });
const rows2 = await page.locator(".leaderboard-row").count();
const firstScore = await page.locator(".leaderboard-row").first().locator(".leaderboard-score").textContent();
const lastScore = await page.locator(".leaderboard-row").last().locator(".leaderboard-score").textContent();
console.log(`   linhas: ${rows2}, primeira: ${firstScore.trim()}, última: ${lastScore.trim()}`);
if (rows2 !== 20 || firstScore.trim() !== "240 pts" || lastScore.trim() !== "50 pts") {
  console.log("   FALHOU: esperava 20 linhas ordenadas de 240 pts a 50 pts");
  process.exitCode = 1;
}

await browser.close();

console.log("\n--- Erros ---");
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
