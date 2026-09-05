import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala com Ana (host) e injetar 2 jogadores (3 no total, minimo para bonus)...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
console.log(`   OK: sala ${code}`);

const info = await page.evaluate(async (code) => {
  const room = await window.__testDb.get(`rooms/${code}`);
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
  return { hostId: room.hostId, bonusGames: room.config.bonusGames };
}, code);
console.log(`   hostId (Ana): ${info.hostId}, bonusGames de config: ${JSON.stringify(info.bonusGames)}`);
if (!info.bonusGames || info.bonusGames.length !== 2) {
  console.log("   FALHOU: DEFAULT_CONFIG.bonusGames devia ter 2 jogos por omissao");
  process.exitCode = 1;
}

console.log("2) Verificar checkboxes de jogos bonus no lobby...");
await page.waitForTimeout(200);
const hangmanChecked = await page.locator('[data-bonus-game="hangman"]').isChecked();
const mapChecked = await page.locator('[data-bonus-game="mapTrivia"]').isChecked();
console.log(`   Forca marcada: ${hangmanChecked}, Mapa-Mundi marcada: ${mapChecked} (esperado true, true)`);
if (!hangmanChecked || !mapChecked) process.exitCode = 1;

console.log("3) Forcar fim das rondas classicas (round = numRounds, state = roundScore)...");
const numRounds = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).config.numRounds, code);
await page.evaluate(({ code, numRounds }) => {
  window.__testDb.update(`rooms/${code}`, { round: numRounds, state: "roundScore" });
}, { code, numRounds });
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 3000 });
console.log("   OK: no ecra de pontuacao da ronda");

