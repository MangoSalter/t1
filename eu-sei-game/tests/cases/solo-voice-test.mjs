// Modo mínimo e modo guiado. A regra dura é a do modo MÍNIMO: não diz nada,
// nunca. O guiado é que fala — e tem de continuar a funcionar em máquinas
// onde não há voz nenhuma instalada, que é o caso desta.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text()); });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

// Lê e limpa o registo do próprio módulo de voz. Antes isto passava por uma
// lista no window, que o duplo e o teste viam de forma diferente: o duplo
// escrevia numa e o teste limpava outra.
const ouviu = (p) => p.evaluate(async () => (await import("./js/voice.js")).__voice.said.slice());
const limparOuvido = (p) => p.evaluate(async () => { (await import("./js/voice.js")).__voice.said.length = 0; });

// O <details> guarda o seu estado: clicar no resumo ALTERNA, e se já estava
// aberto o clique fecha-o. Garante-se o estado em vez de alternar às cegas.
async function abrirPainel(p) {
  await p.evaluate(() => {
    const d = document.querySelector(".solo-presentation");
    if (d && !d.open) d.open = true;
  });
}

// Sair de um mini-jogo avulso: pelo HUD (pausa -> sair), que é o caminho que
// o jogador tem. [data-solo-leave] só existe nos ecrãs de listagem.
async function sairDoJogo(p) {
  await p.click("#game-hud-pause-btn");
  await p.waitForFunction(() => !document.getElementById("pause-overlay").classList.contains("hidden"), { timeout: 5000 });
  await p.click("#pause-exit-btn");
  await p.waitForSelector('[data-screen="solo-menu"].active', { timeout: 5000 });
}

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

// Um sintetizador de mentira: esta máquina não tem vozes instaladas, e sem
// isto não haveria como verificar o que a app TENTA dizer. Substitui só o
// browser, não o código do jogo.
await page.addInitScript(() => {
  // window.speechSynthesis e uma propriedade SO DE LEITURA: atribuir-lhe nao
  // faz nada e fica a valer o sintetizador verdadeiro, que depois recusa o
  // objeto falso. Tem de ser defineProperty.
  const dito = [];
  window.__ditas = dito;
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    get: () => ({
      speak: (u) => { dito.push(u.text); },
      cancel: () => {},
      getVoices: () => [{ lang: "pt-PT", name: "Voz de teste" }],
    }),
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true, writable: true,
    value: function (t) { this.text = t; },
  });
});
await page.reload({ waitUntil: "networkidle" });

console.log("1) O jogo começa no modo mínimo...");
await page.click("#solo-menu-btn");
await abrirPainel(page);
const inicial = await page.evaluate(() =>
  document.querySelector('[data-presentation="minimo"]').getAttribute("aria-pressed"));
console.log(`   "mínimo" marcado: ${inicial}`);
if (inicial !== "true") fail("o modo por omissão devia ser o mínimo");
// E no mínimo, a escolha da voz não aparece: um interruptor que não faz nada
// é pior do que não existir.
if (await page.locator("#solo-voice-row").isVisible()) {
  fail("a escolha da voz não devia aparecer no modo mínimo");
}

