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
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
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

console.log("3) O ESSENCIAL: a Ana tem de ter um BOTÃO, e não só uma função...");
// Este passo chamava skipDrawRound pelo módulo. Provava que a regra existe e
// não provava nada sobre quem lhe chega: o ecrã escondia o botão a toda a
// gente menos a quem desenhava, ou seja, exatamente a quem já não está cá.
// A sala ficava presa com a saída de emergência escrita e inalcançável. A
// partir daqui é a Ana a carregar no que vê.
const botaoSaltar = page.locator("#draw-skip-btn");
const visivel = await botaoSaltar.isVisible();
const rotulo = (await botaoSaltar.textContent()).trim();
console.log(`   botão "saltar" visível para a Ana: ${visivel} — diz "${rotulo}"`);
if (!visivel) {
  falhar("quem desenhava saiu e a Ana não tem botão nenhum: a saída existe no room.js e ninguém lhe chega");
} else {
  // O rótulo tem de dizer PORQUÊ: um botão que aparece do nada a meio da
  // ronda de outra pessoa lê-se como uma maneira de a estragar.
  if (!rotulo.includes("Beto")) falhar(`o botão não diz de quem se está à espera (diz "${rotulo}")`);
  await botaoSaltar.click();
}
await page.waitForTimeout(400);
r = await sala();
console.log(`   depois de a anfitriã carregar no botão: fechada = ${r.draw.resolved}`);
if (!r.draw.resolved) {
  falhar("a ronda não fecha: quem desenhava foi-se embora e mais ninguém a pode fechar — a partida fica presa aqui");
}

// E com a ronda já fechada o botão sai de cena: senão dava para a saltar
// duas vezes, e a segunda passava por cima da ronda de outra pessoa.
const aindaLa = await page.locator("#draw-skip-btn").isVisible();
console.log(`   com a ronda já fechada, o botão continua à vista: ${aindaLa}`);
if (aindaLa) falhar("dava para saltar a mesma ronda duas vezes");

console.log("3b) E o contrário: com quem desenha presente, mais ninguém lhe fecha a ronda...");
// Sem isto, "mostrar o botão sempre" passaria o passo 3 e estragaria o jogo:
// qualquer pessoa podia cortar a vez de quem está a desenhar.
await chamar("advanceDrawRound");
await page.waitForTimeout(400);
r = await sala();
await page.evaluate(({ c, quem }) => {
  window.__testDb.update(`rooms/${c}/draw`, { drawerId: quem, resolved: false, roundWinnerId: null, resolvedAt: null });
}, { c: code, quem: "p3" }); // a Carla desenha, e está ligada
await page.waitForTimeout(400);
const escondido = await page.locator("#draw-skip-btn").isVisible();
console.log(`   com a Carla (ligada) a desenhar, a Ana vê o botão: ${escondido}`);
if (escondido) falhar("qualquer um pode cortar a vez de quem está a desenhar");

console.log("3c) E quem já saiu não pode LEVAR a ronda: a lista de vencedores só tem quem está cá...");
// A ordem das vezes deste mesmo jogo já filtrava por ligado; a lista do
// "🏆 Alguém acertou!" mostrava toda a gente que a sala alguma vez viu, e os
// pontos podiam ir para quem fechou o telemóvel e não gritou nada.
// A Carla desenha (está ligada) e o Beto continua fora.
await page.evaluate((c) => {
  window.__testDb.update(`rooms/${c}/draw`, { drawerId: "p3", resolved: false, roundWinnerId: null, resolvedAt: null });
}, code);
await page.waitForTimeout(300);
const nomesNaLista = await page.evaluate(async ({ c, quem }) => {
  const m = await import("./js/room.js");
  const sala = window.__testDb.get(`rooms/${c}`);
  return m.candidatosAVencedorDoDesenho(sala).map((u) => sala.players[u].name);
}, { c: code, quem: "p3" });
console.log(`   candidatos a vencedor: ${nomesNaLista.join(", ") || "(nenhum)"}`);
if (nomesNaLista.includes("Beto")) falhar("o Beto saiu e ainda pode levar os pontos da ronda");
if (!nomesNaLista.includes("Ana") || !nomesNaLista.includes("Dinis")) falhar("faltam candidatos que estão na sala");
if (nomesNaLista.includes("Carla")) falhar("quem desenha não se pode escolher a si própria");
// E a escrita recusa o mesmo que o ecrã esconde, senão a regra é só decoração.
await chamar("selectDrawWinner", "p3", "p2");
await page.waitForTimeout(300);
r = await sala();
console.log(`   depois de tentar dar a ronda ao Beto: fechada = ${r.draw.resolved}, pontos dele = ${r.players.p2.score}`);
if (r.draw.resolved || r.players.p2.score !== 0) falhar("a escrita aceitou um vencedor que já não está na sala");

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
