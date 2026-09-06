// O mapa-múndi numa sala, com dois jogadores a sério.
//
// A pergunta que interessa é a que não se pode responder olhando para o
// código: quando a Ana conquista um país, o Beto vê-o pintado NO ECRÃ DELE,
// com a cor da Ana? E quando o Beto falha, a Ana ganha alguma coisa por saber
// o que ele não sabia?
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext();
const errors = [];
const ana = await context.newPage();
const beto = await context.newPage();
for (const [nome, p] of [["Ana", ana], ["Beto", beto]]) {
  p.on("pageerror", (e) => errors.push(`${nome}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(`${nome}: ${m.text()}`); });
}
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const semErros = (onde) => {
  if (errors.length === 0) return;
  fail(`erro de JavaScript ${onde}: ${errors[0]}`);
  errors.length = 0;
};

// O teste escreve em português: as mensagens do mapa mudam com a língua e o
// browser de teste não fala necessariamente português.
const emPortugues = async (p) => {
  await p.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
  await p.reload({ waitUntil: "networkidle" });
};

console.log("1) Ana cria a sala, Beto entra, Ana abre o mapa...");
await ana.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await emPortugues(ana);
await ana.fill("#name-input", "Ana");
await ana.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await ana.click("#create-room-btn");
await ana.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const code = (await ana.locator("#lobby-code").textContent()).trim();
await beto.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await emPortugues(beto);
await beto.fill("#name-input", "Beto");
await beto.fill("#join-code-input", code);
await beto.waitForFunction(() => !document.getElementById("join-room-btn").disabled, { timeout: 5000 });
await beto.click("#join-room-btn");
await beto.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
await ana.click('[data-mp-game="mapa"]');
await ana.waitForSelector('[data-screen="mapa"].active', { timeout: 10000 });
await beto.waitForSelector('[data-screen="mapa"].active', { timeout: 10000 });
console.log(`   sala ${code}, o mapa abriu nos dois`);
semErros("ao abrir o mapa");

// Espera que os países tenham chegado antes de tentar conquistar nada.
const comMapa = async (p) => p.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return m.mapa.paises.length > 0;
}, { timeout: 15000 });
await comMapa(ana);
await comMapa(beto);

const escrever = async (p, texto) => {
  await p.fill("#mapa-input", texto);
  await p.click("#mapa-form button[type=submit]");
};
const donos = (p) => p.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { ...m.mapa.donos };
});

console.log("2) A Ana conquista o Brasil — e o Beto tem de o ver pintado no ecrã dele...");
await escrever(ana, "brasil");
await beto.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos.Brasil;
}, { timeout: 10000 });
const corNoBeto = (await donos(beto)).Brasil;
const corNaAna = (await donos(ana)).Brasil;
console.log(`   Brasil no ecrã da Ana: ${corNaAna} · no ecrã do Beto: ${corNoBeto}`);
if (!corNoBeto) fail("o Beto devia ver o Brasil conquistado");
if (corNoBeto !== corNaAna) fail("os dois ecrãs deviam pintar o Brasil da mesma cor");
semErros("depois de conquistar");

console.log("3) O Beto não pode roubar um país que já tem dono...");
await escrever(beto, "brasil");
await beto.waitForTimeout(600);
const depois = (await donos(beto)).Brasil;
console.log(`   Brasil continua: ${depois}`);
if (depois !== corNaAna) fail("um país conquistado não muda de dono por outro o escrever");

console.log("4) A classificação mostra os dois, com a Ana à frente...");
const tabela = await ana.locator("#mapa-sala-tabela li").allTextContents();
console.log(`   ${tabela.map((l) => l.replace(/\s+/g, " ").trim()).join(" | ")}`);
if (tabela.length < 1) fail("a classificação devia mostrar quem já conquistou alguma coisa");
if (!/Ana/.test(tabela[0])) fail("a Ana devia estar em primeiro");

console.log("5) Errar em cima de um país deixa-o EM CAUSA, e vale a dobrar a quem o souber...");
// O Beto aponta o Chile e escreve outra coisa. A partir daí o Chile fica em
// causa por uns segundos: a Ana, que sabe, leva o dobro. É esta a razão de o
// jogo em sala não ser só o jogo sozinho ao lado de outra pessoa.
// Clica-se por COORDENADAS REAIS, não pelo centro geométrico do país. O
// centro do maior anel do Chile cai dentro da Argentina — o país é uma tira —
// e o teste passou a testar outra coisa sem dar por isso.
const noEcra = async (p, lon, lat) => p.evaluate(async ([lo, la]) => {
  const m = await import("./js/mapa.js");
  const s = m.ecraDoMundo((lo + 180) / 360, (90 - la) / 180);
  // O ecraDoMundo devolve coordenadas DENTRO da tela; o rato do Playwright
  // clica na PÁGINA. A diferença é a altura da barra de ferramentas, e sem a
  // somar o clique caía uns milhares de quilómetros mais a norte — na
  // primeira tentativa foi a Bolívia em vez da Argentina.
  const r = document.getElementById("mapa-canvas").getBoundingClientRect();
  return { x: Math.round(r.left + s.x), y: Math.round(r.top + s.y) };
}, [lon, lat]);
const pontosDe = async (p, quem) => {
  const linhas = await p.locator("#mapa-sala-tabela li").allTextContents();
  const linha = linhas.find((l) => l.includes(quem));
  const n = linha && /(\d+)\s*pts/.exec(linha);
  return n ? Number(n[1]) : 0;
};

// Argentina, e não o Chile: precisa-se de um país largo o suficiente para um
// clique cair lá dentro sem margem para dúvidas.
const argentina = await noEcra(beto, -64, -34);
await beto.mouse.click(argentina.x, argentina.y);
const apontado = await beto.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return m.mapa.selecionado ? m.mapa.selecionado.nome : null;
});
console.log(`   o Beto apontou: ${apontado}`);
if (apontado !== "Argentina") fail(`o clique devia cair na Argentina, caiu em ${apontado}`);
await escrever(beto, "gronelandia");
await beto.waitForTimeout(800);

const antes = await pontosDe(ana, "Ana");
await escrever(ana, "argentina");
await ana.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos.Argentina;
}, { timeout: 10000 });
await ana.waitForTimeout(800);
const depoisDoRoubo = await pontosDe(ana, "Ana");
const ganhou = depoisDoRoubo - antes;
// Sem roubo a Argentina valia 17 (10 de base + 2 de seguidos + 5 do mesmo
// continente do Brasil). A dobrar são 34.
console.log(`   a Ana tinha ${antes} pts e ficou com ${depoisDoRoubo} — ganhou ${ganhou} na Argentina`);
if (ganhou <= 17) fail(`roubar um país em causa devia valer a dobrar (ganhou ${ganhou}, o normal eram 17)`);
const disse = (await ana.locator("#mapa-status").textContent()).trim();
console.log(`   e o mapa disse-lhe: "${disse}"`);
if (!/roub/i.test(disse)) fail("a Ana devia saber que roubou o país a quem falhou");
semErros("depois de roubar");

console.log("6) Nenhum erro de JavaScript em todo o percurso...");
semErros("no fim");
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: ok");
await browser.close();
