// Rede de segurança do quadro: abre-o e mexe em tudo o que abre e fecha,
// falhando a qualquer erro de JavaScript.
//
// Existe por uma razão concreta: duas vezes no mesmo dia usei uma variável
// antes de ela estar declarada dentro de renderHangman. Nas duas, a função
// rebentava inteira e o quadro nem chegava a abrir — e nas duas o defeito só
// apareceu num teste que ia fazer outra coisa qualquer, muito depois. Um erro
// que impede o ecrã de abrir tem de falhar no primeiro segundo, não no
// vigésimo passo de outro caso.
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const context = await browser.newContext();
const errors = [];
const host = await context.newPage();
const guest = await context.newPage();
for (const [nome, p] of [["Ana", host], ["Beto", guest]]) {
  p.on("pageerror", (e) => errors.push(`${nome}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${nome}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const semErros = (onde) => {
  if (errors.length === 0) return;
  fail(`erro de JavaScript ${onde}: ${errors[0]}`);
  errors.length = 0;
};

console.log("1) Abrir o quadro não pode dar erro nenhum...");
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
await host.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
await guest.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
console.log("   o quadro abriu nos dois");
semErros("ao abrir o quadro");

console.log("2) Todos os ecrãs que abrem e fecham, um a um...");
// Cada um destes já rebentou alguma vez, ou está a um erro de ordem de o
// fazer. Abre-se e fecha-se cada um, e qualquer erro falha aqui.
const passos = [
  ["equipas", "#hangman-teams-btn", "#hangman-teams-overlay", "#hangman-teams-close-btn"],
  ["modo do quadro", "#hangman-mode-btn", "#hangman-mode-overlay", "#hangman-mode-cancel-btn"],
];
for (const [nome, abrir, ecra, fechar] of passos) {
  const visivel = await host.locator(abrir).isVisible().catch(() => false);
  if (!visivel) { console.log(`   (${nome}: botão não visível neste estado, saltado)`); continue; }
  await host.click(abrir);
  await host.waitForSelector(`${ecra}:not(.hidden)`, { timeout: 5000 });
  await host.click(fechar);
  console.log(`   ${nome}: abriu e fechou`);
  semErros(`ao abrir "${nome}"`);
}

console.log("3) Desenhar na folha não pode dar erro...");
const caixa = await host.locator("#hangman-doodle-canvas").boundingBox();
await host.mouse.move(caixa.x + 120, caixa.y + 120);
await host.mouse.down();
for (let i = 1; i <= 8; i += 1) await host.mouse.move(caixa.x + 120 + i * 18, caixa.y + 120 + i * 9);
await host.mouse.up();
await host.waitForTimeout(400);
const pontos = await host.evaluate((c) =>
  Object.keys(window.__testDb.get(`rooms/${c}`).hangman?.doodle?.points || {}).length, code);
console.log(`   ${pontos} pontos no quadro`);
if (pontos === 0) fail("desenhar não deixou nada na folha");
semErros("ao desenhar");

console.log("4) Entrar na Forca e passar por todos os ecrãs obrigatórios...");
await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
for (const p of [host, guest]) await p.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await host.click('[data-color-choice="#b24b38"]');
await guest.click('[data-color-choice="#5c7e91"]');
semErros("ao escolher a cor");
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
const anaId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, code);
await host.click(`[data-pen-vote-choice="${anaId}"]`);
await host.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [code, anaId], { timeout: 8000 });
semErros("ao votar na caneta");

console.log("5) Definições e palavra em jogo...");
await host.click("#hangman-settings-btn");
await host.waitForSelector("#hangman-settings-overlay:not(.hidden)", { timeout: 5000 });
await host.click("#hangman-settings-close-btn");
semErros("nas definições");
await host.fill("#hangman-word-input", "banana, manga");
await host.fill("#hangman-hint-input", "frutas");
await host.click("#hangman-word-form button[type=submit]");
await guest.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.mask, code, { timeout: 8000 });
semErros("ao pôr a palavra");

console.log("6) Arriscar uma letra certa e uma errada...");
await guest.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
await guest.fill("#hangman-guess-input", "a");
await guest.click("#hangman-guess-form button[type=submit]");
await host.waitForFunction((c) => (window.__testDb.get(`rooms/${c}`).hangman.mask || "").includes("a"), code, { timeout: 10000 });
semErros("ao acertar uma letra");
await guest.fill("#hangman-guess-input", "z");
await guest.click("#hangman-guess-form button[type=submit]");
await host.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.wrong?.z, code, { timeout: 10000 });
semErros("ao errar uma letra");

console.log("7) E a folha continua a desenhar-se depois de tudo isto...");
await host.evaluate(() => {
  const c = document.getElementById("hangman-doodle-canvas");
  if (!c || c.width === 0) throw new Error("a tela do quadro ficou sem tamanho");
});
const ecraAtivo = await host.evaluate(() => document.querySelector(".screen.active")?.dataset.screen);
console.log(`   ecrã activo no fim: ${ecraAtivo}`);
if (ecraAtivo !== "hangman") fail(`o quadro devia continuar aberto (está em "${ecraAtivo}")`);
semErros("no fim");

console.log("8) E no telemóvel a folha continua a ser o jogo, não a barra...");
// Medido num iPhone 13 antes desta regra existir: a barra ocupava 307px de
// 664 — 46% do ecrã só para botões, com a folha reduzida a 345px. Num quadro,
// a folha É o jogo; a barra é só o meio para lá chegar.
const { devices } = await import("playwright");
const mob = await browser.newContext({ ...devices["iPhone 13"] });
const mpage = await mob.newPage();
const errosMob = [];
mpage.on("pageerror", (e) => errosMob.push(e.message));
await mpage.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await mpage.fill("#name-input", "Carla");
await mpage.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await mpage.click("#create-room-btn");
await mpage.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await mpage.click('[data-mp-game="hangman"]');
await mpage.waitForSelector('[data-screen="hangman"].active', { timeout: 8000 });
const medidas = await mpage.evaluate(() => {
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !!el.offsetParent;
  };
  const barra = document.querySelector(".hangman-toolbar").getBoundingClientRect();
  const tela = document.getElementById("hangman-doodle-canvas").getBoundingClientRect();
  const pequenos = [];
  document.querySelectorAll(".screen.active button, .screen.active select, .screen.active label").forEach((el) => {
    if (!visivel(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 40 || r.width < 40) {
      pequenos.push(`${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  });
  return {
    parteDaBarra: barra.height / window.innerHeight,
    tela: Math.round(tela.height),
    pequenos,
    // A página nunca pode deslizar na horizontal: dentro de uma fila, sim; a
    // página inteira, não.
    deslizaAPagina: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});
console.log(`   barra: ${Math.round(medidas.parteDaBarra * 100)}% do ecrã, folha: ${medidas.tela}px`);
console.log(`   alvos abaixo de 40px: ${medidas.pequenos.length ? medidas.pequenos.join(" | ") : "nenhum"}`);
if (medidas.parteDaBarra > 0.33) {
  fail(`a barra ocupa ${Math.round(medidas.parteDaBarra * 100)}% do ecrã — a folha é que devia mandar`);
}
if (medidas.pequenos.length > 0) fail(`alvos pequenos demais para o dedo: ${medidas.pequenos.join(", ")}`);
if (medidas.deslizaAPagina) fail("a página desliza na horizontal");
if (errosMob.length > 0) fail(`erro de JavaScript no telemóvel: ${errosMob[0]}`);
await mob.close();

await browser.close();
console.log(process.exitCode ? "=> mp-board-smoke FALHOU" : "=> mp-board-smoke ok");
