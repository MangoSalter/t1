// O mapa-múndi a ser jogado num browser.
//
// A lógica tem o seu teste sem browser (test-mapa.mjs); este responde à outra
// metade: clicar mesmo no mapa acerta no país certo, escrever o nome pinta-o e
// tranca-o, e quem se engana percebe porquê.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text()); });
const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

// A língua é escolhida por quem joga, e sem escolha arranca na do browser —
// que aqui é inglês. O teste fixa o português para poder verificar as frases;
// sem isto estaria a testar a deteção automática sem querer.
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await page.reload({ waitUntil: "networkidle" });

console.log("1) O mapa abre a partir do menu de jogar sozinho...");
await page.click("#solo-menu-btn");
await page.click('[data-screen="solo-menu"] [data-open-mapa]');
await page.waitForSelector('[data-screen="mapa"].active', { timeout: 5000 });
// Os países vêm de um ficheiro: espera-se que cheguem.
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return m.mapa.paises.length > 0;
}, { timeout: 10000 });
const quantos = await page.evaluate(async () => (await import("./js/mapa.js")).mapa.paises.length);
console.log(`   ${quantos} países carregados`);
if (quantos !== 177) fail(`esperava 177 países, tenho ${quantos}`);

const progresso = () => page.locator("#mapa-progresso").textContent();
console.log(`   contador: "${(await progresso()).trim()}"`);
if (!/0 de 177/.test(await progresso())) fail("devia começar com nenhum conquistado");

// Onde é que um país está no ecrã, agora, com a câmara como está.
const ecraDe = (lon, lat) => page.evaluate(async ([lo, la]) => {
  const m = await import("./js/mapa.js");
  const caixa = document.getElementById("mapa-canvas").getBoundingClientRect();
  const s = m.ecraDoMundo((lo + 180) / 360, (90 - la) / 180);
  return { x: caixa.left + s.x, y: caixa.top + s.y };
}, [lon, lat]);

console.log("2) Clicar num país escolhe-o (e o mar não escolhe nada)...");
const mar = await ecraDe(-25, -30);
await page.mouse.click(mar.x, mar.y);
console.log(`   no oceano: "${(await page.locator("#mapa-status").textContent()).trim()}"`);
if (!/mar/i.test(await page.locator("#mapa-status").textContent())) fail("clicar no mar devia dizer que é mar");

const brasil = await ecraDe(-47.88, -15.79);
await page.mouse.click(brasil.x, brasil.y);
const escolhido = await page.evaluate(async () => (await import("./js/mapa.js")).mapa.selecionado?.nome);
console.log(`   cliquei em Brasília e escolheu: ${escolhido}`);
if (escolhido !== "Brasil") fail(`clicar em Brasília devia escolher o Brasil, escolheu ${escolhido}`);

console.log("3) Escrever o nome errado não conquista nada...");
await page.fill("#mapa-input", "Argentina");
await page.click("#mapa-form button[type=submit]");
const depoisDoErro = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { donos: Object.keys(m.mapa.donos).length, texto: document.getElementById("mapa-status").textContent };
});
console.log(`   "${depoisDoErro.texto.trim()}" — conquistados: ${depoisDoErro.donos}`);
if (depoisDoErro.donos !== 0) fail("um nome errado não pode conquistar o país");

console.log("4) Escrever o nome certo pinta e tranca...");
await page.fill("#mapa-input", "brasil");
await page.click("#mapa-form button[type=submit]");
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos.Brasil;
}, { timeout: 5000 });
console.log(`   contador: "${(await progresso()).trim()}"`);
if (!/1 de 177/.test(await progresso())) fail("o contador devia subir");
// E clicar outra vez diz que já está — não deixa reescrever nem mudar de cor.
await page.mouse.click(brasil.x, brasil.y);
const jaEsta = await page.locator("#mapa-status").textContent();
console.log(`   ao clicar outra vez: "${jaEsta.trim()}"`);
if (!/já está/i.test(jaEsta)) fail("um país conquistado devia dizer que já está");