console.log("4) Host clica em continuar -> deve entrar na fila de jogos bonus (Forca ou Mapa-Mundi)...");
await page.click("#round-next-btn");
await page.waitForFunction(() => {
  const active = document.querySelector(".screen.active");
  return active && (active.dataset.screen === "hangman" || active.dataset.screen === "map-trivia");
}, { timeout: 3000 });
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   state: ${room.state}, bonusQueue restante: ${JSON.stringify(room.bonusQueue)}, bonusProgress: ${JSON.stringify(room.bonusProgress)}`);
if (!room.bonusQueue || room.bonusProgress?.total !== 2) {
  console.log("   FALHOU: fila de bonus devia ter sido criada com 2 jogos");
  process.exitCode = 1;
}

// Independentemente da ordem sorteada, resolve primeiro o que calhou primeiro,
// depois confirma que o outro joga a seguir, terminando em "final".
async function playHangmanIfActive() {
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  if (room.state !== "hangman") return false;
  console.log("   -> No Quadro branco (bonus) — agora é só um quadro branco em ecrã inteiro, sem pontuação própria...");
  await page.waitForSelector('[data-screen="hangman"].active', { timeout: 3000 });
  // Ana e sempre a anfitriã = lider do quadro; confirma e desenha um traço rápido.
  const leaderIsAna = room.hangman.leaderId === room.hostId;
  console.log(`      líder é a anfitriã (Ana): ${leaderIsAna}`);
  if (!leaderIsAna) { console.log("   FALHOU: líder devia ser sempre o anfitrião"); process.exitCode = 1; }
  const canvasBox = await page.locator("#hangman-doodle-canvas").boundingBox();
  await page.mouse.move(canvasBox.x + 50, canvasBox.y + 50);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 150, canvasBox.y + 100, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction((code) => Object.keys(window.__testDb.get(`rooms/${code}`).hangman.doodle.points || {}).length > 0, code, { timeout: 3000 });
  // O anfitrião avança manualmente (não há timeout automático, é só um quadro social).
  await page.click("#hangman-continue-btn");
  await page.waitForFunction(() => {
    const active = document.querySelector(".screen.active");
    return active && active.dataset.screen !== "hangman";
  }, { timeout: 5000 });
  return true;
}

async function playMapTriviaIfActive() {
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  if (room.state !== "mapTrivia") return false;
  console.log("   -> Jogando o Mapa-Mundi em equipa (bonus)...");
  let rounds = 0;
  let testedVoting = false;
  while (true) {
    room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
    if (room.state !== "mapTrivia") break;
    rounds++;
    if (rounds > 6) { console.log("   FALHOU: mais rondas do que o esperado (loop infinito?)"); process.exitCode = 1; break; }
    await page.waitForSelector('[data-screen="map-trivia"].active', { timeout: 3000 });
    const matchNames = room.mapTrivia.criteria.matchNames;
    const correctName = matchNames[0];
    console.log(`      ronda ${room.mapTrivia.roundIndex}/${room.mapTrivia.roundsTotal}: criterio "${room.mapTrivia.criteria.promptText}", Ana escreve "${correctName}"`);
    // Ana escreve a resposta certa pela UI real.
    await page.fill("#map-trivia-answer-input", correctName);
    await page.click("#map-trivia-answer-submit-btn");
    // Simula p2 (certo) e p3 (escreveu um nome que nao esta em matchNames,
    // mas ainda assim valido para o criterio — testa o voto de aceitacao).
    const p3Answer = "Nomeinventado";
    await page.evaluate(({ code, correctName, p3Answer }) => {
      window.__testDb.update(`rooms/${code}/mapTrivia/answers`, {
        p2: correctName,
        p3: p3Answer,
      });
    }, { code, correctName, p3Answer });
    // Todos responderam -> host-loop deve resolver a ronda sozinho.
    await page.waitForFunction((code) => {
      const r = window.__testDb.get(`rooms/${code}`);
      return r.mapTrivia?.resolved === true;
    }, code, { timeout: 3000 });
    room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
    const p2Correct = room.mapTrivia.roundResults.p2.correct;
    const anaCorrect = room.mapTrivia.roundResults[room.hostId].correct;
    const p3Correct = room.mapTrivia.roundResults.p3.correct;
    console.log(`      resolvido: Ana correta=${anaCorrect}, p2 correta=${p2Correct}, p3 (resposta inventada) correta=${p3Correct} (esperado true, true, false)`);
    if (!anaCorrect || !p2Correct || p3Correct) { console.log("   FALHOU: pontuacao da ronda incorreta"); process.exitCode = 1; }

    if (!testedVoting) {
      testedVoting = true;
      console.log("      testando voto de aceitacao na resposta errada do p3...");
      // Ana vota para aceitar a resposta do p3 pela UI real.
      await page.waitForFunction(() => {
        const rows = [...document.querySelectorAll("#map-trivia-results .score-row")];
        return rows.some((r) => r.textContent.includes("Nomeinventado") && r.querySelector(".vote-btn"));
      }, { timeout: 3000 });
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#map-trivia-results .score-row")];
        const row = rows.find((r) => r.textContent.includes("Nomeinventado"));
        row.querySelector(".vote-btn").click();
      });
      await page.waitForTimeout(200);
      // 1 voto (Ana) contra 2 jogadores ligados que nao sao p3 (Ana + p2) ainda nao chega a maioria.
      room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
      console.log(`      depois de 1 voto: p3 correta=${room.mapTrivia.roundResults.p3.correct} (esperado false, precisa de maioria)`);
      // Simula o voto de p2 chamando a funcao real de room.js (equivalente a
      // outro cliente a clicar Aceitar), nao apenas escrevendo o resultado esperado.
      await page.evaluate(async (code) => {
        const roomModule = await import("./js/room.js");
        const currentRoom = window.__testDb.get(`rooms/${code}`);
        await roomModule.voteAcceptMapTriviaAnswer(code, currentRoom, "p3", "p2");
      }, code);
      await page.waitForTimeout(200);
      room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
      console.log(`      depois do 2o voto (maioria): p3 correta=${room.mapTrivia.roundResults.p3.correct} (esperado true)`);
      if (!room.mapTrivia.roundResults.p3.correct) { console.log("   FALHOU: voto de aceitacao nao funcionou"); process.exitCode = 1; }
    }

    // Forca o resultado a ja ter passado o tempo de exibicao, para o host-loop avancar sozinho.
    const roundBefore = room.mapTrivia.roundIndex;
    await page.evaluate((code) => {
      window.__testDb.update(`rooms/${code}/mapTrivia`, { resolvedAt: Date.now() - 10000 });
    }, code);
    await page.waitForFunction(({ code, roundBefore }) => {
      const r = window.__testDb.get(`rooms/${code}`);
      return r.state !== "mapTrivia" || r.mapTrivia.roundIndex > roundBefore;
    }, { code, roundBefore }, { timeout: 5000 });
  }
  console.log(`   OK: Mapa-Mundi em equipa terminou apos ${rounds} ronda(s)`);
  return true;
}

let safety = 0;
while (safety++ < 5) {
  room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
  if (room.state === "final") break;
  const didHangman = await playHangmanIfActive();
  if (didHangman) continue;
  const didMap = await playMapTriviaIfActive();
  if (didMap) continue;
  console.log(`   estado inesperado: ${room.state}`);
  break;
}

console.log("5) Confirmar que chegou ao ecra final com pontos de ambos os jogos bonus contabilizados...");
await page.waitForSelector('[data-screen="final"].active', { timeout: 5000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   scores finais: ${JSON.stringify(Object.fromEntries(Object.entries(room.players).map(([k, v]) => [k, v.score])))}`);
if ((room.players[room.hostId].score || 0) <= 0) {
  console.log("   FALHOU: Ana devia ter pontos do Mapa-Mundi (a Forca já não dá pontos, é só um quadro social)");
  process.exitCode = 1;
}
if ((room.players.p2.score || 0) <= 0) {
  console.log("   FALHOU: p2 devia ter pontos do Mapa-Mundi (respondeu certo)");
  process.exitCode = 1;
}

console.log("6) Testar rematch: reseta scores e limpa estado de bonus...");
await page.click("#final-rematch-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   apos rematch: state=${room.state}, bonusQueue=${JSON.stringify(room.bonusQueue)}, score Ana=${room.players[room.hostId].score}`);
if (room.bonusQueue !== null && room.bonusQueue !== undefined) { console.log("   FALHOU: bonusQueue devia ter sido limpa"); process.exitCode = 1; }
if ((room.players[room.hostId].score || 0) !== 0) { console.log("   FALHOU: score devia ter sido reposto a 0"); process.exitCode = 1; }

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS DE CONSOLA:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
