// O CONVITE POR LIGAÇÃO.
//
// O código da sala tem quatro letras e, num jogo de festa, metade da sala
// está muitas vezes noutra casa a ouvir por chamada. Ditar quatro letras ao
// telefone é onde se perde gente: quem ouve mal tenta duas vezes e desiste.
// A ligação leva o código no endereço, e a app escreve-o sozinha.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const errors = [];
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const ana = await context.newPage();
const beto = await context.newPage();
for (const [nome, p] of [["Ana", ana], ["Beto", beto]]) {
  p.on("pageerror", (e) => errors.push(`${nome}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${nome}: ${m.text()}`); });
}

console.log("1) A Ana cria a sala e copia o convite...");
await ana.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await ana.fill("#name-input", "Ana");
await ana.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await ana.click("#create-room-btn");
await ana.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await ana.locator("#lobby-code").textContent()).trim();
await ana.click("#lobby-convite-btn");
await ana.waitForFunction(() => document.getElementById("lobby-convite-btn").textContent.includes("Copiado")
  || document.getElementById("lobby-convite-btn").textContent.includes("copiado")
  || document.getElementById("lobby-convite-btn").textContent.includes("http"), { timeout: 5000 });
const ligacao = await ana.evaluate(() => navigator.clipboard.readText().catch(() => document.getElementById("lobby-convite-btn").textContent));
console.log(`   sala ${code}, convite: ${ligacao}`);
if (!ligacao.includes(`sala=${code}`)) fail("o convite não leva o código da sala");
if (!/^https?:\/\//.test(ligacao)) fail("o convite tem de ser uma ligação que se abre, não só o código");

console.log("2) O Beto abre a ligação e o código já lá está...");
await beto.goto(ligacao, { waitUntil: "networkidle" });
const naEntrada = await beto.evaluate(() => ({
  codigo: document.getElementById("join-code-input").value,
  dica: document.getElementById("join-convite-hint").textContent.trim(),
  dicaVisivel: !document.getElementById("join-convite-hint").classList.contains("hidden"),
  focado: document.activeElement?.id,
  ecra: document.querySelector(".screen.active")?.dataset.screen,
}));
console.log(`   caixa do código: "${naEntrada.codigo}" · dica: "${naEntrada.dica}" · foco: ${naEntrada.focado}`);
if (naEntrada.codigo !== code) fail(`a caixa do código devia trazer ${code} e trouxe "${naEntrada.codigo}"`);
if (!naEntrada.dicaVisivel) fail("quem recebe um convite tem de saber que está a entrar numa sala");
if (naEntrada.focado !== "name-input") fail("o que falta é o nome: é aí que o foco tem de estar");
// E NÃO entra sozinho: entrar com o nome vazio (ou com o nome de outra pessoa
// que tenha usado este telemóvel) é pior do que pedir.
if (naEntrada.ecra !== "home") fail("um convite não pode entrar na sala sem o nome de quem entra");

console.log("3) E escrever o nome basta para entrar na sala da Ana...");
await beto.fill("#name-input", "Beto");
await beto.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await beto.click("#join-room-btn");
await beto.waitForSelector('[data-screen="lobby"].active', { timeout: 8000 });
const codigoDoBeto = (await beto.locator("#lobby-code").textContent()).trim();
const naSala = await ana.evaluate((c) => Object.values(window.__testDb.get(`rooms/${c}`).players).map((p) => p.name).sort(), code);
console.log(`   o Beto está na sala ${codigoDoBeto}, que tem: ${naSala.join(", ")}`);
if (codigoDoBeto !== code) fail("o convite levou o Beto para outra sala");
if (!naSala.includes("Beto")) fail("o Beto não entrou mesmo na sala");

console.log("4) E um convite feito com a oficina aberta não a leva a reboque...");
// ?oficina=1 mostra jogos que o dono tirou do site. Quem recebe um convite
// entra no site público, seja qual for o endereço de quem o mandou.
const conviteDaOficina = await ana.evaluate(async (c) => {
  const m = await import("./js/app.js");
  return m.ligacaoDeConvite(c, "http://localhost:8936/index.html?oficina=1#alguma-coisa");
}, code);
console.log(`   convite feito a partir da oficina: ${conviteDaOficina}`);
if (conviteDaOficina.includes("oficina")) fail("o convite leva a oficina a quem não devia vê-la");
if (conviteDaOficina.includes("#")) fail("o convite leva lixo do endereço de quem o mandou");
if (!conviteDaOficina.includes(`sala=${code}`)) fail("o convite perdeu o código da sala");

await browser.close();
if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
console.log(process.exitCode ? "=> mp-convite FALHOU" : "=> mp-convite ok");