console.log("5) O território conquistado vê-se mesmo no ecrã: fundo claro, moldura da cor do jogador, bandeira dentro...");
// O desenho de um país conquistado tem três camadas e o teste lê as três nos
// pixels: o preenchimento CLARO da cor do jogador (não intrusivo), a moldura
// na cor FORTE (o indicador de dono) e a bandeira do país por cima.
const pintura = await page.evaluate(async ([lo, la]) => {
  const m = await import("./js/mapa.js");
  const c = document.getElementById("mapa-canvas");
  const ctx = c.getContext("2d");
  const rgb = (d, i) => `${d[i]},${d[i + 1]},${d[i + 2]}`;
  const s = m.ecraDoMundo((lo + 180) / 360, (90 - la) / 180);
  const dentro = rgb(ctx.getImageData(Math.round(s.x * m.mapa.dpr), Math.round(s.y * m.mapa.dpr), 1, 1).data, 0);
  const claro = m.corClara(m.mapa.donos.Brasil).match(/\d+/g).join(",");
  const forte = m.mapa.donos.Brasil;
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
  const alvoForte = hex(forte);
  // Varre a tela toda: quantos pixels de cada camada.
  const todos = ctx.getImageData(0, 0, c.width, c.height).data;
  let nClaro = 0; let nForte = 0;
  for (let i = 0; i < todos.length; i += 4) {
    const p = rgb(todos, i);
    if (p === claro) nClaro++;
    else if (p === alvoForte) nForte++;
  }
  return { dentro, claro, alvoForte, nClaro, nForte };
}, [-45, -20]);
console.log(`   dentro do Brasil: rgb(${pintura.dentro}) — esperado o claro do jogador (${pintura.claro})`);
if (pintura.dentro !== pintura.claro) fail("o país conquistado devia ficar com o fundo claro da cor do jogador");
console.log(`   pixels: ${pintura.nClaro} do fundo claro, ${pintura.nForte} da moldura forte (${pintura.alvoForte})`);
if (pintura.nForte < 20) fail("a moldura da cor forte do jogador não apareceu — sem ela não se sabe de quem é");
if (pintura.nForte > pintura.nClaro / 3) fail("a moldura ficou intrusiva demais ao pé do fundo claro");

// A bandeira: dentro do país há pixels que não são nem o fundo claro nem a
// moldura. Se a bandeira não desenhasse nada, não havia nenhum.
const temBandeira = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  const c = document.getElementById("mapa-canvas");
  const ctx = c.getContext("2d");
  const centro = m.centroDe(m.mapa.paises.find((p) => p.nome === "Brasil"));
  const s = m.ecraDoMundo(centro.x, centro.y);
  const claro = m.corClara(m.mapa.donos.Brasil).match(/\d+/g).join(",");
  const lado = Math.round(40 * m.mapa.dpr);
  const d = ctx.getImageData(Math.round(s.x * m.mapa.dpr) - lado / 2, Math.round(s.y * m.mapa.dpr) - lado / 2, lado, lado).data;
  let outros = 0;
  for (let i = 0; i < d.length; i += 4) if (`${d[i]},${d[i + 1]},${d[i + 2]}` !== claro) outros++;
  return outros;
});
console.log(`   pixels da bandeira no centro do Brasil: ${temBandeira}`);
if (temBandeira < 50) fail("a bandeira do país conquistado não foi desenhada");

console.log("6) Recomeçar limpa o mapa...");
await page.click("#mapa-recomecar-btn");
if (!/0 de 177/.test(await progresso())) fail("recomeçar devia limpar tudo");

console.log("7) A roda dá zoom e o botão direito arrasta, como no quadro...");
const camara = () => page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { zoom: m.mapa.zoom, panX: Math.round(m.mapa.panX) };
});
const antes = await camara();
await page.mouse.move(600, 400);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(120);
const comZoom = await camara();
console.log(`   zoom ${antes.zoom.toFixed(0)} -> ${comZoom.zoom.toFixed(0)}`);
if (!(comZoom.zoom > antes.zoom)) fail("a roda para cima devia aproximar");
await page.mouse.move(600, 400);
await page.mouse.down({ button: "right" });
await page.mouse.move(700, 430);
await page.mouse.up({ button: "right" });
await page.waitForTimeout(120);
const arrastado = await camara();
console.log(`   pan ${comZoom.panX} -> ${arrastado.panX}`);
if (arrastado.panX === comZoom.panX) fail("o botão direito devia arrastar o mapa");

