// Duas coisas que nenhum outro teste do quadro faz, e que uma sessão a sério
// faz sempre: a PENALIZAÇÃO a funcionar de ponta a ponta, e alguém a CHEGAR
// depois de o jogo já ter começado.
//
// A penalização foi onde se esconderam dois defeitos: em modo livre não
// penalizava nada (não há vez para perder), e os castigos não se apagavam com
// a palavra nova — à terceira palavra havia gente de castigo por erros de
// rondas de que ninguém se lembrava. As duas coisas só se veem a jogar várias
// palavras seguidas, que é o que este teste faz.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const ana = await context.newPage();
const beto = await context.newPage();
const carla = await context.newPage();
for (const [nome, p] of [["Ana", ana], ["Beto", beto], ["Carla", carla]]) {
  p.on("pageerror", (e) => errors.push(`${nome}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${nome}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const URL = "http://localhost:8936/index.html";

console.log("1) Ana com a caneta, Beto e Carla a adivinhar...");
await ana.goto(URL, { waitUntil: "networkidle" });
await ana.fill("#name-input", "Ana");
await ana.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await ana.click("#create-room-btn");
await ana.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await ana.locator("#lobby-code").textContent()).trim();
const entrar = async (p, nome) => {
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.fill("#name-input", nome);
  await p.fill("#join-code-input", code);
  await p.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
  await p.click("#join-room-btn");
  await p.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
};
await entrar(beto, "Beto");
await entrar(carla, "Carla");
await ana.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).players).length === 3, code, { timeout: 8000 });
await ana.click('[data-mp-game="hangman"]');
for (const p of [ana, beto, carla]) await p.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });

const hangmanDe = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman || {}, code);
const idDe = (nome) => ana.evaluate(({ c, n }) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === n);
}, { c: code, n: nome });
const anaId = await idDe("Ana");
const betoId = await idDe("Beto");

await ana.click("#hangman-mode-btn");
await ana.click('[data-mode-choice="forca"]');
for (const [p, cor] of [[ana, "#b24b38"], [beto, "#5c7e91"], [carla, "#5b7442"]]) {
  await p.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
  await p.click(`[data-color-choice="${cor}"]`);
}
await ana.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await ana.click(`[data-pen-vote-choice="${anaId}"]`);
await beto.click(`[data-pen-vote-choice="${anaId}"]`);
await beto.waitForFunction((a) => window.__testDb.get(`rooms/${a[0]}`).hangman?.leaderId === a[1], [code, anaId], { timeout: 10000 });
console.log(`   sala ${code}, a Ana com a caneta`);

console.log("2) Erros de cada um, penalização a cada 2, e qualquer um arrisca...");
// É esta combinação que não penalizava nada: em modo livre não há vez para
// perder, e o castigo era escrito na sala sem impedir seja o que for.
await ana.click("#hangman-settings-btn");
await ana.click('[data-setting="missMode"][data-setting-value="individuais"]');
await ana.click('[data-setting="penaltyEvery"][data-setting-value="2"]');
await ana.click('[data-setting="guessMode"][data-setting-value="livre"]');
// E o teto de erros tem de aparecer apagado: com erros de cada um não enforca
// ninguém, e um número que não quer dizer nada é uma promessa falsa.
const tetoApagado = await ana.evaluate(() => {
  const btn = document.querySelector('[data-setting="maxMisses"]');
  return { desativado: !!btn?.disabled, rotulo: btn?.closest("div")?.parentElement?.querySelector(".hangman-setting-label")?.textContent || "" };
});
console.log(`   teto de erros desativado: ${tetoApagado.desativado} — "${tetoApagado.rotulo.trim()}"`);
if (!tetoApagado.desativado) fail("com erros de cada um, o teto não faz nada e não devia deixar-se escolher");
if (!/sem efeito/i.test(tetoApagado.rotulo)) fail("devia dizer porque é que não faz nada");
await ana.click("#hangman-settings-close-btn");

console.log("3) O Beto erra duas vezes e fica de castigo — em modo livre...");
await ana.fill("#hangman-word-input", "banana");
await ana.click("#hangman-word-form button[type=submit]");
for (const p of [beto, carla]) {
  await p.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.mask, code, { timeout: 8000 });
}
const arriscar = async (p, letra) => {
  await p.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 10000 });
  await p.fill("#hangman-guess-input", letra);
  await p.click("#hangman-guess-form button[type=submit]");
};
await arriscar(beto, "z");
await beto.waitForFunction((args) => (window.__testDb.get(`rooms/${args[0]}`).hangman.missesBy?.[args[1]] || 0) === 1, [code, betoId], { timeout: 10000 });
await arriscar(beto, "x");
await beto.waitForFunction((args) => !!window.__testDb.get(`rooms/${args[0]}`).hangman.skipNext?.[args[1]], [code, betoId], { timeout: 10000 });
const hCastigo = await hangmanDe(ana);
console.log(`   erros do Beto: ${hCastigo.missesBy?.[betoId]}, de castigo: ${!!hCastigo.skipNext?.[betoId]}`);

// O que interessa: de castigo, a caixa de arriscar do Beto FECHA. Antes ficava
// aberta e o castigo era só um emoji ao lado do nome.
await beto.waitForFunction(() => document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
console.log("   de castigo, o Beto deixa de poder arriscar");
// E a Carla, que não está de castigo, continua a poder.
const carlaPode = await carla.evaluate(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"));
console.log(`   a Carla continua a poder arriscar: ${carlaPode}`);
if (!carlaPode) fail("o castigo do Beto não pode calar a Carla");

console.log("4) Assim que OUTRA pessoa arrisca, o Beto fica livre...");
await arriscar(carla, "w");
await beto.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 10000 });
console.log("   o Beto voltou a poder arriscar depois de a Carla jogar");

console.log("5) O total da ronda conta na mesma — é por ele que a gata sabe entrar...");
// Com erros de cada um, este contador ficava em zero para sempre, e isso
// desligava o caos e a pista adiada sem o dizer a ninguém.
const hTotal = await hangmanDe(ana);
console.log(`   erros de cada um: ${JSON.stringify(hTotal.missesBy)}, total da ronda: ${hTotal.misses}`);
const soma = Object.values(hTotal.missesBy || {}).reduce((a, b) => a + b, 0);
if (hTotal.misses !== soma) fail(`o total da ronda (${hTotal.misses}) devia ser a soma dos erros de cada um (${soma})`);

console.log("6) PALAVRA NOVA apaga os erros de cada um e os castigos...");
// Sem isto, à terceira palavra metade da sala está de castigo por erros de
// rondas que já ninguém se lembra.
await ana.evaluate((c) => window.__testDb.update(`rooms/${c}/hangman`, { skipNext: { [window.__testUid || "x"]: null } }), code);
await ana.click("#hangman-newword-btn");
await ana.waitForFunction(() => !document.getElementById("hangman-word-form").classList.contains("hidden"), { timeout: 8000 });
await ana.fill("#hangman-word-input", "abacate");
await ana.click("#hangman-word-form button[type=submit]");
await beto.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman.mask?.length === "abacate".length, code, { timeout: 8000 });
const hLimpo = await hangmanDe(ana);
console.log(`   depois da palavra nova — erros: ${JSON.stringify(hLimpo.missesBy)}, castigos: ${JSON.stringify(hLimpo.skipNext)}, total: ${hLimpo.misses}`);
if (hLimpo.missesBy && Object.keys(hLimpo.missesBy).length > 0) fail("os erros de cada um deviam zerar com a palavra nova");
if (hLimpo.skipNext && Object.keys(hLimpo.skipNext).length > 0) fail("os castigos deviam ir-se embora com a palavra nova");
if (hLimpo.misses !== 0) fail("o total da ronda devia zerar");

console.log("7) ALGUÉM CHEGA a meio do jogo, com a palavra já em curso...");
// É o que acontece sempre numa sessão real: alguém entra atrasado. Tem de
// conseguir escolher cor, ver a forma da palavra, e arriscar.
const david = await context.newPage();
david.on("pageerror", (e) => errors.push(`David: ${e.message}`));
david.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`David: ${m.text()}`); });
// Não passa pelo átrio: a sala já está no quadro, por isso quem entra vai
// direto para lá. (Foi assim que este teste começou por falhar, à espera de um
// ecrã de átrio que não chega a aparecer.)
await david.goto(URL, { waitUntil: "networkidle" });
await david.fill("#name-input", "David");
await david.fill("#join-code-input", code);
await david.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await david.click("#join-room-btn");
await david.waitForSelector('[data-screen="hangman"].active', { timeout: 10000 });
console.log("   o David entrou e foi parar ao quadro, onde o jogo já ia a meio");
await david.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await david.click('[data-color-choice="#e3a53d"]');
await david.waitForFunction(() => document.getElementById("hangman-color-overlay").classList.contains("hidden"), { timeout: 8000 });
// Os espaços só são botões (com data-slot-index) para quem tem a caneta; para
// quem adivinha são células. Conta-se a célula, não o botão.
const formaDoDavid = await david.evaluate(() =>
  [...document.querySelectorAll("#hangman-slots .hangman-slot")].length);
console.log(`   o David vê ${formaDoDavid} espaços (a palavra tem ${"abacate".length} letras)`);
if (formaDoDavid !== "abacate".length) fail("quem chega a meio devia ver a palavra que está em jogo");
await arriscar(david, "b");
await david.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("b"), code, { timeout: 10000 });
console.log("   e a tentativa dele foi julgada como as dos outros");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-penalty FALHOU" : "=> mp-board-penalty ok");
