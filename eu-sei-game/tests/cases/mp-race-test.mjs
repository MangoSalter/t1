// Estrada Maluca em equipa com DOIS clientes reais: o que interessa provar é
// que ambos correm na MESMA pista (mesmos carros nas mesmas faixas), que a
// classificação ao vivo mostra o outro jogador, e que a ronda acaba e
// pontua quando o último bater.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [name, p] of [["host", host], ["guest", guest]]) {
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
}

console.log("1) Ana cria a sala e Beto entra...");
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
console.log(`   sala ${code}, 2 jogadores`);

console.log("2) Com 2 jogadores, o botão da Estrada Maluca tem de estar ATIVO...");
const disabled = await host.locator('[data-mp-game="race"]').isDisabled();
console.log(`   desativado: ${disabled} (esperado false)`);
if (disabled) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("3) Ana abre a corrida — AMBOS têm de ir para a estrada (não para o Stop)...");
await host.click('[data-mp-game="race"]');
await host.waitForSelector('[data-screen="race"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="race"].active', { timeout: 5000 });
const hostScreen = await host.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
const guestScreen = await guest.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
console.log(`   ecrã da Ana: ${hostScreen}, ecrã do Beto: ${guestScreen} (esperado race/race)`);
if (hostScreen !== "race" || guestScreen !== "race") { console.log("   FALHOU"); process.exitCode = 1; }

console.log("4) O ESSENCIAL: a estrada é a MESMA para os dois (mesmas faixas, mesmas cores)...");
await host.waitForTimeout(2500);
// Comparação por IDENTIDADE do carro, não por posição na lista. Os dois
// clientes desenham cada um no seu ritmo: basta um ir uns fotogramas à frente
// (e já ter deitado fora o carro mais antigo) para as listas ficarem
// desalinhadas e uma corrida perfeitamente correta parecer diferente. O que
// tem mesmo de ser verdade é que o carro nº N está na mesma faixa e da mesma
// cor nos dois ecrãs.
const readRoad = (p) => p.evaluate(() => {
  const out = {};
  document.querySelectorAll("#race-road .car-obstacle").forEach((el) => {
    out[el.dataset.index] = `${el.style.left}|${el.style.background}`;
  });
  return out;
});
const roadHost = await readRoad(host);
const roadGuest = await readRoad(guest);
const idsHost = Object.keys(roadHost);
const idsGuest = Object.keys(roadGuest);
console.log(`   carros no ecrã da Ana: ${idsHost.length}, no do Beto: ${idsGuest.length}`);
const common = idsHost.filter((i) => i in roadGuest);
console.log(`   carros que ambos têm no ecrã: ${common.length} (nºs ${common.slice(0, 6).join(", ")})`);
if (idsHost.length === 0) { console.log("   FALHOU: não nasceu nenhum obstáculo"); process.exitCode = 1; }
if (common.length === 0) {
  console.log("   FALHOU: os dois ecrãs não têm um único carro em comum");
  process.exitCode = 1;
} else {
  const diff = common.filter((i) => roadHost[i] !== roadGuest[i]);
  diff.slice(0, 3).forEach((i) => console.log(`   carro ${i}: Ana ${roadHost[i]} != Beto ${roadGuest[i]}`));
  if (diff.length > 0) {
    console.log("   FALHOU: as duas estradas não são iguais — a corrida seria injusta");
    process.exitCode = 1;
  } else {
    console.log(`   OK: os ${common.length} carros comuns estão na mesma faixa e cor nos dois ecrãs`);
  }
}

console.log("5) A classificação ao vivo mostra os dois jogadores, com o tempo a correr...");
const rowsHost = await host.locator("#race-standings .race-standing-row").allTextContents();
console.log(`   Ana vê: ${JSON.stringify(rowsHost)}`);
if (rowsHost.length !== 2 || !rowsHost.join().includes("Beto")) {
  console.log("   FALHOU: a classificação devia listar os dois");
  process.exitCode = 1;
}
const timeOnGuestRow = await host.evaluate(() => {
  const row = Array.from(document.querySelectorAll("#race-standings .race-standing-row")).find((r) => r.textContent.includes("Beto"));
  return parseFloat(row?.querySelector(".race-standing-time")?.textContent || "0");
});
console.log(`   tempo do Beto visto pela Ana: ${timeOnGuestRow}s (esperado > 0 — chegou pela rede)`);
if (!(timeOnGuestRow > 0)) { console.log("   FALHOU: o tempo do outro jogador não está a ser transmitido"); process.exitCode = 1; }

console.log("6) Beto bate: fica marcado como fora, mas continua a ver a estrada (não congela)...");
await guest.evaluate((c) => {
  const db = window.__testDb;
  const r = db.get(`rooms/${c}`);
  const uid = Object.keys(r.players).find((u) => r.players[u].name === "Beto");
  return import("./js/room.js").then((m) => m.crashRacer(c, uid, 4200));
}, code);
await host.waitForTimeout(600);
const betoOut = await host.evaluate(() => {
  const row = Array.from(document.querySelectorAll("#race-standings .race-standing-row")).find((r) => r.textContent.includes("Beto"));
  return row?.classList.contains("race-standing-out");
});
console.log(`   Ana vê o Beto marcado como fora: ${betoOut} (esperado true)`);
if (!betoOut) { console.log("   FALHOU"); process.exitCode = 1; }
const stillSpawning = await guest.evaluate(() => document.querySelectorAll("#race-road .car-obstacle").length);
console.log(`   carros ainda a correr no ecrã do Beto: ${stillSpawning} (esperado > 0 — vê o resto da corrida)`);
if (stillSpawning === 0) { console.log("   FALHOU: o ecrã de quem bate ficou congelado"); process.exitCode = 1; }

console.log("7) Ana também bate -> ronda resolvida, pontos atribuídos, resultados visíveis...");
await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return import("./js/room.js").then((m) => m.crashRacer(c, r.hostId, 9100));
}, code);
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).race?.resolved === true, code, { timeout: 8000 });
const room = await host.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   racers crus: ${JSON.stringify(room.race.racers)}`);
console.log(`   classificação: ${JSON.stringify(room.race.standings)}`);
console.log(`   pontos da ronda: ${JSON.stringify(room.race.roundPoints)}`);
const hostId = room.hostId;
const betoId = Object.keys(room.players).find((u) => room.players[u].name === "Beto");
if (room.race.standings[hostId].place !== 1) { console.log("   FALHOU: quem aguentou mais devia ficar em 1º"); process.exitCode = 1; }
if (!(room.players[hostId].score > 0)) { console.log("   FALHOU: os pontos não foram somados"); process.exitCode = 1; }
if (!(room.race.roundPoints[hostId] > room.race.roundPoints[betoId])) { console.log("   FALHOU: quem aguentou mais devia ter mais pontos"); process.exitCode = 1; }
await host.waitForSelector("#race-results:not(.hidden)", { timeout: 5000 });
const resultRows = await host.locator("#race-results .score-row").allTextContents();
console.log(`   resultados no ecrã: ${JSON.stringify(resultRows)}`);
if (resultRows.length !== 2) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("8) Continuar -> fim da fila de bónus, vai para o ecrã final...");
await host.click("#race-continue-btn");
await host.waitForSelector('[data-screen="final"].active', { timeout: 8000 });
await guest.waitForSelector('[data-screen="final"].active', { timeout: 8000 });
console.log("   OK: ambos no ecrã final");

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