console.log("2) NO MODO MÍNIMO A APP NÃO DIZ NADA...");
await limparOuvido(page);
await page.click("#solo-play-bug-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 });
const ditasMinimo = await ouviu(page);
console.log(`   frases ditas no modo mínimo: ${ditasMinimo.length}`);
if (ditasMinimo.length !== 0) fail(`o modo mínimo falou: ${JSON.stringify(ditasMinimo)}`);
await page.click("#ready-start-btn");
await page.waitForTimeout(500);
const ditasDurante = (await ouviu(page)).length;
if (ditasDurante !== 0) fail("o modo mínimo falou durante o jogo");

console.log("3) No modo guiado, o portão diz que jogo vem E o que se faz...");
await sairDoJogo(page);
await abrirPainel(page);
await page.click('[data-presentation="guiado"]');
await limparOuvido(page);
await page.click("#solo-play-bug-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 });
const diagnostico = await page.evaluate(async () => {
  const v = await import("./js/voice.js");
  return { modo: v.presentationMode(), voz: v.voiceEnabled(), suportado: v.voiceSupported(), tentou: v.__voice.said.slice(-3) };
});
console.log(`   diagnóstico: ${JSON.stringify(diagnostico)}`);
const ditasGuiado = await ouviu(page);
console.log(`   disse: ${JSON.stringify(ditasGuiado)}`);
if (ditasGuiado.length === 0) fail("o modo guiado não disse nada no portão");
const frase = ditasGuiado.join(" ");
if (!frase.includes("Mata o Inseto")) fail("devia dizer o nome do jogo");
if (!/insetos|toca/i.test(frase)) fail("devia dizer o que se faz no jogo, não só o nome");

console.log("4) As instruções são escritas para ser OUVIDAS...");
// Um sintetizador lê tudo: parênteses, barras e emoji viram ruído.
const problemas = await page.evaluate(async () => {
  const { GAME_HOWTO } = await import("./js/data.js");
  return Object.entries(GAME_HOWTO)
    .filter(([, texto]) => /[()\/\[\]<>*_#]|\p{Extended_Pictographic}/u.test(texto))
    .map(([k]) => k);
});
console.log(`   instruções com símbolos que a voz leria em voz alta: ${problemas.length ? problemas.join(", ") : "nenhuma"}`);
if (problemas.length > 0) fail(`estas instruções têm símbolos: ${problemas.join(", ")}`);
// E todos os mini-jogos têm instrução: um sem ela deixava quem joga sozinho
// sem saber o que fazer, que é exatamente o que este modo veio resolver.
const semInstrucao = await page.evaluate(async () => {
  const { GAME_HOWTO } = await import("./js/data.js");
  const chaves = ["reflex", "word", "bug", "monkey", "memory", "hangman", "map", "pacman", "golf", "cards", "car", "landmark"];
  return chaves.filter((k) => !GAME_HOWTO[k] || GAME_HOWTO[k].length < 20);
});
if (semInstrucao.length > 0) fail(`mini-jogos sem instrução falada: ${semInstrucao.join(", ")}`);

console.log("5) Desligar a voz cala a app, mesmo no modo guiado...");
await page.click("#ready-start-btn");
await page.waitForTimeout(400);
await sairDoJogo(page);
await abrirPainel(page);
await page.click("#solo-voice-toggle");
await limparOuvido(page);
await page.click("#solo-play-bug-btn");
await page.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 });
const comVozDesligada = (await ouviu(page)).length;
console.log(`   frases com a voz desligada: ${comVozDesligada}`);
if (comVozDesligada !== 0) fail("a voz desligada continuou a falar");

console.log("6) A escolha fica guardada entre sessões...");
await page.reload({ waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
await abrirPainel(page);
const depoisDeRecarregar = await page.evaluate(() => ({
  modo: document.querySelector('[data-presentation="guiado"]').getAttribute("aria-pressed"),
  voz: document.getElementById("solo-voice-toggle").checked,
}));
console.log(`   modo guiado: ${depoisDeRecarregar.modo}, voz: ${depoisDeRecarregar.voz}`);
if (depoisDeRecarregar.modo !== "true") fail("o modo escolhido não sobreviveu a recarregar");
if (depoisDeRecarregar.voz) fail("a voz desligada voltou a ligar-se sozinha");

console.log("7) Sem sintetizador nenhum, o jogo funciona à mesma...");
// O jogo não pode depender de conseguir falar. Aqui tira-se o sintetizador
// por completo e o portão tem de continuar a abrir.
const semVoz = await browser.newPage();
await semVoz.addInitScript(() => {
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
});
await semVoz.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
const errosSemVoz = [];
semVoz.on("pageerror", (e) => errosSemVoz.push(e.message));
await semVoz.click("#solo-menu-btn");
await semVoz.click(".solo-presentation summary");
await semVoz.click('[data-presentation="guiado"]');
await semVoz.click("#solo-play-bug-btn");
await semVoz.waitForSelector("#ready-overlay:not(.hidden)", { timeout: 5000 });
const avisoVisivel = await semVoz.locator("#solo-voice-warning").count();
console.log(`   o portão abriu sem sintetizador, e há aviso no ecrã: ${avisoVisivel > 0}`);
if (errosSemVoz.length > 0) fail(`sem sintetizador deu erro: ${errosSemVoz[0]}`);


console.log("8) Na SALA, o modo guiado narra o que acontece — e nunca a palavra...");
// Este é o caso que o modo guiado veio servir: jogar com outras pessoas
// online sem canal de voz. Sem ninguém a dizer o que se passa, a app diz.
const ctx = await browser.newContext();
const anaP = await ctx.newPage();
const betoP = await ctx.newPage();
for (const p of [anaP, betoP]) {
  await p.addInitScript(() => {
    // window.speechSynthesis e uma propriedade SO DE LEITURA: atribuir-lhe nao
    // faz nada e fica a valer o sintetizador verdadeiro, que depois recusa o
    // objeto falso. Tem de ser defineProperty.
    const dito = [];
    window.__ditas = dito;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      get: () => ({
        speak: (u) => { dito.push(u.text); },
        cancel: () => {},
        getVoices: () => [{ lang: "pt-PT", name: "Voz de teste" }],
      }),
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true, writable: true,
      value: function (t) { this.text = t; },
    });
    localStorage.setItem("euSei_presentationMode", "guiado");
  });
}
await anaP.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await anaP.fill("#name-input", "Ana");
await anaP.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await anaP.click("#create-room-btn");
await anaP.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const codigo = (await anaP.locator("#lobby-code").textContent()).trim();
await betoP.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await betoP.fill("#name-input", "Beto");
await betoP.fill("#join-code-input", codigo);
await betoP.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await betoP.click("#join-room-btn");
await betoP.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await anaP.click('[data-mp-game="hangman"]');
await anaP.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await betoP.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
await anaP.click("#hangman-mode-btn");
await anaP.click('[data-mode-choice="forca"]');
await anaP.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await anaP.click('[data-color-choice="#b24b38"]');
await betoP.waitForSelector("#hangman-color-overlay:not(.hidden)", { timeout: 8000 });
await betoP.click('[data-color-choice="#5c7e91"]');
const idAna = await anaP.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return Object.keys(r.players).find((u) => r.players[u].name === "Ana");
}, codigo);
await anaP.waitForSelector("#hangman-penvote-overlay:not(.hidden)", { timeout: 8000 });
await anaP.click(`[data-pen-vote-choice="${idAna}"]`);
await anaP.waitForFunction((a) => window.__testDb.get(`rooms/${a[0]}`).hangman?.leaderId === a[1], [codigo, idAna], { timeout: 8000 });

