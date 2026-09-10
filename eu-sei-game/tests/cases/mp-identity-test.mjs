// QUEM SOU EU, num browser a sério.
//
// Duas regras que se puxam em sentidos contrários, e o jogo precisa das duas:
//  - dois separadores abertos ao mesmo tempo são DUAS pessoas (senão não se
//    pode jogar com toda a gente no mesmo computador, que é como isto vai ser
//    testado);
//  - fechar a janela e voltar a abri-la é a MESMA pessoa (senão, a meio de um
//    jogo, quem fecha sem querer volta como estranho e deixa um fantasma
//    desligado na sala).
//
// A decisão está no identity.js e tem testes puros; isto verifica o que só um
// browser mostra: o sessionStorage a sobreviver ao F5, e os separadores a
// falarem uns com os outros pelo BroadcastChannel.
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const context = await browser.newContext();
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };
const URL = "http://localhost:8936/index.html";

const abrir = async () => {
  const p = await context.newPage();
  await p.goto(URL, { waitUntil: "networkidle" });
  // O uid só existe depois de a app arrancar; lê-se do sítio onde ela o guarda.
  await p.waitForFunction(() => !!sessionStorage.getItem("euSei_jogadorNestaAba"), { timeout: 8000 });
  return p;
};
const uidDe = (p) => p.evaluate(() => sessionStorage.getItem("euSei_jogadorNestaAba"));

console.log("1) Dois separadores abertos ao mesmo tempo são duas pessoas...");
const um = await abrir();
const idUm = await uidDe(um);
const dois = await abrir();
const idDois = await uidDe(dois);
console.log(`   separador 1: ...${String(idUm).slice(-6)}, separador 2: ...${String(idDois).slice(-6)}`);
if (!idUm || !idDois) fail("os dois separadores deviam ter identidade");
if (idUm === idDois) fail("dois separadores abertos ao mesmo tempo não podem ser o mesmo jogador");

console.log("2) Um F5 não muda quem eu sou...");
await dois.reload({ waitUntil: "networkidle" });
await dois.waitForFunction(() => !!sessionStorage.getItem("euSei_jogadorNestaAba"), { timeout: 8000 });
const idDoisDepois = await uidDe(dois);
console.log(`   antes ...${String(idDois).slice(-6)}, depois do F5 ...${String(idDoisDepois).slice(-6)}`);
if (idDoisDepois !== idDois) fail("recarregar a página não pode dar uma identidade nova");

console.log("3) Fechar o separador e voltar a abrir devolve a MESMA identidade...");
// É este o caso que se perdia: sem isto, quem fecha a janela a meio de um jogo
// volta como estranho e o antigo fica na sala como desligado para sempre.
await dois.close();
const tres = await abrir();
const idTres = await uidDe(tres);
console.log(`   fechou ...${String(idDois).slice(-6)}, voltou ...${String(idTres).slice(-6)}`);
if (idTres !== idDois) fail("voltar depois de fechar devia devolver a mesma identidade");
// E o separador que ficou aberto continua a ser ele próprio.
const idUmAinda = await uidDe(um);
if (idUmAinda !== idUm) fail("o separador que nunca fechou não podia mudar de identidade");

console.log("4) E com esse aberto, um separador NOVO é outra pessoa...");
// A identidade herdada está agora em uso outra vez: quem chegar a seguir tem
// de perceber isso e criar a sua.
const quatro = await abrir();
const idQuatro = await uidDe(quatro);
console.log(`   novo separador: ...${String(idQuatro).slice(-6)}`);
if (idQuatro === idTres || idQuatro === idUm) fail("um separador novo não pode roubar uma identidade em uso");

await browser.close();
console.log(process.exitCode ? "=> mp-identity FALHOU" : "=> mp-identity ok");
