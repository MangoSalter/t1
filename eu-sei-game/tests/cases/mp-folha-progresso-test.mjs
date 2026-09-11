// QUEM JÁ VAI ONDE, na folha de respostas.
//
// A ronda clássica são sessenta segundos a escrever às escuras: não se sabe
// se se está atrasado, e depois alguém carrega em "Acabei!" e a ronda fecha
// em cima de toda a gente. É a queixa que se lê nas aplicações de "Stop", e
// os números já estavam na sala — cada resposta é escrita à medida que se
// escreve. Faltava pô-los no ecrã.
//
// Corre num TELEMÓVEL, e não por escrúpulo: isto é uma tira que pode ter dez
// fichas, e o sítio onde uma tira de dez fichas estraga alguma coisa é um
// ecrã de 390px. É UI nova, portanto é medida (ver o CLAUDE.md).
import { chromium, devices } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const contexto = await browser.newContext({ ...devices["iPhone 13"] });
const page = await contexto.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Sala com quatro jogadores — três ligados e um que fechou o telemóvel...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await page.locator("#lobby-code").textContent()).trim();

await page.evaluate((c) => {
  window.__testDb.update(`rooms/${c}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
    p4: { name: "Duda", score: 0, connected: false },
  });
  window.__testDb.update(`rooms/${c}`, {
    round: 1,
    state: "categories",
    categoriesRound: { letter: "P", categoryIndexes: [0, 1, 2], endAt: Date.now() + 600000, finishedBy: null },
    answers: {
      p2: { c0: "Pombo", c1: "Porto", c2: "Pêra" },  // acabou
      p3: { c0: "Pato", c1: "   ", c2: "" },          // uma só; espaços não contam
      p4: { c0: "Peixe", c1: "Paris", c2: "Pêssego" }, // desligada: não aparece
    },
  });
}, code);
await page.waitForSelector('[data-screen="categories"].active', { timeout: 5000 });
await page.waitForTimeout(300);

const lerTira = () => page.evaluate(() => [...document.querySelectorAll("#cat-progress .chip")].map((c) => ({
  texto: c.textContent,
  nome: c.getAttribute("aria-label"),
  acabou: c.classList.contains("acabou"),
})));

console.log("2) A tira mostra os três ligados, e a Duda não está lá...");
let tira = await lerTira();
console.log("   " + tira.map((c) => `${c.texto}${c.acabou ? " ✓" : ""}`).join(" | "));
if (tira.length !== 3) { console.log(`   FALHOU: esperava 3 fichas, vi ${tira.length}`); process.exitCode = 1; }
if (tira.some((c) => /Duda/.test(c.texto))) { console.log("   FALHOU: quem está desligado não está a escrever"); process.exitCode = 1; }

const beto = tira.find((c) => /Beto/.test(c.texto));
const carla = tira.find((c) => /Carla/.test(c.texto));
const ana = tira.find((c) => /Ana/.test(c.texto));
if (!beto || !beto.texto.includes("3/3") || !beto.acabou) { console.log("   FALHOU: o Beto acabou e a ficha não o diz"); process.exitCode = 1; }
if (!carla || !carla.texto.includes("1/3") || carla.acabou) { console.log("   FALHOU: a Carla escreveu uma; espaços não são resposta"); process.exitCode = 1; }
if (!ana || !ana.texto.includes("0/3")) { console.log("   FALHOU: a Ana ainda não escreveu nada"); process.exitCode = 1; }
// A minha ficha vem à frente e marcada: com a sala cheia são dez, e
// procurar a sua contra o relógio é o oposto do que isto serve.
if (!/Ana/.test(tira[0].texto)) { console.log("   FALHOU: a minha ficha não vem à frente"); process.exitCode = 1; }
const marcada = await page.evaluate(() => {
  const meu = document.querySelector("#cat-progress .chip.sou-eu");
  const outro = [...document.querySelectorAll("#cat-progress .chip")].find((c) => !c.classList.contains("sou-eu"));
  if (!meu || !outro) return null;
  const a = getComputedStyle(meu); const b = getComputedStyle(outro);
  return { texto: meu.textContent, iguais: a.backgroundColor === b.backgroundColor && a.fontWeight === b.fontWeight };
});
console.log(`   a minha ficha: ${marcada ? `"${marcada.texto}", distinta=${!marcada.iguais}` : "não encontrada"}`);
if (!marcada) { console.log("   FALHOU: não há ficha marcada como minha"); process.exitCode = 1; }
else if (marcada.iguais) { console.log("   FALHOU: a classe está lá mas nada muda no ecrã"); process.exitCode = 1; }

console.log("3) O leitor de ecrã ouve uma frase, e não 'Ana zero barra três'...");
console.log(`   nome acessível: "${ana?.nome}"`);
if (!ana?.nome || !/\bAna\b/.test(ana.nome) || ana.nome === ana.texto) {
  console.log("   FALHOU: a ficha não tem nome acessível próprio");
  process.exitCode = 1;
}

console.log("4) A tira é VIVA: escrever uma resposta faz o número subir sozinho...");
const primeiro = page.locator("#cat-list .cat-item input").first();
await primeiro.fill("Pinheiro");
await page.waitForFunction(() => {
  const c = [...document.querySelectorAll("#cat-progress .chip")].find((x) => /Ana/.test(x.textContent));
  return c && c.textContent.includes("1/3");
}, null, { timeout: 5000 });
tira = await lerTira();
console.log("   " + tira.map((c) => c.texto).join(" | "));

console.log("5) E não pode partir a folha num telemóvel de 390px — com a SALA CHEIA...");
// Dez é o máximo da sala, e dez é o caso que interessa: com três fichas
// nunca se saberia se a tira enrola bem. Nomes longos de propósito.
await page.evaluate((c) => {
  const extra = {};
  ["Guilherme", "Madalena", "Francisco", "Constança", "Bernardo", "Leonor"].forEach((nome, i) => {
    extra[`p${10 + i}`] = { name: nome, score: 0, connected: true };
  });
  extra.p4 = { name: "Duda", score: 0, connected: true }; // volta a ligar-se: dez ao todo
  window.__testDb.update(`rooms/${c}/players`, extra);
}, code);
await page.waitForFunction(() => document.querySelectorAll("#cat-progress .chip").length === 10, null, { timeout: 5000 });
const medidas = await page.evaluate((largura) => {
  const tiraEl = document.getElementById("cat-progress");
  const botao = document.getElementById("cat-finish-btn");
  const lista = document.getElementById("cat-list");
  const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), largura: Math.round(b.width), altura: Math.round(b.height) }; };
  return {
    aparelho: largura,
    scrollBody: document.documentElement.scrollWidth,
    tira: r(tiraEl),
    botao: r(botao),
    lista: r(lista),
    // A tira ficou ABAIXO da folha de propósito: por cima empurrava as
    // respostas para fora do ecrã.
    depoisDaLista: tiraEl.getBoundingClientRect().top >= lista.getBoundingClientRect().bottom - 1,
  };
}, devices["iPhone 13"].viewport.width);
console.log(`   dez fichas · aparelho ${medidas.aparelho}px · scrollWidth ${medidas.scrollBody} · tira ${medidas.tira.largura}x${medidas.tira.altura} · botão ${medidas.botao.largura}x${medidas.botao.altura}`);
// Contra a largura do APARELHO e não window.innerWidth, que cresce com o
// transbordo e nunca falharia (ver CLAUDE.md).
if (medidas.scrollBody > medidas.aparelho) { console.log("   FALHOU: a página passou a rolar de lado"); process.exitCode = 1; }
if (medidas.tira.largura > medidas.aparelho) { console.log("   FALHOU: a tira é mais larga do que o telemóvel"); process.exitCode = 1; }
if (!medidas.depoisDaLista) { console.log("   FALHOU: a tira está acima da folha e empurra as respostas"); process.exitCode = 1; }
if (medidas.botao.altura < 44) { console.log(`   FALHOU: o "Acabei!" ficou com ${medidas.botao.altura}px`); process.exitCode = 1; }

console.log("5b) E a folha tem de dizer em que ronda vamos...");
// A partida clássica era a única do jogo que nunca dizia isto: o número
// estava no documento da sala desde sempre e só servia para escolher o texto
// de um botão no fim. Cinco rondas e nenhuma maneira de saber se se está na
// primeira ou na quarta.
await page.evaluate((c) => window.__testDb.update(`rooms/${c}`, { round: 3, config: { ...window.__testDb.get(`rooms/${c}`).config, numRounds: 5 } }), code);
await page.waitForFunction(() => /\d/.test(document.getElementById("cat-round")?.textContent || ""), null, { timeout: 5000 });
const contador = await page.evaluate(() => {
  const el = document.getElementById("cat-round");
  const b = el.getBoundingClientRect();
  return { texto: el.textContent.trim(), largura: Math.round(b.width), altura: Math.round(b.height) };
});
console.log(`   diz "${contador.texto}" (${contador.largura}x${contador.altura})`);
if (!/3/.test(contador.texto) || !/5/.test(contador.texto)) {
  console.log("   FALHOU: o contador não diz a ronda e o total"); process.exitCode = 1;
}
// O cabeçalho passou a ter três coisas; num telemóvel tem de enrolar em vez
// de transbordar (ver a regra do CLAUDE.md sobre medir contra o APARELHO).
const cabecalho = await page.evaluate((largura) => {
  const h = document.querySelector('[data-screen="categories"] .round-header');
  return { largura: Math.round(h.getBoundingClientRect().width), scroll: h.scrollWidth, aparelho: largura };
}, devices["iPhone 13"].viewport.width);
console.log(`   cabeçalho ${cabecalho.largura}px (scrollWidth ${cabecalho.scroll}) num aparelho de ${cabecalho.aparelho}px`);
if (cabecalho.scroll > cabecalho.aparelho) {
  console.log("   FALHOU: o cabeçalho da ronda transborda o telemóvel"); process.exitCode = 1;
}

console.log("6) Sozinho na sala não há tira: uma ficha só diz o que a folha já diz...");
await page.evaluate((c) => {
  const fora = { p2: null, p3: null, p4: null };
  for (let i = 0; i < 6; i += 1) fora[`p${10 + i}`] = null;
  window.__testDb.update(`rooms/${c}/players`, fora);
}, code);
await page.waitForFunction(() => document.querySelectorAll("#cat-progress .chip").length === 0, null, { timeout: 5000 });
const alturaVazia = await page.evaluate(() => document.getElementById("cat-progress").getBoundingClientRect().height);
console.log(`   fichas: 0, altura da tira: ${alturaVazia}px (o :empty do CSS esconde-a)`);
if (alturaVazia !== 0) { console.log("   FALHOU: a tira vazia continua a ocupar espaço"); process.exitCode = 1; }

if (errors.length) {
  console.log("\nErros na consola:");
  errors.forEach((e) => console.log("   " + e));
  process.exitCode = 1;
}
console.log(process.exitCode ? "\nO caso falhou." : "\nTudo certo.");
await browser.close();
