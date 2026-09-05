// Modos do quadro de sala, com DOIS clientes reais. O que interessa provar:
//  - um jogador sozinho NÃO muda o modo de uma sala com duas pessoas (a
//    votação é maioria dos ligados, não "quem carregar primeiro");
//  - quando a maioria vota, o quadro muda para os DOIS ao mesmo tempo;
//  - entrar na Forca tira a caneta a toda a gente até a sala votar em quem
//    fica com ela;
//  - quem tem a caneta vê a versão do desenhador (com as opções da caneta) e
//    quem não tem vê a versão cinzenta, sem elas;
//  - pedir a palavra aparece a toda a gente, pela ordem em que foi pedida.
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

console.log("1) Ana cria a sala, Beto entra, e vão para o quadro...");
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

const modeOf = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode, code);
console.log(`   modo inicial: ${await modeOf(host)}`);
if (await modeOf(host) !== "livre") fail("o quadro devia começar em desenho livre");

console.log("2) Quem tem a caneta vê a versão do desenhador; quem não tem, a cinzenta...");
const roleOf = (p) => p.evaluate(() => {
  const sc = document.querySelector('[data-screen="hangman"]');
  return {
    desenhador: sc.classList.contains("hangman-role-drawer"),
    espetador: sc.classList.contains("hangman-role-viewer"),
    opcoesDaCaneta: !document.getElementById("hangman-pen-zone").classList.contains("hidden"),
    botaoModoEmCima: !document.getElementById("hangman-mode-btn").classList.contains("hidden"),
    botaoModoEmBaixo: !document.getElementById("hangman-mode-btn-viewer").classList.contains("hidden"),
  };
});
const rHost = await roleOf(host);
const rGuest = await roleOf(guest);
console.log(`   Ana:  ${JSON.stringify(rHost)}`);
console.log(`   Beto: ${JSON.stringify(rGuest)}`);
if (!rHost.desenhador || !rHost.opcoesDaCaneta) fail("quem tem a caneta devia ver a versão do desenhador com as opções");
if (!rGuest.espetador || rGuest.opcoesDaCaneta) fail("quem não tem a caneta não devia ver as opções da caneta");
// O botão do modo existe nas duas versões, mas em zonas diferentes (2 e a).
if (!rHost.botaoModoEmCima || rHost.botaoModoEmBaixo) fail("no desenhador o botão do modo é o de cima (zona 2)");
if (rGuest.botaoModoEmCima || !rGuest.botaoModoEmBaixo) fail("em quem vê o botão do modo é o de baixo (zona a)");

console.log("3) UM voto sozinho NÃO muda o modo de uma sala de dois...");
await host.click("#hangman-mode-btn");
await host.click('[data-mode-choice="forca"]');
await host.waitForTimeout(700);
console.log(`   modo depois do voto da Ana: ${await modeOf(host)} (esperado livre)`);
if (await modeOf(host) !== "livre") fail("um voto em dois jogadores mudou o modo — a maioria não está a ser respeitada");

console.log("4) Com o segundo voto, o quadro muda para os DOIS...");
await guest.click("#hangman-mode-btn-viewer");
await guest.click('[data-mode-choice="forca"]');
await host.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "forca", code, { timeout: 8000 });
console.log(`   modo: ${await modeOf(host)}`);
await guest.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).hangman?.mode === "forca", code, { timeout: 8000 });
console.log("   os dois clientes estão no mesmo modo");

console.log("5) Entrar na Forca tira a caneta até a sala votar...");
const leaderOf = (p) => p.evaluate((c) => window.__testDb.get(`rooms/${c}`).hangman?.leaderId || null, code);
console.log(`   quem tem a caneta: ${await leaderOf(host)} (esperado ninguém)`);
if (await leaderOf(host) !== null) fail("ao entrar na Forca a caneta devia ficar por decidir");
// E a votação aparece sozinha, sem ninguém ter de a procurar.
await host.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 5000 });
await guest.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 5000 });
const temFechar = await host.evaluate(() => !document.getElementById("hangman-penvote-cancel-btn").classList.contains("hidden"));
if (temFechar) fail("a votação obrigatória não devia ter botão de fechar");

console.log("6) Os dois votam no Beto: a caneta passa para ele...");
const betoId = await host.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Beto");
}, code);
await host.click(`[data-pen-vote-choice="${betoId}"]`);
await host.waitForTimeout(400);
if (await leaderOf(host) === betoId) fail("um voto em dois jogadores deu logo a caneta — a maioria não está a ser respeitada");
await guest.click(`[data-pen-vote-choice="${betoId}"]`);
await host.waitForFunction((args) => window.__testDb.get(`rooms/${args[0]}`).hangman?.leaderId === args[1], [code, betoId], { timeout: 8000 });
console.log("   o Beto ficou com a caneta");

console.log("7) Os papéis trocaram nos dois ecrãs...");
await host.waitForTimeout(500);
const rHost2 = await roleOf(host);
const rGuest2 = await roleOf(guest);
console.log(`   Ana:  ${JSON.stringify(rHost2)}`);
console.log(`   Beto: ${JSON.stringify(rGuest2)}`);
if (rHost2.desenhador || rHost2.opcoesDaCaneta) fail("a Ana já não tem a caneta e não devia ver as opções");
if (!rGuest2.desenhador || !rGuest2.opcoesDaCaneta) fail("o Beto tem a caneta e devia ver a versão do desenhador");

console.log("8) Quem não tem a caneta pede a palavra, e todos veem a fila...");
const handVisible = (p) => p.evaluate(() => !document.getElementById("hangman-hand-btn").classList.contains("hidden"));
console.log(`   botão de pedir a palavra — Ana: ${await handVisible(host)}, Beto: ${await handVisible(guest)}`);
if (!(await handVisible(host))) fail("quem não tem a caneta devia poder pedir a palavra");
if (await handVisible(guest)) fail("quem tem a caneta não precisa de pedir a palavra");
await host.click("#hangman-hand-btn");
await guest.waitForFunction(() => document.getElementById("hangman-hand-queue").textContent.includes("Ana"), { timeout: 8000 });
const fila = await guest.locator("#hangman-hand-queue").textContent();
console.log(`   o Beto vê: "${fila.trim()}"`);
if (!fila.includes("Ana")) fail("o pedido de palavra não chegou ao outro jogador");
// E baixar o braço tira-o da fila.
await host.click("#hangman-hand-btn");
await guest.waitForFunction(() => !document.getElementById("hangman-hand-queue").textContent.includes("Ana"), { timeout: 8000 });
console.log("   baixar o braço tira-o da fila: ok");

console.log("9) As cores e a borracha só existem para quem desenha...");
await guest.click('[data-hangman-color="#b24b38"]');
const corEscolhida = await guest.evaluate(() => document.querySelector('[data-hangman-color="#b24b38"]').getAttribute("aria-pressed"));
if (corEscolhida !== "true") fail("escolher a cor não ficou marcado");
await guest.click("#hangman-eraser-btn");
const borracha = await guest.evaluate(() => document.getElementById("hangman-eraser-btn").getAttribute("aria-pressed"));
if (borracha !== "true") fail("a borracha não ficou selecionada");
// Escolher cor com a borracha na mão volta a escrever.
await guest.click('[data-hangman-color="#5b7442"]');
const borrachaDepois = await guest.evaluate(() => document.getElementById("hangman-eraser-btn").getAttribute("aria-pressed"));
if (borrachaDepois !== "false") fail("escolher uma cor devia largar a borracha");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mp-board-modes FALHOU" : "=> mp-board-modes ok");
