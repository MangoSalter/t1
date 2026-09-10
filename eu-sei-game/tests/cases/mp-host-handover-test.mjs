// O que acontece à sala quando o ANFITRIÃO se vai embora.
//
// Isto nunca tinha sido testado, e é das coisas que mais acontece a jogar de
// verdade: quem criou a sala fecha o portátil, e alguém tem de ficar com o
// comando. Sem isso, a sala fica sem quem resolve as rondas e sem quem manda
// no quadro — ou seja, morta.
//
// O que tem de ser verdade: alguém assume, UM só (nunca dois anfitriões), e
// quem assume consegue mesmo fazer o que só o anfitrião faz.
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
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

console.log("1) A Ana cria a sala; o Beto e a Carla entram...");
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
await beto.waitForFunction((c) => Object.keys(window.__testDb.get(`rooms/${c}`).players).length === 3, code, { timeout: 8000 });
const salaDe = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
const anaId = (await salaDe(beto)).hostId;
console.log(`   sala ${code}, anfitriã = ${(await salaDe(beto)).players[anaId].name}`);

console.log("2) Vão para o quadro, e a Ana manda nele por ser anfitriã...");
await ana.click('[data-mp-game="hangman"]');
for (const p of [ana, beto, carla]) await p.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
const betoVeModo = await beto.evaluate(() =>
  !document.getElementById("hangman-mode-btn").classList.contains("hidden")
  || !document.getElementById("hangman-mode-btn-viewer").classList.contains("hidden"));
console.log(`   o Beto vê o botão do modo antes: ${betoVeModo} (esperado false)`);
if (betoVeModo) fail("quem não manda no quadro não devia ver o botão do modo");

console.log("3) A ANFITRIÃ FECHA O PORTÁTIL...");
await ana.close();
await beto.waitForFunction((args) => {
  const r = window.__testDb.get(`rooms/${args[0]}`);
  return r.players[args[1]]?.connected === false;
}, [code, anaId], { timeout: 15000 });
console.log("   a Ana aparece como desligada");

console.log("4) Alguém assume — e UM só...");
await beto.waitForFunction((args) => {
  const r = window.__testDb.get(`rooms/${args[0]}`);
  return r.hostId !== args[1];
}, [code, anaId], { timeout: 15000 });
const sala = await salaDe(beto);
const novoAnfitriao = sala.hostId;
const nomeNovo = sala.players[novoAnfitriao]?.name;
console.log(`   novo anfitrião: ${nomeNovo}`);
if (novoAnfitriao === anaId) fail("a sala continuou com a anfitriã que saiu");
if (!sala.players[novoAnfitriao]?.connected) fail("o novo anfitrião não está sequer ligado");
// Os dois clientes têm de concordar em QUEM é: dois anfitriões seria pior do
// que nenhum, porque cada um resolveria as rondas à sua maneira.
const visaoCarla = (await salaDe(carla)).hostId;
console.log(`   a Carla vê o mesmo anfitrião: ${visaoCarla === novoAnfitriao}`);
if (visaoCarla !== novoAnfitriao) fail("os clientes discordam sobre quem é o anfitrião");

console.log("5) E quem assumiu CONSEGUE mesmo mandar no quadro...");
// Não basta o nome mudar na base de dados: o botão tem de aparecer e o clique
// tem de fazer o que promete.
const paginaDoNovo = nomeNovo === "Beto" ? beto : carla;
const outro = nomeNovo === "Beto" ? carla : beto;
await paginaDoNovo.waitForFunction(() =>
  !document.getElementById("hangman-mode-btn").classList.contains("hidden")
  || !document.getElementById("hangman-mode-btn-viewer").classList.contains("hidden"),
{ timeout: 10000 });
const qualBotao = await paginaDoNovo.evaluate(() =>
  !document.getElementById("hangman-mode-btn").classList.contains("hidden")
    ? "#hangman-mode-btn" : "#hangman-mode-btn-viewer");
await paginaDoNovo.click(qualBotao);
await paginaDoNovo.waitForSelector("#hangman-mode-overlay:not(.hidden)", { timeout: 5000 });
await paginaDoNovo.click('[data-mode-choice="forca"]');
await outro.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "forca", code, { timeout: 10000 });
console.log(`   ${nomeNovo} mudou o modo e chegou ao outro cliente`);

console.log("6) A sala continua a funcionar: o quadro responde...");
const podeEscrever = await paginaDoNovo.evaluate(async (c) => {
  const m = await import("./js/room.js");
  const r = window.__testDb.get(`rooms/${c}`);
  return m.canSetBoardMode(r, r.hostId);
}, code);
if (!podeEscrever) fail("o novo anfitrião não consegue mandar no quadro");
// E não ficou ninguém preso num ecrã de espera.
for (const [nome, p] of [[nomeNovo, paginaDoNovo], ["o outro", outro]]) {
  const ecra = await p.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
  console.log(`   ${nome} está no ecrã: ${ecra}`);
  if (ecra !== "hangman") fail(`${nome} saiu do quadro sem ninguém lhe pedir`);
}

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-host-handover FALHOU" : "=> mp-host-handover ok");
