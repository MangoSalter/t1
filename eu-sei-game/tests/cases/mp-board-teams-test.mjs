// Modo equipas do quadro. O que interessa provar:
//  - "solo" ou "equipas" escolhe-se antes, e só quem manda no quadro escolhe;
//  - cada jogador entra na equipa que quiser e o nome aparece AOS OUTROS;
//  - dá para trocar de equipa até o jogo começar, e deixa de dar depois;
//  - quem está dentro renomeia a equipa; quem está de fora, não;
//  - reduzir o número de equipas não deixa ninguém numa equipa fantasma.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [name, p] of [["Ana", host], ["Beto", guest]]) {
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${name}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

console.log("1) Sala com dois jogadores, no quadro...");
await host.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await host.fill("#name-input", "Ana");
await host.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await host.click("#create-room-btn");
await host.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await host.locator("#lobby-code").textContent()).trim();
await guest.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await guest.fill("#name-input", "Beto");
await guest.fill("#join-code-input", code);
await guest.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await guest.click("#join-room-btn");
await guest.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await host.click('[data-mp-game="hangman"]');
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await guest.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });

const hangmanOf = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman || {}, code);

console.log("2) O quadro começa em 'cada um por si'...");
await host.click("#hangman-teams-btn");
await host.waitForSelector("#hangman-teams-overlay:not(.hidden)", { timeout: 5000 });
const inicial = await host.evaluate(() =>
  document.querySelector('[data-play-mode="solo"]').getAttribute("aria-pressed"));
console.log(`   "cada um por si" marcado: ${inicial}`);
if (inicial !== "true") fail("o quadro devia começar em solo");
// As caixas das equipas só existem em modo equipas.
if (await host.evaluate(() => document.querySelectorAll("[data-team-box]").length) !== 0) {
  fail("não devia haver caixas de equipa em modo solo");
}

console.log("3) Só quem manda no quadro escolhe solo/equipas...");
await guest.click("#hangman-teams-btn-viewer");
await guest.waitForSelector("#hangman-teams-overlay:not(.hidden)", { timeout: 5000 });
const betoPodeMudar = await guest.evaluate(() =>
  !document.querySelector('[data-play-mode="equipas"]').disabled);
console.log(`   o Beto (sem caneta, sem ser anfitrião) pode mudar: ${betoPodeMudar}`);
if (betoPodeMudar) fail("quem não manda no quadro não devia poder mudar o modo de jogo");

console.log("4) A Ana liga as equipas, e o Beto vê as caixas aparecer...");
await host.click('[data-play-mode="equipas"]');
await guest.waitForFunction(() => document.querySelectorAll("[data-team-box]").length >= 2, { timeout: 8000 });
const caixas = await guest.evaluate(() =>
  [...document.querySelectorAll("[data-team-box]")].map((c) => c.querySelector(".hangman-team-name, .hangman-team-name-input"))
    .map((n) => (n?.value ?? n?.textContent ?? "").trim()));
console.log(`   caixas no ecrã do Beto: ${JSON.stringify(caixas)}`);
if (caixas.length !== 2) fail(`esperava 2 equipas, tenho ${caixas.length}`);
if (caixas[0] !== "Equipa A") fail(`a primeira equipa devia chamar-se "Equipa A", chama-se "${caixas[0]}"`);

console.log("5) Cada um entra na sua equipa, e o nome aparece AO OUTRO...");
await host.click('[data-join-team="t1"]');
await guest.click('[data-join-team="t2"]');
// A Ana tem de ver o Beto na equipa B sem fechar e abrir o ecrã.
await host.waitForFunction(() => {
  const b = document.querySelector('[data-team-box="t2"]');
  return b && b.textContent.includes("Beto");
}, { timeout: 8000 });
const membros = await host.evaluate(() => ({
  t1: [...document.querySelectorAll('[data-team-box="t1"] [data-team-member]')].map((e) => e.textContent),
  t2: [...document.querySelectorAll('[data-team-box="t2"] [data-team-member]')].map((e) => e.textContent),
}));
console.log(`   a Ana vê: ${JSON.stringify(membros)}`);
if (!membros.t1.includes("Ana")) fail("a Ana devia aparecer na Equipa A");
if (!membros.t2.includes("Beto")) fail("o Beto devia aparecer na Equipa B");

console.log("6) Trocar de equipa enquanto o jogo não começou...");
await guest.click('[data-join-team="t1"]');
await host.waitForFunction(() => {
  const b = document.querySelector('[data-team-box="t1"]');
  return b && b.textContent.includes("Beto");
}, { timeout: 8000 });
console.log("   o Beto mudou-se para a Equipa A e a Ana viu");
await guest.click('[data-join-team="t2"]');
await host.waitForFunction(() => {
  const b = document.querySelector('[data-team-box="t2"]');
  return b && b.textContent.includes("Beto");
}, { timeout: 8000 });

