// O PRAZO DA ESCOLHA DA LETRA.
//
// Quem ganha a bola escolhe a letra da ronda. Era a única fase da partida
// sem prazo: as categorias e a votação têm endAt e o anfitrião fecha-as
// quando o relógio chega ao fim, esta não tinha nada. Bastava a pessoa que
// ganhou a bola pousar o telemóvel — sem se desligar, que essa saída já
// existia ao fim de 8s — para a sala inteira ficar a ler "a Beto está a
// escolher a letra..." para sempre, sem nada no ecrã a dizer se ainda ia
// acontecer alguma coisa.
//
// Este caso põe a Ana (anfitriã, é ela que corre o laço) a ver o Beto
// escolher. O Beto nunca carrega em nada.
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// net::ERR_* são falhas de rede do ambiente (o tipo de letra do Google, que
// este contentor não alcança). Um recurso NOSSO em falta dá 404, não
// net::ERR_, por isso filtrar isto não esconde avarias nossas.
page.on("console", (msg) => { if (msg.type() === "error" && !msg.text().includes("net::ERR_")) errors.push(msg.text()); });

await page.goto("http://localhost:8937/index.html", { waitUntil: "networkidle" });

console.log("1) Criar sala com 3 jogadores e pôr a fase da letra, com o Beto a escolher...");
await page.fill("#name-input", "Ana");
await page.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 3000 });
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 3000 });
const code = await page.locator("#lobby-code").textContent();

async function porFaseDaLetra(segundos) {
  await page.evaluate(({ code, segundos }) => {
    window.__testDb.update(`rooms/${code}/players`, {
      p2: { name: "Beto", score: 0, connected: true },
      p3: { name: "Carla", score: 0, connected: true },
    });
    window.__testDb.update(`rooms/${code}`, {
      round: 1,
      state: "letterPick",
      ball: { appearAt: Date.now() - 5000, winnerId: "p2" },
      letterPick: {
        candidates: ["M", "P", "T"],
        // A Carla votou no T; o Beto, que é quem escolhe, não votou em nada.
        votes: { p3: "T" },
        chosen: null,
        startedAt: Date.now(),
        endAt: Date.now() + segundos * 1000,
      },
      categoriesRound: null,
      answers: null,
      votes: null,
    });
  }, { code, segundos });
  await page.waitForSelector('[data-screen="letterpick"].active', { timeout: 3000 });
}

await porFaseDaLetra(30);
console.log("   OK: no ecrã da escolha da letra");

console.log("2) O relógio tem de estar à vista — sem ele, 'a escolher...' não se distingue de encravado...");
const relogio = page.locator("#letter-timer");
await page.waitForFunction(() => {
  const el = document.getElementById("letter-timer");
  return el && /\d/.test(el.textContent || "");
}, null, { timeout: 3000 });
const texto = (await relogio.textContent()).trim();
const caixa = await relogio.boundingBox();
console.log(`   relógio: "${texto}", visível: ${!!caixa && caixa.height > 0}`);
if (!caixa || caixa.height <= 0) { console.log("   FALHOU: o relógio não está visível"); process.exitCode = 1; }

console.log("3) Com o prazo longe, ninguém pode fechar a fase por baixo do Beto...");
await page.waitForTimeout(2500);
let sala = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   estado: ${sala.state}, letra escolhida: ${JSON.stringify(sala.letterPick.chosen)}`);
if (sala.state !== "letterPick" || sala.letterPick.chosen) {
  console.log("   FALHOU: a fase fechou-se sozinha antes do prazo");
  process.exitCode = 1;
}

console.log("4) Prazo esgotado: a fase fecha e sai a letra MAIS VOTADA (T, da Carla), não a primeira da lista (M)...");
await page.evaluate((c) => {
  window.__testDb.update(`rooms/${c}/letterPick`, { endAt: Date.now() - 1000 });
}, code);
await page.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).state === "categories", code, { timeout: 8000 });
sala = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   estado: ${sala.state}, letra: ${sala.letterPick.chosen}, ronda: ${sala.categoriesRound?.letter}`);
if (sala.letterPick.chosen !== "T") {
  console.log(`   FALHOU: esperava T (o voto da Carla), saiu ${sala.letterPick.chosen}`);
  process.exitCode = 1;
}
if (sala.categoriesRound?.letter !== "T") {
  console.log("   FALHOU: a ronda não começou com a letra escolhida");
  process.exitCode = 1;
}
await page.waitForSelector('[data-screen="categories"].active', { timeout: 3000 });
console.log("   OK: a ronda arrancou");

console.log("5) O relógio da letra não pode ficar a contar depois de a fase acabar...");
await page.waitForTimeout(300);
const sobra = (await relogio.textContent()).trim();
console.log(`   relógio depois de sair da fase: "${sobra}"`);
if (sobra !== "") { console.log("   FALHOU: o relógio continua a contar fora da fase"); process.exitCode = 1; }

console.log("6) A saída antiga continua lá: se quem escolhe se DESLIGAR, não se esperam os 25s...");
await porFaseDaLetra(120);
await page.evaluate((c) => {
  window.__testDb.update(`rooms/${c}/players/p2`, { name: "Beto", score: 0, connected: false });
  window.__testDb.update(`rooms/${c}/letterPick`, { startedAt: Date.now() - 9000 });
}, code);
await page.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).state === "categories", code, { timeout: 8000 });
sala = await page.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   letra: ${sala.letterPick.chosen} (esperado T, o voto da Carla, e não M)`);
if (sala.letterPick.chosen !== "T") {
  console.log("   FALHOU: com o vencedor desligado a letra devia ser a mais votada");
  process.exitCode = 1;
}

if (errors.length) {
  console.log("\nErros na consola:");
  errors.forEach((e) => console.log("   " + e));
  process.exitCode = 1;
}
console.log(process.exitCode ? "\nO caso falhou." : "\nTudo certo.");
await browser.close();
