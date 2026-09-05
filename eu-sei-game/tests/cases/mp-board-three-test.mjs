// O quadro com TRÊS jogadores. Todos os outros testes do quadro usam dois, e
// há regras que só se distinguem a partir de três:
//  - a maioria: com dois, um voto é metade; com três, são precisos dois;
//  - a vez de arriscar roda entre VÁRIOS, e tem de dar a volta a todos;
//  - as equipas com três caixas e gente a sobrar;
//  - e o que acontece quando alguém SAI a meio.
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

console.log("1) Três pessoas numa sala, no quadro...");
await ana.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await ana.fill("#name-input", "Ana");
await ana.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await ana.click("#create-room-btn");
await ana.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await ana.locator("#lobby-code").textContent()).trim();
for (const [nome, p] of [["Beto", beto], ["Carla", carla]]) {
  await p.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
  await p.fill("#name-input", nome);
  await p.fill("#join-code-input", code);
  await p.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
  await p.click("#join-room-btn");
  await p.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
}
await ana.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).players).length === 3, code, { timeout: 8000 });
await ana.click('[data-mp-game="hangman"]');
for (const p of [ana, beto, carla]) await p.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
console.log(`   sala ${code} com 3 jogadores no quadro`);

const idDe = (nome) => ana.evaluate(({ c, n }) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === n);
}, { c: code, n: nome });
const anaId = await idDe("Ana");
const betoId = await idDe("Beto");
const carlaId = await idDe("Carla");
const hangmanDe = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman || {}, code);

console.log("2) Entrar na Forca: cada um escolhe a sua cor...");
await ana.click("#hangman-mode-btn");
await ana.click('[data-mode-choice="forca"]');
for (const p of [ana, beto, carla]) await p.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await ana.click('[data-color-choice="#b24b38"]');
await beto.click('[data-color-choice="#5c7e91"]');
await carla.click('[data-color-choice="#5b7442"]');
for (const p of [ana, beto, carla]) {
  await p.waitForFunction(() => document.getElementById("hangman-color-overlay").classList.contains("hidden"), { timeout: 8000 });
}
console.log("   três cores diferentes escolhidas");

console.log("3) COM TRÊS, um voto sozinho NÃO chega — são precisos dois...");
// É esta a regra que dois jogadores não conseguem distinguir: com dois,
// metade arredondada para cima é 1, e um voto decide. Com três são 2.
await ana.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await ana.click(`[data-pen-vote-choice="${carlaId}"]`);
await ana.waitForTimeout(700);
let h = await hangmanDe(ana);
console.log(`   depois de 1 voto em 3: caneta = ${h.leaderId === carlaId ? "Carla" : JSON.stringify(h.leaderId)}`);
if (h.leaderId === carlaId) fail("um voto em três não devia dar logo a caneta");
await beto.click(`[data-pen-vote-choice="${carlaId}"]`);
await ana.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [code, carlaId], { timeout: 8000 });
console.log("   com o segundo voto, a Carla ficou com a caneta");

console.log("4) A Carla põe a palavra; a vez de arriscar roda entre a Ana e o Beto...");
await carla.fill("#hangman-word-input", "banana");
await carla.click("#hangman-word-form button[type=submit]");
for (const p of [ana, beto]) {
  await p.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.mask, code, { timeout: 8000 });
}
// Um de cada vez: só um dos dois pode ter a caixa aberta.
const podeArriscar = async () => ({
  ana: await ana.evaluate(() => !document.getElementById("hangman-guess-form").classList.contains("hidden")),
  beto: await beto.evaluate(() => !document.getElementById("hangman-guess-form").classList.contains("hidden")),
});
const vez1 = await podeArriscar();
console.log(`   quem pode arriscar agora: ${JSON.stringify(vez1)}`);
if (vez1.ana === vez1.beto) fail("com a vez a rodar, só um dos dois devia poder arriscar");

