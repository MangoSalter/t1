// O modo DESENHA E ADIVINHA, dentro do quadro.
//
// Por baixo é a mesma maquinaria da Forca — a palavra que só existe no browser
// de quem tem a caneta, a vez, as equipas, o histórico, o fim da partida — e o
// que muda é que não há letras: ou se reconhece o desenho, ou não. Este teste
// existe para garantir que o que NÃO se deve ver, não se vê: os espaços da
// palavra dariam meia resposta antes de alguém olhar para o desenho, e a
// caixinha das letras não teria nada que fazer.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const ana = await context.newPage();
const beto = await context.newPage();
for (const [nome, p] of [["Ana", ana], ["Beto", beto]]) {
  p.on("pageerror", (e) => errors.push(`${nome}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${nome}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const URL = "http://localhost:8936/index.html";

console.log("1) Sala com a Ana e o Beto, no quadro...");
await ana.goto(URL, { waitUntil: "networkidle" });
await ana.fill("#name-input", "Ana");
await ana.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await ana.click("#create-room-btn");
await ana.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await ana.locator("#lobby-code").textContent()).trim();
await beto.goto(URL, { waitUntil: "networkidle" });
await beto.fill("#name-input", "Beto");
await beto.fill("#join-code-input", code);
await beto.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await beto.click("#join-room-btn");
await beto.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await ana.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).players).length === 2, code, { timeout: 8000 });
await ana.click('[data-mp-game="hangman"]');
for (const p of [ana, beto]) await p.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
const hangmanDe = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman || {}, code);

console.log("2) O modo novo aparece na lista, ao lado dos outros...");
await ana.click("#hangman-mode-btn");
await ana.waitForSelector("#hangman-mode-overlay:not(.hidden)", { timeout: 5000 });
const modos = await ana.evaluate(() =>
  [...document.querySelectorAll("[data-mode-choice]")].map((e) => e.dataset.modeChoice));
console.log(`   modos oferecidos: ${modos.join(", ")}`);
if (!modos.includes("adivinha")) fail("o modo novo devia estar na lista");
await ana.click('[data-mode-choice="adivinha"]');

console.log("3) Cores e caneta, como na Forca — é a mesma sala...");
for (const [p, cor] of [[ana, "#b24b38"], [beto, "#5c7e91"]]) {
  await p.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
  await p.click(`[data-color-choice="${cor}"]`);
}
const anaId = await ana.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, code);
await ana.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await ana.click(`[data-pen-vote-choice="${anaId}"]`);
await beto.waitForFunction((a) => window.__testDb.get(`rooms/${a[0]}`).hangman?.leaderId === a[1], [code, anaId], { timeout: 10000 });
console.log("   a Ana ficou com a caneta");

console.log("4) A Ana escreve o que vai desenhar — e isso NÃO vai para a sala...");
await ana.waitForSelector("#hangman-word-form:not(.hidden)", { timeout: 8000 });
const textoDaCaixa = await ana.evaluate(() => document.getElementById("hangman-word-input").placeholder);
console.log(`   a caixa diz: "${textoDaCaixa}"`);
if (/adivinhar/i.test(textoDaCaixa)) fail("no modo do desenho, a caixa não devia falar de adivinhar letras");
await ana.fill("#hangman-word-input", "girafa");
await ana.fill("#hangman-hint-input", "animais");
await ana.click("#hangman-word-form button[type=submit]");
await beto.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
const naSala = JSON.stringify(await hangmanDe(beto));
if (naSala.includes("girafa")) fail("a palavra escapou-se para a sala");
console.log("   a palavra não está na sala (só no browser da Ana)");

console.log("5) O QUE NÃO SE VÊ: nem espaços da palavra, nem caixa de letras...");
const oQueBetoVe = await beto.evaluate(() => ({
  espacos: !document.getElementById("hangman-slots-strip").classList.contains("hidden"),
  caixaLetra: !document.getElementById("hangman-guess-form").classList.contains("hidden"),
  caixaPalavra: !document.getElementById("hangman-wordguess-form").classList.contains("hidden"),
  ajuda: !document.getElementById("hangman-help-btn").classList.contains("hidden"),
  pista: document.getElementById("hangman-hint-label").textContent,
}));
console.log(`   Beto vê — espaços: ${oQueBetoVe.espacos}, caixa de letra: ${oQueBetoVe.caixaLetra}, caixa de palavra: ${oQueBetoVe.caixaPalavra}, ajuda: ${oQueBetoVe.ajuda}`);
if (oQueBetoVe.espacos) fail("os espaços da palavra dariam meia resposta antes de olhar para o desenho");
if (oQueBetoVe.caixaLetra) fail("não há letras a arriscar neste modo");
if (!oQueBetoVe.caixaPalavra) fail("tem de haver onde escrever o palpite");
if (oQueBetoVe.ajuda) fail("a ajuda revela letras: aqui não teria nada para mostrar");
console.log(`   mas a pista aparece: "${oQueBetoVe.pista}"`);
if (!/animais/.test(oQueBetoVe.pista)) fail("a pista do tema devia aparecer");

console.log("6) A Ana desenha, e o traço chega ao Beto...");
const caixa = await ana.locator("#hangman-doodle-canvas").boundingBox();
await ana.mouse.move(caixa.x + 150, caixa.y + 150);
await ana.mouse.down();
for (let i = 1; i <= 12; i += 1) await ana.mouse.move(caixa.x + 150 + i * 15, caixa.y + 150 + i * 7);
await ana.mouse.up();
await beto.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length > 0, code, { timeout: 8000 });
console.log("   chegou");

console.log("7) O Beto erra o palpite, e depois acerta...");
await beto.fill("#hangman-wordguess-input", "elefante");
await beto.click("#hangman-wordguess-form button[type=submit]");
await beto.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.wrongWords || {}).length > 0, code, { timeout: 10000 });
const comErro = await hangmanDe(beto);
console.log(`   palpite errado guardado: ${JSON.stringify(Object.values(comErro.wrongWords || {}).map((w) => w.text))}`);
if (comErro.solved) fail("um palpite errado não pode acabar a ronda");

await beto.fill("#hangman-wordguess-input", "girafa");
await beto.click("#hangman-wordguess-form button[type=submit]");
await beto.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.solved === true, code, { timeout: 10000 });
const fim = await hangmanDe(beto);
console.log(`   acertou; vencedor = ${fim.winnerUid === (await beto.evaluate((c) => { const r = window.__testDb.get(`rooms/${c}`); return Object.keys(r.players).find((u) => r.players[u].name === "Beto"); }, code)) ? "Beto" : fim.winnerUid}`);
if (!fim.winnerUid) fail("quem adivinhou devia ficar registado");
const textoFim = await beto.locator("#hangman-misses").textContent();
console.log(`   o Beto lê: "${textoFim.trim()}"`);
if (/erro|enforcado/i.test(textoFim)) fail("neste modo não há erros nem enforcado para mostrar");

console.log("8) A palavra fica no histórico, como na Forca...");
const historico = await ana.evaluate((c) => {
  const h = window.__testDb.get(`rooms/${c}`).hangman.history || {};
  return Object.keys(h).sort().map((k) => h[k].word);
}, code);
console.log(`   histórico: ${JSON.stringify(historico)}`);
if (!historico.includes("girafa")) fail("a palavra desenhada devia ficar no histórico da sessão");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-draw-mode FALHOU" : "=> mp-board-draw-mode ok");