await limparOuvido(betoP);
await anaP.fill("#hangman-word-input", "banana");
await anaP.fill("#hangman-hint-input", "fruta");
await anaP.click("#hangman-word-form button[type=submit]");
await betoP.waitForFunction(async () => (await import("./js/voice.js")).__voice.said.some((t) => /letras/i.test(t)), { timeout: 8000 });
const ditoAoBeto = await ouviu(betoP);
console.log(`   o Beto ouviu: ${JSON.stringify(ditoAoBeto)}`);
const tudo = ditoAoBeto.join(" ").toLowerCase();
if (!/6 letras/.test(tudo)) fail("devia dizer quantas letras tem a palavra");
if (!/fruta/.test(tudo)) fail("devia dizer a pista, que é pública");
// A REGRA DURA: a palavra nunca pode ser dita.
if (/banana/.test(tudo)) fail("A PALAVRA ESCONDIDA FOI DITA EM VOZ ALTA");

console.log("9) E narra as letras erradas com o nome de quem as disse...");
await limparOuvido(betoP);
await betoP.waitForFunction(() => !document.getElementById("hangman-guess-form").classList.contains("hidden"), { timeout: 8000 });
await betoP.fill("#hangman-guess-input", "z");
await betoP.click("#hangman-guess-form button[type=submit]");
await anaP.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).hangman.wrong?.z, codigo, { timeout: 8000 });
await betoP.waitForFunction(async () => (await import("./js/voice.js")).__voice.said.some((t) => /não está na palavra/i.test(t)), { timeout: 8000 });
const sobreOErro = await ouviu(betoP);
console.log(`   ouviu: ${JSON.stringify(sobreOErro)}`);
if (!sobreOErro.join(" ").includes("Beto")) fail("devia dizer quem disse a letra");
// E continua sem dizer a palavra.
if (/banana/i.test(sobreOErro.join(" "))) fail("A PALAVRA FOI DITA");

console.log("10) No modo mínimo, a sala fica calada...");
// Sem terceiro jogador: entrar numa sala a meio de um jogo não é permitido, e
// essa é uma regra do jogo, não um problema a contornar. A mesma coisa
// prova-se com o Beto a passar para o modo mínimo a meio.
await betoP.evaluate(async () => {
  const v = await import("./js/voice.js");
  v.setPresentationMode("minimo");
  v.__voice.said.length = 0;
});
await anaP.evaluate(async () => { (await import("./js/voice.js")).__voice.said.length = 0; });
// Mexe-se na sala, para haver o que narrar.
await anaP.click("#hangman-passturn-btn");
await anaP.waitForTimeout(1200);
const ditasCalado = (await ouviu(betoP)).length;
console.log(`   frases ditas ao Beto depois de passar a mínimo: ${ditasCalado}`);
if (ditasCalado !== 0) fail("o modo mínimo falou na sala");
// E a Ana, que ficou no guiado, continua a ser narrada — senão isto só
// provava que a narração parou para todos.
await betoP.evaluate(async () => {
  const v = await import("./js/voice.js");
  v.setPresentationMode("guiado");
});

await ctx.close();

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> solo-voice FALHOU" : "=> solo-voice ok");