// Quem estiver na vez arrisca; a vez tem de passar ao OUTRO.
const primeiro = vez1.ana ? ana : beto;
const segundo = vez1.ana ? beto : ana;
await primeiro.fill("#hangman-guess-input", "z");
await primeiro.click("#hangman-guess-form button[type=submit]");
await segundo.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 10000 });
const vez2 = await podeArriscar();
console.log(`   depois de arriscar, a vez passou: ${JSON.stringify(vez2)}`);
if (vez2.ana === vez2.beto) fail("a vez devia ter passado a um só");
if ((vez1.ana && vez2.ana) || (vez1.beto && vez2.beto)) fail("a vez não pode ficar na mesma pessoa");

console.log("5) E dá a volta: a vez volta ao primeiro depois de os dois jogarem...");
await segundo.fill("#hangman-guess-input", "x");
await segundo.click("#hangman-guess-form button[type=submit]");
await primeiro.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 10000 });
console.log("   a vez deu a volta e voltou ao primeiro");

console.log("6) As letras erradas dizem QUEM as disse, e são pessoas diferentes...");
h = await hangmanDe(ana);
const donos = Object.values(h.wrong || {}).filter(Boolean).map((w) => w.uid);
console.log(`   duas letras erradas, de ${new Set(donos).size} pessoa(s) diferente(s)`);
if (new Set(donos).size !== 2) fail("as duas letras erradas deviam ser de pessoas diferentes");
if (donos.includes(carlaId)) fail("quem tem a caneta não arrisca letras");

console.log("7) 'Qualquer um arrisca' tira a vez aos TRÊS...");
await carla.click("#hangman-settings-btn");
await carla.click('[data-setting="guessMode"][data-setting-value="livre"]');
await carla.click("#hangman-settings-close-btn");
await ana.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
await beto.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
const ambos = await podeArriscar();
console.log(`   com "qualquer um": ${JSON.stringify(ambos)}`);
if (!ambos.ana || !ambos.beto) fail("com 'qualquer um', os dois deviam poder arriscar");
// Mas quem tem a caneta continua de fora.
const carlaArrisca = await carla.evaluate(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"));
if (carlaArrisca) fail("quem tem a caneta não arrisca, mesmo com 'qualquer um'");

console.log("7b) ACERTAR MANTÉM A VEZ, e a ordem seguinte ganha-se...");
// Volta ao modo por turnos para se poder ver a vez a ficar em quem acerta.
await carla.click("#hangman-settings-btn");
await carla.click('[data-setting="guessMode"][data-setting-value="turnos"]');
await carla.click("#hangman-settings-close-btn");
await carla.click("#hangman-newword-btn");
await carla.waitForFunction(() => !document.getElementById("hangman-word-form").classList.contains("hidden"), { timeout: 8000 });
await carla.fill("#hangman-word-input", "banana");
await carla.click("#hangman-word-form button[type=submit]");
for (const p of [ana, beto]) {
  await p.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.mask, code, { timeout: 8000 });
}
const quemPode = async () => ({
  ana: await ana.evaluate(() => !document.getElementById("hangman-guess-form").classList.contains("hidden")),
  beto: await beto.evaluate(() => !document.getElementById("hangman-guess-form").classList.contains("hidden")),
});
let vez = await quemPode();
const naVez = vez.ana ? ana : beto;
const naVezNome = vez.ana ? "Ana" : "Beto";
const oOutro = vez.ana ? beto : ana;
// Acerta: a vez TEM de ficar com quem acertou.
await naVez.fill("#hangman-guess-input", "a");
await naVez.click("#hangman-guess-form button[type=submit]");
await carla.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("a"), code, { timeout: 10000 });
await naVez.waitForTimeout(400);
vez = await quemPode();
console.log(`   ${naVezNome} acertou; quem pode arriscar agora: ${JSON.stringify(vez)}`);
if ((naVezNome === "Ana" && !vez.ana) || (naVezNome === "Beto" && !vez.beto)) {
  fail("quem acerta devia continuar a jogar");
}
// Erra: aí sim, a vez passa ao outro.
await naVez.fill("#hangman-guess-input", "z");
await naVez.click("#hangman-guess-form button[type=submit]");
await oOutro.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 10000 });
console.log("   e ao errar, a vez passou ao outro");
// Os acertos aparecem ao lado do nome, porque são eles que decidem a ordem.
const comContagem = await carla.evaluate(() =>
  [...document.querySelectorAll("[data-player-tag]")].map((e) => e.textContent.trim()));