console.log("7) Quem está DENTRO renomeia a equipa; quem está de fora, não...");
// A Ana está na t1: vê caixa de escrever. Na t2 (do Beto) só lê.
const podeRenomear = await host.evaluate(() => ({
  minha: !!document.querySelector('[data-team-name-input="t1"]'),
  doOutro: !!document.querySelector('[data-team-name-input="t2"]'),
}));
console.log(`   a Ana pode renomear a sua: ${podeRenomear.minha}, a do Beto: ${podeRenomear.doOutro}`);
if (!podeRenomear.minha) fail("quem está dentro da equipa devia poder mudar-lhe o nome");
if (podeRenomear.doOutro) fail("não se deve poder renomear a equipa dos outros");
await host.fill('[data-team-name-input="t1"]', "Os Kotas");
await host.locator('[data-team-name-input="t1"]').press("Enter");
await guest.waitForFunction(() => {
  const b = document.querySelector('[data-team-box="t1"]');
  return b && b.textContent.includes("Os Kotas");
}, { timeout: 8000 });
console.log("   o novo nome chegou ao Beto");

console.log("8) Mudar para 3 equipas mantém os nomes já escolhidos...");
await host.click('[data-team-count="3"]');
await guest.waitForFunction(() => document.querySelectorAll("[data-team-box]").length === 3, { timeout: 8000 });
const comTres = await guest.evaluate(() =>
  [...document.querySelectorAll("[data-team-box]")].map((c) => c.textContent.includes("Os Kotas")));
if (!comTres[0]) fail("o nome escolhido pela equipa perdeu-se ao acrescentar outra equipa");
console.log("   'Os Kotas' sobreviveu");

console.log("9) Reduzir as equipas não deixa ninguém numa equipa fantasma...");
// O Beto está na t2. Voltar a 2 mantém-no; mas se estivesse na t3 tinha de sair.
await host.click('[data-team-count="4"]');
await guest.waitForFunction(() => document.querySelectorAll("[data-team-box]").length === 4, { timeout: 8000 });
await guest.click('[data-join-team="t4"]');
await host.waitForFunction(() => {
  const b = document.querySelector('[data-team-box="t4"]');
  return b && b.textContent.includes("Beto");
}, { timeout: 8000 });
await host.click('[data-team-count="2"]');
await guest.waitForFunction(() => document.querySelectorAll("[data-team-box]").length === 2, { timeout: 8000 });
const h = await hangmanOf(host);
const betoId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Beto");
}, code);
console.log(`   equipa do Beto depois de reduzir: ${JSON.stringify(h.teamOf?.[betoId] ?? null)}`);
if (h.teamOf?.[betoId]) fail("o Beto ficou numa equipa que já não existe");
// E consegue voltar a entrar numa das que restam.
await guest.click('[data-join-team="t2"]');
await host.waitForFunction(() => {
  const b = document.querySelector('[data-team-box="t2"]');
  return b && b.textContent.includes("Beto");
}, { timeout: 8000 });
console.log("   e voltou a entrar numa das que restam");

console.log("10) Começado o jogo, as equipas ficam trancadas...");
await host.click("#hangman-teams-close-btn");
await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "forca", code, { timeout: 8000 });
// A escolha de cor é obrigatória e fecha os ecrãs opcionais que estejam
// abertos — senão ficava por baixo do das equipas, visível e impossível de
// carregar.
await guest.waitForFunction(() => document.getElementById("hangman-teams-overlay").classList.contains("hidden"), { timeout: 8000 });
await host.click('[data-color-choice="#b24b38"]');
await guest.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await guest.click('[data-color-choice="#5c7e91"]');
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
const anaId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, code);
await host.click(`[data-pen-vote-choice="${anaId}"]`);
await host.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [code, anaId], { timeout: 8000 });
await host.fill("#hangman-word-input", "banana");
await host.click("#hangman-word-form button[type=submit]");
await guest.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman?.mask, code, { timeout: 8000 });
await guest.click("#hangman-teams-btn-viewer");
await guest.waitForSelector("#hangman-teams-overlay:not(.hidden)", { timeout: 5000 });
const trancado = await guest.evaluate(() => ({
  botao: document.querySelector('[data-join-team="t1"]')?.disabled,
  aviso: document.getElementById("hangman-teams-hint").textContent,
}));
console.log(`   entrar noutra equipa está bloqueado: ${trancado.botao}`);
console.log(`   aviso: "${trancado.aviso.trim()}"`);
if (!trancado.botao) fail("com o jogo a decorrer não se deve poder trocar de equipa");
await guest.click("#hangman-teams-close-btn");

console.log("11) Uma letra certa conta para a equipa de quem a disse...");
await guest.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
await guest.fill("#hangman-guess-input", "a");
await guest.click("#hangman-guess-form button[type=submit]");
await host.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("a"), code, { timeout: 8000 });
const h2 = await hangmanOf(host);
console.log(`   pontos por equipa: ${JSON.stringify(h2.teamScore || {})}`);
if (!(h2.teamScore?.t2 > 0)) fail("a letra certa do Beto devia contar para a equipa dele");
// E aparece na faixa durante o jogo.
await host.waitForFunction(() => document.querySelectorAll("[data-team-tag]").length >= 2, { timeout: 8000 });
const faixa = await host.evaluate(() => [...document.querySelectorAll("[data-team-tag]")].map((e) => e.textContent));
console.log(`   faixa das equipas: ${JSON.stringify(faixa)}`);
if (!faixa.join(" ").includes("Os Kotas")) fail("a faixa devia mostrar o nome escolhido pela equipa");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-teams FALHOU" : "=> mp-board-teams ok");
