// O DESAFIO DO DIA.
//
// Uma ronda por dia, a mesma para toda a gente, sorteada a partir da data. É
// o que faz voltar a um jogo destes quando não há mais ninguém para jogar — e
// só serve para alguma coisa se for MESMO igual para todos e se jogar uma vez
// só: um resultado que se pode repetir até sair bom não se compara com o de
// ninguém.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const erros = [];
const falhar = (m) => { console.log(`   FALHOU: ${m}`); process.exitCode = 1; };
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("pageerror", (e) => erros.push(e.message));
page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => { localStorage.setItem("euSei_lingua", "pt"); localStorage.removeItem("euSei_desafio"); });
await page.reload({ waitUntil: "networkidle" });

console.log("1) O desafio está no menu de jogar sozinho...");
await page.click("#solo-menu-btn");
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 5000 });
const estadoInicial = (await page.locator("#solo-desafio-estado").textContent()).trim();
console.log(`   estado antes de jogar: "${estadoInicial}"`);
if (!(await page.locator("#solo-desafio-btn").isVisible())) falhar("o botão do desafio devia estar à vista");

console.log("2) Começa com a letra e as categorias do dia — as mesmas que o data.js diz...");
await page.click("#solo-desafio-btn");
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 5000 });
const doEcra = await page.evaluate(() => ({
  letra: document.getElementById("solo-cat-letter").textContent.trim(),
  categorias: [...document.querySelectorAll("#solo-cat-list .cat-item span")].map((s) => s.textContent.trim()),
}));
const doModulo = await page.evaluate(async () => {
  const d = await import("./js/data.js");
  const hoje = d.diaDoDesafio();
  const r = d.desafioDoDia(hoje);
  return { dia: hoje, letra: r.letra, categorias: r.categorias.map((i) => d.CATEGORIES[i]) };
});
console.log(`   ecrã: letra ${doEcra.letra}, ${doEcra.categorias.length} categorias`);
console.log(`   data.js (${doModulo.dia}): letra ${doModulo.letra}`);
if (doEcra.letra !== doModulo.letra) falhar("a letra do ecrã tem de ser a do dia");
if (JSON.stringify(doEcra.categorias) !== JSON.stringify(doModulo.categorias)) {
  falhar(`as categorias têm de ser as do dia (ecrã: ${doEcra.categorias.join(", ")})`);
}

console.log("3) Responder três certas e três em branco...");
await page.evaluate((letra) => {
  const inputs = [...document.querySelectorAll("#solo-cat-list input")];
  ["ade", "iva", "ora"].forEach((sufixo, i) => { inputs[i].value = letra + sufixo; inputs[i].dispatchEvent(new Event("input", { bubbles: true })); });
}, doEcra.letra);
await page.click("#solo-finish-btn");
await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 5000 });
const resultado = await page.evaluate(() => ({
  titulo: document.getElementById("solo-result-title").textContent.trim(),
  resumo: document.getElementById("solo-result-summary").textContent.trim(),
  copiarVisivel: !document.getElementById("solo-desafio-copiar-btn").classList.contains("hidden"),
  guardado: JSON.parse(localStorage.getItem("euSei_desafio") || "{}"),
}));
console.log(`   "${resultado.titulo}" / "${resultado.resumo}"`);
console.log(`   guardado: ${JSON.stringify(resultado.guardado)}`);
if (!/3\/6/.test(resultado.titulo)) falhar("o título devia dizer 3 de 6");
if (resultado.guardado.pontos !== 30) falhar(`30 pts (3 x 10), não ${resultado.guardado.pontos}`);
if (resultado.guardado.sequencia !== 1) falhar("primeira vez = 1 dia seguido");
if (resultado.guardado.dia !== doModulo.dia) falhar("devia ficar guardado o dia de hoje");
if (!resultado.copiarVisivel) falhar("devia dar para copiar o resultado");

console.log("4) Jogar outra vez no mesmo dia não muda o que ficou guardado...");
// Há cinco botões "Voltar" na página, um por ecrã: só serve o do ecrã ativo.
await page.click('[data-screen="solo-result"] [data-solo-leave]');
await page.waitForSelector('[data-screen="solo-menu"].active', { timeout: 5000 });
const estadoDepois = (await page.locator("#solo-desafio-estado").textContent()).trim();
console.log(`   estado depois de jogar: "${estadoDepois}"`);
if (!estadoDepois.includes("30")) falhar("o menu devia mostrar o resultado de hoje");
await page.click("#solo-desafio-btn");
await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 5000 });
await page.evaluate((letra) => {
  const inputs = [...document.querySelectorAll("#solo-cat-list input")];
  inputs.forEach((inp, i) => { inp.value = letra + "abc" + i; inp.dispatchEvent(new Event("input", { bubbles: true })); });
}, doEcra.letra);
await page.click("#solo-finish-btn");
await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 5000 });
const segunda = await page.evaluate(() => ({
  titulo: document.getElementById("solo-result-title").textContent.trim(),
  resumo: document.getElementById("solo-result-summary").textContent.trim(),
  guardado: JSON.parse(localStorage.getItem("euSei_desafio") || "{}"),
}));
console.log(`   "${segunda.titulo}" / "${segunda.resumo}"`);
console.log(`   guardado continua: ${JSON.stringify(segunda.guardado)}`);
if (segunda.guardado.pontos !== 30 || segunda.guardado.sequencia !== 1) {
  falhar("uma segunda tentativa no mesmo dia não pode melhorar o resultado guardado");
}
if (!/outra vez/i.test(segunda.titulo) && !/não conta/i.test(segunda.resumo)) {
  falhar("devia dizer que esta não conta");
}

console.log("5) A sequência conta quando o dia anterior foi jogado, e recomeça quando houve um salto...");
for (const [ontemOuNao, esperado] of [["ontem", 2], ["ha-muito", 1]]) {
  await page.evaluate((qual) => {
    const d = new Date();
    if (qual === "ontem") d.setDate(d.getDate() - 1); else d.setDate(d.getDate() - 5);
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    localStorage.setItem("euSei_desafio", JSON.stringify({ dia, pontos: 10, corretas: 1, total: 6, sequencia: 1 }));
  }, ontemOuNao);
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#solo-menu-btn");
  await page.click("#solo-desafio-btn");
  await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 5000 });
  await page.evaluate((letra) => {
    const inp = document.querySelector("#solo-cat-list input");
    inp.value = letra + "ola";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }, doEcra.letra);
  await page.click("#solo-finish-btn");
  await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 5000 });
  const seq = await page.evaluate(() => JSON.parse(localStorage.getItem("euSei_desafio")).sequencia);
  console.log(`   último jogo ${ontemOuNao}: sequência ${seq} (esperado ${esperado})`);
  if (seq !== esperado) falhar(`com o último jogo ${ontemOuNao} a sequência devia ser ${esperado}`);
}

await browser.close();
const reais = erros.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(reais.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + reais.join("\n"));
if (reais.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