console.log("8) O Enter entrega a resposta, e o foco não se perde...");
// O ritmo do jogo é escrever, Enter, escrever. Ir buscar a caixa com o rato
// entre respostas era o que o travava.
await page.click("#mapa-recomecar-btn");
const angola = await ecraDe(17.87, -11.2);
await page.mouse.click(angola.x, angola.y);
await page.keyboard.type("angola");
await page.keyboard.press("Enter");
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos.Angola;
}, { timeout: 5000 });
const focoDepois = await page.evaluate(() => document.activeElement?.id);
console.log(`   depois do Enter, o foco está em: ${focoDepois}`);
if (focoDepois !== "mapa-input") fail("o foco devia ficar na caixa para se escrever a seguir");

console.log("9) Escrever como as pessoas falam...");
const eua = await ecraDe(-98.5, 39.8);
await page.mouse.click(eua.x, eua.y);
await page.fill("#mapa-input", "eua");
await page.keyboard.press("Enter");
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos["Estados Unidos"];
}, { timeout: 5000 });
console.log("   'eua' conquistou os Estados Unidos");

console.log("10) Escape larga o país escolhido...");
await page.mouse.click(angola.x, angola.y);
await page.fill("#mapa-input", "seja o que for");
await page.keyboard.press("Escape");
const largou = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { sel: m.mapa.selecionado, caixa: document.getElementById("mapa-input").value };
});
console.log(`   selecionado: ${largou.sel}, caixa: "${largou.caixa}"`);
if (largou.sel) fail("o Escape devia largar o país escolhido");
if (largou.caixa !== "") fail("o Escape devia limpar a caixa");

console.log("11) Os modos mudam o tamanho da partida...");
await page.selectOption("#mapa-modo", "Europa");
await page.waitForFunction(() => /de 4[0-9]\b/.test(document.getElementById("mapa-progresso").textContent), { timeout: 5000 })
  .catch(() => {});
const naEuropa = await page.locator("#mapa-progresso").textContent();
console.log(`   contador na Europa: "${naEuropa.trim()}"`);
if (/de 177/.test(naEuropa)) fail("no modo Europa o contador não pode falar dos 177");
// E clicar num país de fora diz porquê, em vez de não fazer nada. As
// coordenadas têm de ser calculadas OUTRA VEZ: trocar de modo enquadra o
// continente escolhido, e o sítio onde Angola estava no ecrã mudou.
const angolaNaEuropa = await ecraDe(17.87, -11.2);
await page.mouse.click(angolaNaEuropa.x, angolaNaEuropa.y);
const foraDoModo = await page.locator("#mapa-status").textContent();
console.log(`   clicar em Angola na Europa: "${foraDoModo.trim()}"`);
if (!/não entra/i.test(foraDoModo)) fail("clicar num país fora do modo devia explicar porquê");

console.log("12) A ajuda pousa uma bandeira no mapa...");
await page.selectOption("#mapa-modo", "mundo");
await page.click("#mapa-ajuda-btn");
const comPista = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { pistas: m.mapa.pistas.slice(), texto: document.getElementById("mapa-status").textContent };
});
console.log(`   pista: ${comPista.pistas.join(", ")} — "${comPista.texto.trim()}"`);
if (comPista.pistas.length !== 1) fail("pedir ajuda devia revelar uma bandeira");
if (!/bandeira/i.test(comPista.texto)) fail("devia dizer que pousou uma bandeira");
// E pedir outra vez revela outra, sem repetir.
await page.click("#mapa-ajuda-btn");
const duas = await page.evaluate(async () => (await import("./js/mapa.js")).mapa.pistas.slice());
console.log(`   duas pistas: ${duas.join(", ")}`);
if (duas.length !== 2 || duas[0] === duas[1]) fail("a segunda ajuda devia revelar outro país");

