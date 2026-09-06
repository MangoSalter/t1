import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) No ecrã inicial (fora de sala), o botão flutuante de Opções deve estar escondido...");
const fabHiddenAtHome = await page.locator("#options-fab").evaluate((el) => el.classList.contains("hidden"));
console.log(`   escondido: ${fabHiddenAtHome} (esperado true)`);
if (!fabHiddenAtHome) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("2) Criar sala -> o botão de Opções deve aparecer...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
await page.evaluate((code) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 42, connected: true },
    p3: { name: "Carla", score: 7, connected: true },
  });
}, code);
await page.waitForTimeout(200);
const fabVisibleInRoom = await page.locator("#options-fab").isVisible();
console.log(`   visível: ${fabVisibleInRoom} (esperado true)`);
if (!fabVisibleInRoom) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Abrir Opções -> mostra classificação ordenada por pontos...");
await page.click("#options-fab");
await page.waitForSelector("#options-overlay:not(.hidden)", { timeout: 3000 });
const rows = await page.locator("#options-leaderboard-list .score-row").allTextContents();
console.log(`   linhas: ${JSON.stringify(rows)}`);
if (!rows[0].includes("Beto") || !rows[0].includes("42")) {
  console.log("   FALHOU: Beto (42 pts) devia estar em 1º");
  process.exitCode = 1;
}

console.log("4) Dentro de um jogo, o menu dá a SAÍDA para o lobby — que era o que faltava...");
// Este é o defeito que o dono apanhou a jogar: entrava-se no quadro e não
// havia maneira de voltar. Para sair era preciso deixar a sala, e a seguir
// toda a gente tinha de escrever o código outra vez — sair de um jogo
// desfazia o grupo.
await page.click("#options-close-btn");
await page.click('[data-mp-game="hangman"]');
await page.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
await page.click("#options-fab");
await page.waitForSelector("#options-overlay:not(.hidden)", { timeout: 3000 });
const temSaida = await page.locator("#options-back-btn").isVisible();
console.log(`   botão de voltar ao lobby visível para a anfitriã: ${temSaida} (esperado true)`);
if (!temSaida) { console.log("   FALHOU: sem saída, a única forma de sair do quadro é deixar a sala"); process.exitCode = 1; }

console.log("5) E voltar leva mesmo ao lobby, com a sala e os pontos intactos...");
await page.click("#options-back-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 8000 });
const room = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const jogadores = Object.keys(room.players || {}).length;
console.log(`   estado: ${room.state}, jogadores na sala: ${jogadores}, pontos do Beto: ${room.players.p2.score}`);
if (room.state !== "lobby") { console.log("   FALHOU: devia ter voltado ao lobby"); process.exitCode = 1; }
if (jogadores !== 3) { console.log("   FALHOU: voltar ao lobby não pode perder ninguém"); process.exitCode = 1; }
if (room.players.p2.score !== 42) { console.log("   FALHOU: o que se ganhou, ganhou-se — os pontos ficam"); process.exitCode = 1; }
if (room.hangman) { console.log("   FALHOU: o lobby não devia abrir com os restos do jogo anterior"); process.exitCode = 1; }
// E no lobby o botão não faz falta: já lá se está.
await page.click("#options-fab");
await page.waitForSelector("#options-overlay:not(.hidden)", { timeout: 3000 });
const noLobby = await page.locator("#options-back-btn").isVisible();
console.log(`   no próprio lobby o botão some: ${!noLobby} (esperado true)`);
if (noLobby) { console.log("   FALHOU: no lobby não há para onde voltar"); process.exitCode = 1; }

console.log("6) Quem não manda na sala vê a explicação, em vez de um botão que não faz nada...");
await page.click("#options-close-btn");
await page.evaluate((c) => { window.__testDb.update(`rooms/${c}`, { hostId: "p2", state: "hangman" }); }, code);
await page.waitForTimeout(400);
await page.click("#options-fab");
await page.waitForSelector("#options-overlay:not(.hidden)", { timeout: 3000 });
const aviso = await page.locator("#options-back-hint").textContent();
const botaoParaConvidado = await page.locator("#options-back-btn").isVisible();
console.log(`   convidado vê botão: ${botaoParaConvidado} (esperado false) · aviso: "${aviso.trim()}"`);
if (botaoParaConvidado) { console.log("   FALHOU: só quem manda muda o ecrã de toda a gente"); process.exitCode = 1; }
if (!/Beto/.test(aviso)) { console.log("   FALHOU: o aviso devia dizer a quem pedir"); process.exitCode = 1; }
// Devolve a sala à Ana para o passo seguinte poder sair como deve ser.
await page.evaluate(({ c, h }) => { window.__testDb.update(`rooms/${c}`, { hostId: h, state: "lobby" }); }, { c: code, h: hostId });
await page.waitForTimeout(300);

console.log("7) Fechar Opções e sair da sala -> botão flutuante deve desaparecer...");
await page.click("#options-close-btn");
const overlayHidden = await page.locator("#options-overlay").evaluate((el) => el.classList.contains("hidden"));
if (!overlayHidden) { console.log("   FALHOU: overlay devia fechar"); process.exitCode = 1; }
await page.click('[data-leave]');
await page.waitForSelector('[data-screen="home"].active', { timeout: 3000 });
const fabHiddenAfterLeave = await page.locator("#options-fab").evaluate((el) => el.classList.contains("hidden"));
console.log(`   fab escondido depois de sair: ${fabHiddenAfterLeave} (esperado true)`);
if (!fabHiddenAfterLeave) { console.log("   FALHOU"); process.exitCode = 1; }

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
