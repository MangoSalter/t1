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
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
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
  // O MELHOR DE CINCO, e não uma medição só.
  //
  // A pergunta é "o algoritmo de desenho é barato?", e a contenção da
  // máquina só pode tornar uma medição mais LENTA, nunca mais rápida — por
  // isso o mínimo é a estatística honesta, e a média é a errada. Isto foi
  // preciso: o caso passa sozinho com 1,4ms contra um teto de 8, e mesmo
  // assim foi a vermelho numa corrida completa, com quatro casos em
  // paralelo a disputar o processador. Um teste que falha umas vezes em cem
  // ensina as pessoas a ignorar o vermelho, que é a pior coisa que um teste
  // pode fazer.
  const medir = () => {
    m.desenhar(ctx); // uma vez fora da conta, para não medir o aquecimento
    let melhor = Infinity;
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      const t = performance.now();
      for (let i = 0; i < 12; i += 1) m.desenhar(ctx);
      melhor = Math.min(melhor, (performance.now() - t) / 12);
    }
    return melhor;
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
// E NÃO PODEM CRESCER SEM QUE ALGUÉM REPARE.
//
// O ficheiro é gerado (world-atlas -> tools), e regenerá-lo com mais casas
// decimais ou com fronteiras mais finas é uma linha de diferença no gerador.
// Passou de 168 KB para 191 KB entre o plano e hoje sem ninguém dar por isso;
// só dei quando fui verificar os números escritos na documentação. A 191 KB
// não custa nada — vem só quando o mapa abre, e o passo 2 guarda isso — mas a
// dois megabytes o mapa demorava a abrir num telemóvel em dados móveis.
console.log("3) E os dados do mapa não cresceram sem ninguém reparar...");
const TETO_KB = 260;
const tamanhoKB = await page.evaluate(async () => {
  const r = await fetch("./data/paises.json");
  const t = await r.text();
  const d = JSON.parse(t);
  const lista = Array.isArray(d) ? d : Object.values(d).find(Array.isArray);
  let aneis = 0;
  for (const c of lista) aneis += (c.aneis || c.rings || []).length;
  return { kb: t.length / 1024, paises: lista.length, aneis };
});
console.log(`   ${tamanhoKB.paises} países, ${tamanhoKB.aneis} anéis, ${tamanhoKB.kb.toFixed(0)} KB (teto ${TETO_KB} KB)`);
if (tamanhoKB.kb > TETO_KB) {
  fail(`os dados do mapa estão em ${tamanhoKB.kb.toFixed(0)} KB — acima do teto de ${TETO_KB} KB`);
}
if (tamanhoKB.paises !== 177) fail(`esperava 177 países, tenho ${tamanhoKB.paises}`);

await browser.close();