console.log("13) O mapa cabe no ecrã — sem rolar a página...");
// Pedido depois de o ver num ecrã grande: rolar para baixo para ver o mapa é o
// contrário de um mapa. Mede-se o que interessa: a página não pode ter
// deslocamento nenhum, e a barra não pode comer o ecrã.
const medidas = await page.evaluate(() => {
  const barra = document.querySelector(".mapa-toolbar").getBoundingClientRect();
  const tela = document.getElementById("mapa-canvas").getBoundingClientRect();
  return {
    rolaVertical: document.documentElement.scrollHeight > window.innerHeight + 1,
    rolaHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    barra: Math.round(barra.height),
    tela: Math.round(tela.height),
    janela: window.innerHeight,
  };
});
console.log(`   janela ${medidas.janela}px — barra ${medidas.barra}px, mapa ${medidas.tela}px`);
console.log(`   a página rola? vertical: ${medidas.rolaVertical}, horizontal: ${medidas.rolaHorizontal}`);
if (medidas.rolaVertical) fail("a página não devia ter deslocamento vertical");
if (medidas.rolaHorizontal) fail("a página não devia ter deslocamento horizontal");
if (medidas.tela < medidas.janela * 0.7) fail(`o mapa devia ficar com a maior parte do ecrã (tem ${medidas.tela} de ${medidas.janela})`);

console.log("14) E no telemóvel também, com os alvos a darem-se com o dedo...");
const telemovel = await browser.newContext({ ...devices["iPhone 13"] });
const tlm = await telemovel.newPage();
await tlm.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await tlm.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await tlm.reload({ waitUntil: "networkidle" });
await tlm.click("#solo-menu-btn");
await tlm.click('[data-screen="solo-menu"] [data-open-mapa]');
await tlm.waitForSelector('[data-screen="mapa"].active', { timeout: 5000 });
await tlm.waitForFunction(async () => (await import("./js/mapa.js")).mapa.paises.length > 0, { timeout: 10000 });
const noTelemovel = await tlm.evaluate(() => {
  const barra = document.querySelector(".mapa-toolbar").getBoundingClientRect();
  const tela = document.getElementById("mapa-canvas").getBoundingClientRect();
  const pequenos = [...document.querySelectorAll(".mapa-toolbar button, .mapa-toolbar input, .mapa-toolbar select")]
    .map((el) => ({ id: el.id || el.textContent.trim().slice(0, 14), h: Math.round(el.getBoundingClientRect().height) }))
    .filter((x) => x.h > 0 && x.h < 40);
  return {
    barra: Math.round(barra.height), tela: Math.round(tela.height), janela: window.innerHeight,
    rolaHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    pequenos,
  };
});
console.log(`   janela ${noTelemovel.janela}px — barra ${noTelemovel.barra}px (${Math.round(noTelemovel.barra / noTelemovel.janela * 100)}%), mapa ${noTelemovel.tela}px`);
console.log(`   alvos abaixo de 40px: ${noTelemovel.pequenos.length ? noTelemovel.pequenos.map((x) => `${x.id}=${x.h}`).join(", ") : "nenhum"}`);
if (noTelemovel.rolaHorizontal) fail("no telemóvel a página não devia rolar para o lado");
if (noTelemovel.barra > noTelemovel.janela / 3) fail("a barra está a comer mais de um terço do ecrã do telemóvel");
if (noTelemovel.pequenos.length > 0) fail("há alvos pequenos de mais para o dedo");
await telemovel.close();

console.log("15) A caixa do que se diz fica DENTRO do mapa, por cima do oceano...");
// Com o mapa a não encher a tela toda (é duas vezes mais largo do que alto, a
// tela quase nunca é), o canto da tela cai fora do mapa e a caixa ficava a
// boiar no papel, ao lado do mundo.
const caixaDentro = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  const c = document.getElementById("mapa-canvas").getBoundingClientRect();
  const caixa = document.getElementById("mapa-status").getBoundingClientRect();
  const cima = m.ecraDoMundo(0, 0);
  const baixo = m.ecraDoMundo(1, 1);
  return {
    dentroX: caixa.left - c.left >= cima.x - 1 && caixa.right - c.left <= baixo.x + 1,
    dentroY: caixa.top - c.top >= cima.y - 1 && caixa.bottom - c.top <= baixo.y + 1,
  };
});
console.log(`   caixa dentro do mapa — horizontal: ${caixaDentro.dentroX}, vertical: ${caixaDentro.dentroY}`);
if (!caixaDentro.dentroX || !caixaDentro.dentroY) fail("a caixa devia ficar por cima do mapa, não ao lado dele");

