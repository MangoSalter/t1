import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala e forçar estado de votação com 4 jogadores...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();
const hostId = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`).hostId, code);
await page.evaluate(({ code, hostId }) => {
  window.__testDb.update(`rooms/${code}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
    p4: { name: "Duda", score: 0, connected: true },
  });
  window.__testDb.update(`rooms/${code}`, {
    state: "voting",
    categoriesRound: { letter: "P", categoryIndexes: [0] },
    answers: {
      [hostId]: { c0: "Pedro" },
      p2: { c0: "Sardinha" }, // não começa por P — vai ficar inválida à partida
    },
    voting: { endAt: Date.now() + 60000 },
  });
}, { code, hostId });
await page.waitForSelector('[data-screen="voting"].active', { timeout: 3000 });
console.log("   OK: no ecrã de votação");

console.log("2) Confirmar que os 3 botões de voto existem para a resposta da p2 (Sardinha, inválida à partida)...");
const p2Row = page.locator(".vote-row", { hasText: "Sardinha" });
await p2Row.waitFor({ timeout: 3000 });
const btnCount = await p2Row.locator(".vote-btn").count();
console.log(`   botões de voto: ${btnCount} (esperado 3)`);
if (btnCount !== 3) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Votar 'Inválida' e depois 'Glória' na mesma resposta — só o último deve ficar ativo (exclusão mútua)...");
await p2Row.locator(".vote-btn", { hasText: "Inválida" }).click();
await page.waitForFunction(({ code }) => {
  const r = window.__testDb.get(`rooms/${code}`);
  return r.votes?.["p2_0"]?.[Object.keys(r.players).find((u) => u !== "p2" && u !== "p3" && u !== "p4")] === "invalid";
}, { code }, { timeout: 3000 });
let room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   depois de votar Inválida: ${JSON.stringify(room.votes["p2_0"])}`);
if (room.votes["p2_0"][hostId] !== "invalid") { console.log("   FALHOU"); process.exitCode = 1; }

await p2Row.locator(".vote-btn", { hasText: "Glória" }).click();
await page.waitForFunction(({ code, hostId }) => window.__testDb.get(`rooms/${code}`).votes?.["p2_0"]?.[hostId] === "gloria", { code, hostId }, { timeout: 3000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
console.log(`   depois de votar Glória: ${JSON.stringify(room.votes["p2_0"])} (esperado só 'gloria', SEM 'invalid' a coexistir)`);
if (room.votes["p2_0"][hostId] !== "gloria") { console.log("   FALHOU: voto de Glória não substituiu o de Inválida"); process.exitCode = 1; }
if (Object.values(room.votes["p2_0"]).filter((v) => v === "invalid").length !== 0) {
  console.log("   FALHOU: o voto antigo 'invalid' ainda existe — deviam ser mutuamente exclusivos");
  process.exitCode = 1;
}

console.log("4) Confirmar visualmente que só o botão Glória fica marcado como ativo...");
const gloriaBtnActive = await p2Row.locator(".vote-btn", { hasText: "Glória" }).evaluate((el) => el.classList.contains("active"));
const invalidBtnActive = await p2Row.locator(".vote-btn", { hasText: "Inválida" }).evaluate((el) => el.classList.contains("active"));
console.log(`   Glória ativo: ${gloriaBtnActive} (esperado true), Inválida ativo: ${invalidBtnActive} (esperado false)`);
if (!gloriaBtnActive || invalidBtnActive) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) Clicar de novo em Glória deve RETIRAR o voto (toggle off)...");
await p2Row.locator(".vote-btn", { hasText: "Glória" }).click();
await page.waitForFunction(({ code, hostId }) => window.__testDb.get(`rooms/${code}`).votes?.["p2_0"]?.[hostId] == null, { code, hostId }, { timeout: 3000 });
console.log("   OK: voto retirado");

console.log("6) Maioria de Glória (2 de 3 outros) numa resposta que não cumpre a letra deve validá-la e somar o bónus fixo...");
await page.evaluate(({ code }) => {
  window.__testDb.update(`rooms/${code}/votes`, { "p2_0": { p3: "gloria", p4: "gloria" } });
}, { code });
await page.click("#vote-end-btn");
await page.waitForSelector('[data-screen="roundscore"].active', { timeout: 3000 });
room = await page.evaluate((code) => window.__testDb.get(`rooms/${code}`), code);
const p2Result = room.roundResults.byPlayer.p2.c0;
console.log(`   resultado de p2 (Sardinha, sem letra P, maioria Glória): ${JSON.stringify(p2Result)}`);
if (p2Result.status !== "valida-unica" || p2Result.points !== 15) {
  console.log("   FALHOU: maioria de Glória devia validar a resposta (10 base + 5 bónus = 15)");
  process.exitCode = 1;
}
const anaResult = room.roundResults.byPlayer[hostId].c0;
console.log(`   resultado de Ana (Pedro, válida normal, sem votos): ${JSON.stringify(anaResult)}`);
if (anaResult.status !== "valida-unica" || anaResult.points !== 10) {
  console.log("   FALHOU: resposta válida normal sem votos devia dar 10 pts");
  process.exitCode = 1;
}

console.log("7) O ecrã diz PORQUÊ cada resposta valeu o que valeu...");
// "Pontuação pouco clara" é a queixa que mais se repete nos jogos deste
// género. O número sozinho não chega: quem foi chumbado tem de ver se foi a
// regra da letra ou a mesa a votar.
const explicacoes = await page.locator(".score-porque-pts").allTextContents();
console.log(`   linhas de explicação: ${explicacoes.length} — ${explicacoes.slice(0, 4).join(" | ")}`);
if (explicacoes.length === 0) {
  console.log("   FALHOU: o ecrã de fim de ronda não explica nenhum ponto");
  process.exitCode = 1;
}
const minhaConta = await page.locator(".score-porque[open] .score-porque-pts").allTextContents();
console.log(`   a minha conta abre sozinha: ${minhaConta.length > 0}`);
if (minhaConta.length === 0) {
  console.log("   FALHOU: a conta de quem está a ver devia estar aberta");
  process.exitCode = 1;
}
if (!explicacoes.some((t) => /Glória/i.test(t))) {
  console.log("   FALHOU: a resposta salva pela Glória devia dizer que foi a Glória");
  process.exitCode = 1;
}
if (!explicacoes.some((t) => /15 pts/.test(t)) || !explicacoes.some((t) => /10 pts/.test(t))) {
  console.log("   FALHOU: os pontos de cada resposta têm de aparecer ao lado da razão");
  process.exitCode = 1;
}

console.log("7b) E distingue as duas maneiras de chumbar — a regra da letra e a mesa...");
// São coisas diferentes e quem perde os pontos merece saber qual foi. A ronda
// jogada acima não tem nenhuma resposta chumbada pela letra, por isso
// escreve-se um resultado à mão e vê-se o que o ecrã diz dele.
await page.evaluate(({ code, hostId }) => {
  window.__testDb.update(`rooms/${code}`, {
    roundResults: {
      byPlayer: {
        [hostId]: {
          c0: { text: "Sardinha", status: "invalida", points: 0, gloriaVotes: 0, engracadaVotes: 0 },
          c1: { text: "Porto", status: "invalida", points: 0, gloriaVotes: 0, engracadaVotes: 0 },
        },
      },
      roundPoints: { [hostId]: 0 },
    },
    categoriesRound: { letter: "P", categoryIndexes: [0, 1] },
  });
}, { code, hostId });
await page.waitForTimeout(400);
const chumbos = await page.locator(".score-porque[open] .score-porque-pts").allTextContents();
console.log(`   ${chumbos.join(" | ")}`);
if (!chumbos.some((t) => /não começa por P/.test(t))) {
  console.log("   FALHOU: uma resposta fora da letra tem de dizer que foi a letra");
  process.exitCode = 1;
}
if (!chumbos.some((t) => /chumbada pela maioria/.test(t))) {
  console.log("   FALHOU: uma resposta com a letra certa só pode ter sido chumbada pela mesa");
  process.exitCode = 1;
}

await browser.close();
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("fonts.googleapis") && !e.includes("CONNECTION_RESET"));
console.log(realErrors.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + realErrors.join("\n"));
if (realErrors.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
