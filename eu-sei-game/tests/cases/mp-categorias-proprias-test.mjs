// AS CATEGORIAS DA CASA.
//
// O "Stop" de papel joga-se com as categorias que o grupo inventa. As
// aplicações do género deixam ESCOLHER de uma lista fixa e não deixam
// ACRESCENTAR — é o que os jogadores pedem nas críticas, e é o que este
// teste guarda: escrever uma categoria, vê-la sortear-se numa ronda a sério,
// e apagá-la sem deixar a sala a sortear um índice sem nome.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const erros = [];
const falhar = (m) => { console.log(`   FALHOU: ${m}`); process.exitCode = 1; };

const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const anfitria = await ctx.newPage();
anfitria.on("pageerror", (e) => erros.push(e.message));
anfitria.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
await anfitria.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await anfitria.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await anfitria.reload({ waitUntil: "networkidle" });

console.log("1) Criar sala e escrever duas categorias da casa...");
await anfitria.fill("#name-input", "Ana");
await anfitria.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await anfitria.click("#create-room-btn");
await anfitria.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await anfitria.locator("#lobby-code").textContent()).trim();
await anfitria.evaluate(() => (() => { let el = document.getElementById("cfg-cat-grid"); while (el) { if (el.tagName === "DETAILS") el.open = true; el = el.parentElement; } })());
await anfitria.waitForSelector("#cfg-cat-propria-input", { state: "visible", timeout: 8000 });
for (const nome of ["Marcas de carro", "Coisas da avó"]) {
  await anfitria.fill("#cfg-cat-propria-input", nome);
  await anfitria.click("#cfg-cat-propria-form button[type=submit]");
  await anfitria.waitForTimeout(250);
}
let sala = await anfitria.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   na sala: ${JSON.stringify(sala.config.customCategories)}`);
if (JSON.stringify(sala.config.customCategories) !== JSON.stringify(["Marcas de carro", "Coisas da avó"])) {
  falhar("as duas categorias deviam estar guardadas na sala, por ordem");
}
const chips = await anfitria.locator("#cfg-cat-propria-lista li span").allTextContents();
console.log(`   bolhas no ecrã: ${chips.join(", ")}`);
if (chips.length !== 2) falhar("deviam aparecer duas bolhas");
const naGrelha = await anfitria.locator('#cfg-cat-grid label.cat-propria').allTextContents();
console.log(`   na grelha: ${naGrelha.join(", ")}`);
if (naGrelha.length !== 2) falhar("as da casa deviam estar na grelha de ativas, marcadas");

console.log("2) Repetida e vazia não entram, e diz-se porquê...");
await anfitria.fill("#cfg-cat-propria-input", "  marcas de carro  ");
await anfitria.click("#cfg-cat-propria-form button[type=submit]");
await anfitria.waitForTimeout(250);
const aviso = (await anfitria.locator("#cfg-cat-propria-aviso").textContent()).trim();
sala = await anfitria.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   aviso: "${aviso}", continuam ${sala.config.customCategories.length}`);
if (sala.config.customCategories.length !== 2) falhar("uma repetida (com espaços e maiúsculas diferentes) não devia entrar");
if (!aviso) falhar("sem aviso, quem escreveu não percebe porque não aconteceu nada");

console.log("3) Quem entra a seguir vê as categorias da casa (sem ser anfitrião)...");
const convidado = await ctx.newPage();
convidado.on("pageerror", (e) => erros.push(e.message));
await convidado.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await convidado.fill("#name-input", "Beto");
await convidado.fill("#join-code-input", code);
await convidado.click("#join-room-btn");
await convidado.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await convidado.evaluate(() => (() => { let el = document.getElementById("cfg-cat-grid"); while (el) { if (el.tagName === "DETAILS") el.open = true; el = el.parentElement; } })());
await convidado.waitForTimeout(400);
const chipsConvidado = await convidado.locator("#cfg-cat-propria-lista li span").allTextContents();
const formEscondido = await convidado.locator("#cfg-cat-propria-form").isHidden();
console.log(`   o convidado vê ${chipsConvidado.length} bolhas; formulário escondido para ele: ${formEscondido}`);
if (chipsConvidado.length !== 2) falhar("quem entra tem de saber com que categorias se vai jogar");
if (!formEscondido) falhar("só o anfitrião escreve categorias");