console.log("16) Três hipóteses: só depois de o jogo parar, e com espera entre usos...");
const botaoEscondido = await page.evaluate(() =>
  document.getElementById("mapa-hipoteses-btn").classList.contains("hidden"));
console.log(`   botão escondido no início: ${botaoEscondido}`);
if (!botaoEscondido) fail("as três hipóteses não são para se jogar sempre assim");
// Força a situação de jogo parado, que é o que faz o botão aparecer.
await page.evaluate(() => document.getElementById("mapa-hipoteses-btn").classList.remove("hidden"));
const chile = await ecraDe(-71.5, -35.7);
await page.mouse.click(chile.x, chile.y);
await page.click("#mapa-hipoteses-btn");
const opcoes = await page.evaluate(() =>
  [...document.querySelectorAll("[data-hipotese]")].map((b) => b.dataset.hipotese));
console.log(`   hipóteses no ecrã: ${opcoes.join(", ")}`);
if (opcoes.length !== 3) fail("deviam aparecer três hipóteses");
if (!opcoes.includes("Chile")) fail("a hipótese certa tem de estar entre elas");
// Escolher a certa conquista.
await page.click('[data-hipotese="Chile"]');
await page.waitForFunction(async () => !!(await import("./js/mapa.js")).mapa.donos.Chile, { timeout: 5000 });
console.log("   escolher a certa conquistou o Chile");
// E a seguir há espera: pedir outra vez agora não dá.
const peru = await ecraDe(-75, -9.2);
await page.mouse.click(peru.x, peru.y);
await page.click("#mapa-hipoteses-btn");
const naEspera = await page.locator("#mapa-status").textContent();
console.log(`   pedir logo a seguir: "${naEspera.trim()}"`);
if (!/espera/i.test(naEspera)) fail("devia haver espera entre dois pedidos de três hipóteses");

console.log("17) Cada um joga na sua língua, e o jogo é o mesmo...");
// Numa sala podem estar três pessoas em três línguas: o que viaja entre elas
// são coisas (um país conquistado, uma cor), não frases. As frases nascem
// sempre no ecrã de quem as lê.
// O seletor vive na página de entrada, que agora está escondida por trás do
// mapa. Muda-se pela mesma função que ele chama — o que interessa verificar é
// que o ECRÃ acompanha, não que o <select> funciona.
await page.evaluate(async () => (await import("./js/i18n.js")).definirLingua("en"));
await page.waitForTimeout(150);
const emIngles = await page.evaluate(() => ({
  botao: document.getElementById("mapa-recomecar-btn").textContent.trim(),
  caixa: document.getElementById("mapa-input").placeholder,
}));
console.log(`   em inglês: botão "${emIngles.botao}", caixa "${emIngles.caixa}"`);
if (!/restart/i.test(emIngles.botao)) fail("o botão devia passar a inglês");
await page.evaluate(async () => (await import("./js/i18n.js")).definirLingua("es"));
await page.waitForTimeout(150);
const emEspanhol = await page.evaluate(() => document.getElementById("mapa-recomecar-btn").textContent.trim());
console.log(`   em espanhol: "${emEspanhol}"`);
if (!/reiniciar/i.test(emEspanhol)) fail("o botão devia passar a espanhol");
// E o jogo continua: a partida não se perde por se mudar de língua.
const paisesAindaLa = await page.evaluate(async () => (await import("./js/mapa.js")).mapa.paises.length);
if (paisesAindaLa !== 177) fail("mudar de língua não pode perder o mapa");
await page.evaluate(async () => (await import("./js/i18n.js")).definirLingua("pt"));

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mapa-ecra FALHOU" : "=> mapa-ecra ok");