console.log(`   nomes com contagem: ${JSON.stringify(comContagem)}`);
if (!comContagem.some((t) => /\s1$/.test(t))) fail("o número de acertos devia estar ao lado do nome");

console.log("7c) A Dona Manga comenta o erro, e o mesmo comentário para todos...");
// Sorteado em cada cliente, cada pessoa lia uma frase diferente sobre o mesmo
// erro — e uma sala em que cada um lê uma coisa não é uma sala.
for (const p of [ana, beto, carla]) {
  await p.waitForFunction(() => !document.getElementById("hangman-quip").classList.contains("hidden"), { timeout: 8000 });
}
const balões = [];
for (const p of [ana, beto, carla]) {
  balões.push(await p.evaluate(() => document.getElementById("hangman-quip").textContent.trim()));
}
console.log(`   os três leem: ${JSON.stringify(balões[0])}`);
if (new Set(balões).size !== 1) fail(`cada um leu uma coisa diferente: ${JSON.stringify(balões)}`);
if (!balões[0]) fail("o balão apareceu vazio");

console.log("8) Equipas com três caixas e três pessoas...");
await carla.click("#hangman-newword-btn");
await carla.waitForFunction(() => !document.getElementById("hangman-word-form").classList.contains("hidden"), { timeout: 8000 });
await carla.click("#hangman-teams-btn");
await carla.waitForSelector("#hangman-teams-overlay:not(.hidden)", { timeout: 5000 });
await carla.click('[data-play-mode="equipas"]');
await carla.waitForFunction(() => document.querySelectorAll("[data-team-box]").length >= 2, { timeout: 8000 });
await carla.click('[data-team-count="3"]');
await carla.waitForFunction(() => document.querySelectorAll("[data-team-box]").length === 3, { timeout: 8000 });
for (const [p, t] of [[ana, "t1"], [beto, "t2"], [carla, "t3"]]) {
  await p.click(p === carla ? "#hangman-teams-btn" : "#hangman-teams-btn-viewer").catch(() => {});
  await p.waitForSelector("#hangman-teams-overlay:not(.hidden)", { timeout: 5000 });
  await p.click(`[data-join-team="${t}"]`);
}
// Cada um tem de ver os outros dois nas suas equipas.
await ana.waitForFunction(() => {
  const t2 = document.querySelector('[data-team-box="t2"]');
  const t3 = document.querySelector('[data-team-box="t3"]');
  return t2?.textContent.includes("Beto") && t3?.textContent.includes("Carla");
}, { timeout: 10000 });
console.log("   a Ana vê o Beto e a Carla nas equipas deles");

console.log("9) ALGUÉM SAI a meio: a sala não fica à espera de quem já não está...");
// Este é o caso que dois jogadores não testam bem: com três, sair um deixa
// dois, e as contas da maioria e da vez têm de mudar sozinhas.
for (const p of [ana, beto, carla]) {
  if (!(await p.evaluate(() => document.getElementById("hangman-teams-overlay").classList.contains("hidden")))) {
    await p.click("#hangman-teams-close-btn").catch(() => {});
  }
}
await beto.close();
await ana.waitForFunction((args) => {
  const r = window.__testDb.get(`rooms/${args[0]}`);
  return r.players[args[1]]?.connected === false;
}, [code, betoId], { timeout: 15000 });
console.log("   o Beto aparece como desligado");
// Com dois ligados, a Ana passa a poder arriscar sozinha na vez dela.
await carla.fill("#hangman-word-input", "manga");
await carla.click("#hangman-word-form button[type=submit]");
await ana.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.mask, code, { timeout: 8000 });
await ana.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 10000 });
console.log("   a Ana continua a poder arriscar, sem esperar por quem saiu");
await ana.fill("#hangman-guess-input", "m");
await ana.click("#hangman-guess-form button[type=submit]");
await carla.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("m"), code, { timeout: 10000 });
console.log("   e a tentativa dela foi julgada");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-three FALHOU" : "=> mp-board-three ok");
