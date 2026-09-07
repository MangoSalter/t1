// O CUSTO DE DESENHAR O MAPA.
//
// Existe por memória: o quadro branco cheio chegou a levar 138ms por imagem, e
// ninguém deu por isso a ler o código — só a medir. O mapa tem 177 países,
// 288 anéis e 10 570 pontos, e desenha bandeiras dentro de cada território
// conquistado. É exatamente o tipo de coisa que se degrada devagar até alguém
// reparar que o jogo "está lento", tarde de mais para se saber qual foi a
// mudança que o pôs assim.
//
// Os tetos são generosos de propósito: não são uma meta a perseguir, são o
// ponto a partir do qual o jogo deixa de dar 60 imagens por segundo. Falhar
// aqui quer dizer "alguma coisa mudou de grandeza", não "está 10% mais lento".
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const page = await browser.newPage();

// 16ms é o orçamento de uma imagem a 60/s. O desenho do mapa não pode gastar
// mais de metade dele: o resto da imagem também tem de caber.
const TETO_MS = 8;

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.click("[data-open-mapa]");
await page.waitForSelector('[data-screen="mapa"].active', { timeout: 8000 });
await page.waitForFunction(async () => (await import("./js/mapa.js")).mapa.paises.length > 0, { timeout: 15000 });

console.log("1) O mapa desenha-se dentro do orçamento de uma imagem...");
const medidas = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  const ctx = document.getElementById("mapa-canvas").getContext("2d");
  const medir = () => {
    m.desenhar(ctx); // uma vez fora da conta, para não medir o aquecimento
    const t = performance.now();
    for (let i = 0; i < 12; i += 1) m.desenhar(ctx);
    return (performance.now() - t) / 12;
  };
  const vazio = medir();
  // Metade do mundo conquistado: é o pior caso realista, com bandeira em cada
  // território e a moldura de quem o ganhou.
  m.mapa.paises.slice(0, 90).forEach((p) => { m.mapa.donos[p.nome] = "#b24b38"; });
  const meio = medir();
  // E o mundo todo, que é como o jogo acaba.
  m.mapa.paises.forEach((p) => { m.mapa.donos[p.nome] = "#b24b38"; });
  const cheio = medir();
  const dados = { paises: m.mapa.paises.length, aneis: m.mapa.paises.reduce((n, p) => n + p.aneis.length, 0) };
  m.mapa.donos = {};
  return { vazio, meio, cheio, dados };
});
const r = (n) => Math.round(n * 100) / 100;
console.log(`   ${medidas.dados.paises} países, ${medidas.dados.aneis} anéis`);
console.log(`   vazio: ${r(medidas.vazio)}ms · metade conquistado: ${r(medidas.meio)}ms · tudo: ${r(medidas.cheio)}ms (teto ${TETO_MS}ms)`);
if (medidas.vazio > TETO_MS) fail(`desenhar o mapa vazio leva ${r(medidas.vazio)}ms`);
if (medidas.cheio > TETO_MS) fail(`desenhar o mapa cheio leva ${r(medidas.cheio)}ms`);
// E as bandeiras não podem custar uma ordem de grandeza: se custarem, é sinal
// de que se está a desenhar texto de uma forma que o browser não consegue
// aproveitar de imagem para imagem.
const custoDasBandeiras = medidas.cheio / Math.max(0.01, medidas.vazio);
console.log(`   as bandeiras multiplicam o custo por ${r(custoDasBandeiras)}x`);
if (custoDasBandeiras > 8) fail(`as bandeiras estão a custar ${r(custoDasBandeiras)}x o desenho vazio`);

console.log("2) Os dados do mapa só se vão buscar quando o mapa se abre...");
// 191KB é bastante para quem nunca vai jogar ao mapa. Confirma-se que a
// primeira página não os leva.
const outra = await browser.newPage();
const pedidos = [];
outra.on("request", (req) => pedidos.push(req.url().split("/").pop()));
await outra.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
const pediuOsPaises = pedidos.some((u) => u.startsWith("paises.json"));
console.log(`   a primeira página pediu paises.json: ${pediuOsPaises} (esperado false)`);
if (pediuOsPaises) fail("os 191KB do mapa não podem vir na primeira página de quem nem abriu o mapa");
await outra.click("[data-open-mapa]");
await outra.waitForFunction(async () => (await import("./js/mapa.js")).mapa.paises.length > 0, { timeout: 15000 });
const pediuDepois = pedidos.some((u) => u.startsWith("paises.json"));
console.log(`   e pediu-os ao abrir o mapa: ${pediuDepois}`);
if (!pediuDepois) fail("o mapa tem de ir buscar os dados quando abre");

console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: ok");
await browser.close();
