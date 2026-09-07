// QUEM DESENHA VAI-SE EMBORA — E A RONDA FICA PARA SEMPRE.
//
// No Desenha e Adivinha (e no "Onde Fica Isto?", que é o mesmo jogo com o
// baralho dos monumentos) SÓ quem desenha pode fechar a ronda: é o único que
// sabe a palavra, por isso é ele que diz quem acertou ou que ninguém acertou.
// Não há relógio nenhum a correr por trás.
//
// Duas maneiras de a partida encravar, e nenhuma delas é rebuscada — é fechar
// o separador:
//   1. quem está a desenhar sai a meio da ronda. Ninguém mais pode fechá-la, e
//      os outros ficam a olhar para "o Beto está a desenhar" até desistirem.
//   2. alguém sai ANTES da sua vez. A ordem das vezes é sorteada no início e
//      nunca mais muda, por isso a ronda dessa pessoa chega na mesma, com a
//      caneta na mão de quem já não está lá.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text()); });
const falhar = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
console.log("1) Sala com quatro pessoas, no Desenha e Adivinha...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await page.locator("#lobby-code").textContent()).trim();
const anaId = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`).hostId, code);
await page.evaluate((c) => window.__testDb.update(`rooms/${c}/players`, {
  p2: { name: "Beto", score: 0, connected: true },
  p3: { name: "Carla", score: 0, connected: true },
  p4: { name: "Dinis", score: 0, connected: true },
}), code);
await page.waitForTimeout(300);
await page.click('[data-mp-game="draw"]');
await page.waitForSelector('[data-screen="draw"].active', { timeout: 8000 });

const sala = () => page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const chamar = (fn, ...args) => page.evaluate(async ({ c, f, a }) => {
  const m = await import("./js/room.js");
  return m[f](c, window.__testDb.get(`rooms/${c}`), ...a);
}, { c: code, f: fn, a: args });

// A Ana (anfitriã) fica a ver; quem desenha é o Beto, e é ele que se vai embora.
await page.evaluate(({ c, ordem }) => {
  window.__testDb.update(`rooms/${c}/draw`, { turnOrder: ordem, turnIndex: 0, drawerId: "p2" });
}, { c: code, ordem: ["p2", "p3", "p4", anaId] });
await page.waitForTimeout(300);

console.log("2) O Beto está a desenhar e fecha o separador...");
await page.evaluate((c) => window.__testDb.update(`rooms/${c}/players/p2`, { connected: false }), code);
await page.waitForTimeout(400);
let r = await sala();
console.log(`   quem desenha: ${r.draw.drawerId} (ligado: ${r.players.p2.connected}), ronda fechada: ${r.draw.resolved}`);

console.log("3) O ESSENCIAL: a sala tem de conseguir seguir em frente sem ele...");
await chamar("skipDrawRound", anaId);
await page.waitForTimeout(400);
r = await sala();
console.log(`   depois de a anfitriã tentar saltar a ronda: fechada = ${r.draw.resolved}`);
if (!r.draw.resolved) {
  falhar("a ronda não fecha: quem desenhava foi-se embora e mais ninguém a pode fechar — a partida fica presa aqui");
}

console.log("4) E a vez de quem já saiu não pode chegar com a caneta na mão dele...");
// A Carla também se vai embora, ANTES da vez dela (é a seguinte na ordem).
await page.evaluate((c) => window.__testDb.update(`rooms/${c}/players/p3`, { connected: false }), code);
await page.waitForTimeout(300);
await chamar("advanceDrawRound");
await page.waitForTimeout(500);
r = await sala();
const quemDesenhaAgora = r.draw?.drawerId;
const estadoDele = quemDesenhaAgora ? r.players?.[quemDesenhaAgora]?.connected : null;
console.log(`   ronda ${r.draw?.turnIndex}, caneta com: ${quemDesenhaAgora} (ligado: ${estadoDele})`);
if (r.state === "draw" && quemDesenhaAgora && estadoDele !== true) {
  falhar(`a caneta foi parar a ${quemDesenhaAgora}, que já não está na sala — ninguém pode desenhar nem fechar esta ronda`);
}

console.log("5) E chegar ao fim continua a funcionar quando toda a gente sai...");
let voltas = 0;
while (voltas++ < 8) {
  r = await sala();
  if (r.state !== "draw") break;
  const quem = r.draw.drawerId;
  if (!r.draw.resolved) await chamar("skipDrawRound", quem);
  await page.waitForTimeout(200);
  await chamar("advanceDrawRound");
  await page.waitForTimeout(250);
}
r = await sala();
console.log(`   estado no fim: ${r.state} (ao fim de ${voltas} voltas)`);
if (r.state === "draw") falhar("o jogo nunca acaba");

await browser.close();
const reais = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(reais.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + reais.join("\n"));
if (reais.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