console.log("4) Uma ronda a sério com a categoria da casa sorteada...");
await anfitria.evaluate((c) => {
  const sala = window.__testDb.get(`rooms/${c}`);
  window.__testDb.update(`rooms/${c}/config`, { enabledCategories: [100, 101, 0, 1], numCategories: 2 });
  window.__testDb.update(`rooms/${c}`, { round: 1, state: "categories", categoriesRound: {
    letter: "M", categoryIndexes: [100, 0], endAt: Date.now() + 90000,
  }, answers: null, votes: null });
  return sala;
}, code);
await anfitria.waitForSelector('[data-screen="categories"].active', { timeout: 5000 });
const titulos = await anfitria.locator('[data-screen="categories"] .cat-item span').allTextContents();
console.log(`   categorias no ecrã: ${titulos.join(" | ")}`);
if (!titulos.some((t) => t.includes("Marcas de carro"))) {
  falhar("a categoria da casa tinha de aparecer com o nome que lhe deram");
}

console.log("4b) E a ronda diz como se ganham pontos, com a letra desta ronda...");
// A queixa "fiquei à espera sem saber o que fazer" é das que mais se repetem
// nas críticas dos jogos deste género. Este jogo explicava as regras na
// votação — depois de a ronda já estar perdida para quem não sabia.
const regras = (await anfitria.locator("#cat-regras").textContent()).trim();
console.log(`   "${regras}"`);
if (!regras.includes("M")) falhar("a regra tem de nomear a letra desta ronda");
if (!/dobrar|10/.test(regras)) falhar("tem de dizer que uma resposta única vale mais");

console.log("5) Responder e pontuar como qualquer outra categoria...");
await anfitria.evaluate((c) => {
  const sala = window.__testDb.get(`rooms/${c}`);
  window.__testDb.update(`rooms/${c}/answers`, { [sala.hostId]: { c100: "Mazda", c0: "Maria" } });
  window.__testDb.update(`rooms/${c}`, { state: "voting", voting: { endAt: Date.now() + 60000 } });
}, code);
await anfitria.waitForSelector('[data-screen="voting"].active', { timeout: 5000 });
const naVotacao = await anfitria.locator('[data-screen="voting"]').textContent();
console.log(`   a votação fala de "Marcas de carro": ${naVotacao.includes("Marcas de carro")}`);
if (!naVotacao.includes("Marcas de carro")) falhar("na votação a categoria da casa tem de ter nome");

console.log("6) Apagar uma categoria da casa não deixa índices órfãos...");
await anfitria.evaluate((c) => window.__testDb.update(`rooms/${c}`, { state: "lobby" }), code);
await anfitria.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await anfitria.evaluate(() => (() => { let el = document.getElementById("cfg-cat-grid"); while (el) { if (el.tagName === "DETAILS") el.open = true; el = el.parentElement; } })());
await anfitria.click('#cfg-cat-propria-lista li:first-child button');
await anfitria.waitForTimeout(300);
sala = await anfitria.evaluate((c) => window.__testDb.get(`rooms/${c}`), code);
console.log(`   ficam: ${JSON.stringify(sala.config.customCategories)}, ativas: ${JSON.stringify(sala.config.enabledCategories)}`);
if (JSON.stringify(sala.config.customCategories) !== JSON.stringify(["Coisas da avó"])) {
  falhar("devia ter ficado só a segunda");
}
const ativas = sala.config.enabledCategories || [];
if (ativas.includes(101)) falhar("o índice 101 já não existe — ficaria uma categoria sem nome no sorteio");
if (!ativas.includes(100)) falhar("a que sobrou passou a ser a 100 e devia continuar ativa");

console.log("7) Alvos de dedo do que é novo, no telemóvel...");
const pequenos = await anfitria.evaluate(() => {
  const maus = [];
  document.querySelectorAll("#cfg-cat-propria-form input, #cfg-cat-propria-form button, #cfg-cat-propria-lista button")
    .forEach((el) => {
      if (el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) maus.push(`${el.tagName.toLowerCase()} (${Math.round(r.height)}x${Math.round(r.width)})`);
    });
  return maus;
});
console.log(`   abaixo de 44px: ${pequenos.length} ${pequenos.join(", ")}`);
if (pequenos.length > 0) falhar("o que é novo também se toca com o dedo");

await browser.close();
const reais = erros.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(reais.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + reais.join("\n"));
if (reais.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
