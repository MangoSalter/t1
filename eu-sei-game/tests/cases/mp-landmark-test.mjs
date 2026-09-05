// "Onde Fica Isto?" em equipa, com dois clientes reais: os dois têm de ver o
// MESMO desenho e as MESMAS opções, quem acerta depressa tem de levar mais
// pontos, e a primeira resposta é a que conta.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [n, p] of [["host", host], ["guest", guest]]) {
  p.on("pageerror", (e) => errors.push(`${n}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${n}: ${m.text()}`); });
}

console.log("1) Ana cria a sala, Beto entra...");
await host.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
await host.fill("#name-input", "Ana");
await host.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await host.click("#create-room-btn");
await host.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await host.locator("#lobby-code").textContent()).trim();
await guest.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });
await guest.fill("#name-input", "Beto");
await guest.fill("#join-code-input", code);
await guest.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await guest.click("#join-room-btn");
await guest.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await host.waitForTimeout(400);

console.log("2) Ana abre o jogo — ambos vão para o mesmo ecrã...");
await host.click('[data-mp-game="landmark"]');
await host.waitForSelector('[data-screen="landmark"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="landmark"].active', { timeout: 5000 });
console.log("   OK");

console.log("3) O ESSENCIAL: os dois veem o mesmo desenho e as mesmas opções...");
const optsHost = await host.locator("#landmark-team-options button").allTextContents();
const optsGuest = await guest.locator("#landmark-team-options button").allTextContents();
const svgHost = await host.evaluate(() => document.querySelector("#landmark-team-image svg")?.outerHTML.length || 0);
const svgGuest = await guest.evaluate(() => document.querySelector("#landmark-team-image svg")?.outerHTML.length || 0);
console.log(`   opções (Ana):  ${JSON.stringify(optsHost)}`);
console.log(`   opções (Beto): ${JSON.stringify(optsGuest)}`);
console.log(`   desenho presente nos dois: ${svgHost > 0 && svgGuest > 0}`);
if (optsHost.length !== 4 || optsHost.join() !== optsGuest.join()) { console.log("   FALHOU: opções diferentes"); process.exitCode = 1; }
if (!(svgHost > 0) || svgHost !== svgGuest) { console.log("   FALHOU: desenhos diferentes ou em falta"); process.exitCode = 1; }

const room0 = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const correct = await host.evaluate(async (id) => (await import("./js/data.js")).LANDMARKS.find((l) => l.id === id).answer, room0.landmark.landmarkId);
const wrong = optsHost.find((o) => o !== correct);
console.log(`   resposta certa: ${correct}`);

console.log("4) Ana acerta já; Beto espera e acerta mais tarde — Ana tem de levar mais bónus de rapidez...");
await host.locator("#landmark-team-options button", { hasText: correct }).first().click();
await host.waitForTimeout(2500);
await guest.locator("#landmark-team-options button", { hasText: correct }).first().click();
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).landmark?.resolved === true, code, { timeout: 8000 });
const room1 = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const hostId = room1.hostId;
const betoId = Object.keys(room1.players).find((u) => room1.players[u].name === "Beto");
const rr = room1.landmark.roundResults;
console.log(`   Ana: ${JSON.stringify(rr[hostId])}`);
console.log(`   Beto: ${JSON.stringify(rr[betoId])}`);
if (!rr[hostId].correct || !rr[betoId].correct) { console.log("   FALHOU: ambos acertaram, devia contar"); process.exitCode = 1; }
if (!(rr[hostId].speedBonus > rr[betoId].speedBonus)) { console.log("   FALHOU: quem respondeu primeiro devia levar mais bónus"); process.exitCode = 1; }
if (!(room1.players[hostId].score > room1.players[betoId].score)) { console.log("   FALHOU: pontuações não refletem a rapidez"); process.exitCode = 1; }

console.log("5) A resposta certa fica marcada a verde nos dois ecrãs...");
const marked = await host.evaluate(() => Array.from(document.querySelectorAll("#landmark-team-options button")).filter((b) => b.classList.contains("correct")).map((b) => b.textContent));
console.log(`   marcada como certa: ${JSON.stringify(marked)} (esperado só a certa)`);
if (marked.length !== 1 || marked[0] !== correct) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Ronda seguinte começa sozinha, com um marco diferente...");
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).landmark?.roundIndex === 2, code, { timeout: 10000 });
const room2 = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   ronda ${room2.landmark.roundIndex}, marco "${room2.landmark.landmarkId}" (anterior "${room0.landmark.landmarkId}")`);
if (room2.landmark.landmarkId === room0.landmark.landmarkId) { console.log("   FALHOU: repetiu o marco"); process.exitCode = 1; }
if (room2.landmark.resolved) { console.log("   FALHOU: nova ronda devia começar por resolver"); process.exitCode = 1; }

console.log("7) Não dá para experimentar as opções todas: a primeira resposta é a que conta...");
await host.locator("#landmark-team-options button").first().click();
const firstPick = (await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).landmark.answers, code));
const myFirst = firstPick[hostId].option;
await host.evaluate(async ({ c, opt }) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  await m.submitLandmarkAnswer(c, r, r.hostId, opt);
}, { c: code, opt: "OUTRA COISA" });
await host.waitForTimeout(200);
const after = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`).landmark.answers, code);
console.log(`   1ª resposta "${myFirst}", depois da 2ª tentativa continua "${after[hostId].option}"`);
if (after[hostId].option !== myFirst) { console.log("   FALHOU: deu para trocar de resposta"); process.exitCode = 1; }
const btnsDisabled = await host.evaluate(() => Array.from(document.querySelectorAll("#landmark-team-options button")).every((b) => b.disabled));
console.log(`   botões bloqueados depois de responder: ${btnsDisabled} (esperado true)`);
if (!btnsDisabled) { console.log("   FALHOU"); process.exitCode = 1; }

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
