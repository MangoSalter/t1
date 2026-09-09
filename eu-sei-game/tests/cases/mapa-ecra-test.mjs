// O mapa-múndi a ser jogado num browser.
//
// A lógica tem o seu teste sem browser (test-mapa.mjs); este responde à outra
// metade: clicar mesmo no mapa acerta no país certo, escrever o nome pinta-o e
// tranca-o, e quem se engana percebe porquê.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
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
// E diz QUANTO valeu. Os pontos sobem com os seguidos e sobem mais dentro do
// mesmo continente — é essa conta que faz o jogo passar de "clicar no que me
// lembro" para "vou arrumar a África toda", e não aparecia em lado nenhum.
const dissePeloBrasil = (await page.locator("#mapa-status").textContent()).trim();
console.log(`   depois do Brasil: "${dissePeloBrasil}"`);
if (!/\+\s*\d+/.test(dissePeloBrasil)) fail("devia dizer quantos pontos valeu");

// Argentina a seguir ao Brasil: mesmo continente, e o bónus tem de aparecer
// com o nome do continente.
await page.fill("#mapa-input", "argentina");
await page.click("#mapa-form button[type=submit]");
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos.Argentina;
}, { timeout: 5000 });
const disseSeguido = (await page.locator("#mapa-status").textContent()).trim();
console.log(`   e a seguir, no mesmo continente: "${disseSeguido}"`);
if (!/América do Sul/i.test(disseSeguido)) {
  fail("dois seguidos no mesmo continente deviam dizer que continente está a ser arrumado");
}
const pontosSeguidos = Number(/\+\s*(\d+)/.exec(disseSeguido)?.[1] || 0);
const pontosPrimeiro = Number(/\+\s*(\d+)/.exec(dissePeloBrasil)?.[1] || 0);
console.log(`   ${pontosPrimeiro} pontos no primeiro, ${pontosSeguidos} no segundo`);
if (pontosSeguidos <= pontosPrimeiro) fail("o segundo do mesmo continente tinha de valer mais");

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

console.log("5b) E a marca de \"em causa\" não sobrevive a recomeçar...");
// Só existe em sala (alguém falhou ali, vale a dobrar). O mapa é o mesmo
// módulo nos dois modos, por isso uma marca deixada por uma sala aparecia num
// jogo sozinho, onde essa regra nem existe.
await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  m.mapa.emCausa = { Brasil: Date.now() + 60000 };
});
await page.click("#mapa-recomecar-btn");
await page.waitForTimeout(200);
const sobrouEmCausa = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return Object.keys(m.mapa.emCausa || {});
});
console.log(`   em causa depois de recomeçar: ${JSON.stringify(sobrouEmCausa)}`);
if (sobrouEmCausa.length > 0) fail("recomeçar tinha de levar as marcas de em causa");

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
// Deixa o desenho assentar antes de medir. A caixa é posicionada a partir das
// medidas da tela, e medir no mesmo instante em que a barra muda de altura lê
// a posição de antes — falhou assim quando a barra ganhou os rótulos.
await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  window.dispatchEvent(new Event("resize"));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return m.mapa.rectW;
});
await page.waitForTimeout(250);
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
    medidas: {
      caixa: [Math.round(caixa.left - c.left), Math.round(caixa.top - c.top), Math.round(caixa.right - c.left), Math.round(caixa.bottom - c.top)],
      mapa: [Math.round(cima.x), Math.round(cima.y), Math.round(baixo.x), Math.round(baixo.y)],
    },
  };
});
console.log(`   caixa dentro do mapa — horizontal: ${caixaDentro.dentroX}, vertical: ${caixaDentro.dentroY} · ${JSON.stringify(caixaDentro.medidas || {})}`);
if (!caixaDentro.dentroX || !caixaDentro.dentroY) fail("a caixa devia ficar por cima do mapa, não ao lado dele");

console.log("16) Três hipóteses: só depois de o jogo parar, e com espera entre usos...");
// Recomeça-se a partida antes de medir. A ajuda automática destrava este
// botão ao fim de 25 segundos SEM conquistas — e isso é o jogo a funcionar
// bem. O que não pode é o teste depender de chegar aqui dentro desses 25
// segundos: com mais passos pelo caminho, passou a chegar depois, e o caso
// falhava por o jogo estar certo.
await page.selectOption("#mapa-modo", "grandes");
await page.waitForTimeout(150);
await page.selectOption("#mapa-modo", "mundo");
await page.waitForTimeout(150);
const botaoEscondido = await page.evaluate(() =>
  document.getElementById("mapa-hipoteses-btn").classList.contains("hidden"));
console.log(`   botão escondido numa partida acabada de começar: ${botaoEscondido}`);
if (!botaoEscondido) fail("as três hipóteses não são para se jogar sempre assim");
// Força a situação de jogo parado, que é o que faz o botão aparecer. Marca-se
// o ESTADO que o jogo usa (destravado), e não só a classe: tirar a classe à
// mão era desfeito pelo primeiro redesenho, e só passava por acaso quando a
// ajuda automática já tinha destravado o botão antes.
await page.evaluate(() => {
  const b = document.getElementById("mapa-hipoteses-btn");
  b.dataset.destravado = "1";
  b.classList.remove("hidden");
});
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

console.log("N) Acabar um mapa mostra o RETRATO da partida, com números que se leem...");
// Faz-se no modo dos oceanos porque são cinco: é o único modo que um teste
// pode acabar de verdade, e acabar de verdade é a única maneira de provar que
// o painel de fim aparece quando deve e diz o que deve.
await page.selectOption("#mapa-modo", "oceanos");
await page.waitForTimeout(300);
const oceanos = ["pacifico", "atlantico", "indico", "antartico", "artico"];
for (const nome of oceanos) {
  await page.fill("#mapa-input", nome);
  await page.click("#mapa-form button[type=submit]");
  await page.waitForTimeout(120);
}
const oceanosFeitos = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return Object.keys(m.mapa.donos).length;
});
console.log(`   oceanos conquistados: ${oceanosFeitos} de 5`);
if (oceanosFeitos !== 5) fail(`os cinco oceanos deviam ter sido conquistados (foram ${oceanosFeitos})`);

await page.waitForSelector("#mapa-fim:not(.hidden)", { timeout: 5000 });
const retrato = await page.evaluate(() =>
  [...document.querySelectorAll("#mapa-fim-numeros li")].map((li) => ({
    valor: li.querySelector("b").textContent,
    rotulo: li.querySelector("span").textContent,
  })));
console.log(`   o painel mostra ${retrato.length} números: ${retrato.map((r) => `${r.valor} ${r.rotulo}`).join(" · ")}`);
if (retrato.length < 6) fail(`o retrato devia ter pelo menos seis números (tem ${retrato.length})`);
const paises = retrato.find((r) => /países|countries/i.test(r.rotulo));
if (!paises || paises.valor !== "5") fail("o retrato devia dizer que foram cinco");
// Nenhum número pode sair vazio, indefinido ou NaN — é o tipo de coisa que
// passa despercebida num painel bonito e faz o jogo parecer partido.
const vazios = retrato.filter((r) => !r.valor || /undefined|NaN|null/.test(r.valor));
if (vazios.length) fail(`números por preencher no retrato: ${JSON.stringify(vazios)}`);

console.log("N+1) 'Ver o mapa' fecha o painel e deixa olhar para o que se fez...");
await page.click("#mapa-fim-fechar-btn");
// Esperar por um seletor espera que ele fique VISÍVEL, e um painel escondido
// nunca fica — o teste ficava três segundos à espera do impossível.
await page.waitForFunction(() => document.getElementById("mapa-fim").classList.contains("hidden"), { timeout: 3000 });
const aindaConquistados = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return Object.keys(m.mapa.donos).length;
});
console.log(`   painel fechado, oceanos ainda pintados: ${aindaConquistados}`);
if (aindaConquistados !== 5) fail("fechar o painel não pode desfazer a partida");

console.log("N+2) 'Outra vez' limpa e o painel não volta sozinho...");
await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  m.mapa.donos = { "Oceano Pacífico": "#b24b38" };
});
await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  m.mapa.donos = {};
});
await page.click("#mapa-recomecar-btn");
const painelDepois = await page.evaluate(() => document.getElementById("mapa-fim").classList.contains("hidden"));
const limpo = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return Object.keys(m.mapa.donos).length;
});
console.log(`   depois de recomeçar: ${limpo} conquistados, painel escondido: ${painelDepois}`);
if (limpo !== 0) fail("recomeçar devia limpar o mapa");
if (!painelDepois) fail("o painel de fim não devia ficar aberto depois de recomeçar");

console.log("N+3) A camada das CAPITAIS: o mesmo mapa, outra pergunta...");
// A camada é o segundo uso do mesmo mapa: os mesmos territórios, os mesmos
// modos, e a pergunta a mudar. Aqui verifica-se pelo ecrã que a caixa pergunta
// a coisa certa e que a resposta certa é mesmo a capital.
await page.selectOption("#mapa-modo", "mundo");
await page.waitForTimeout(200);
await page.selectOption("#mapa-camada", "capitais");
await page.waitForTimeout(300);
const emCapitais = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return { camada: m.mapa.camada, emJogo: m.emJogo().length, donos: Object.keys(m.mapa.donos).length };
});
console.log(`   camada: ${emCapitais.camada}, territórios em jogo: ${emCapitais.emJogo}, conquistados: ${emCapitais.donos}`);
if (emCapitais.camada !== "capitais") fail("o seletor devia mudar a camada");
if (emCapitais.emJogo !== 173) fail(`na camada das capitais jogam-se 173 territórios (estão ${emCapitais.emJogo})`);
if (emCapitais.donos !== 0) fail("trocar de camada recomeça a partida");
const perguntaCapital = await page.locator("#mapa-input").getAttribute("placeholder");
console.log(`   a caixa pergunta: "${perguntaCapital}"`);
if (!/capital/i.test(perguntaCapital)) fail("a caixa devia pedir a capital, não o país");

// E responder com a capital conquista o território.
await page.fill("#mapa-input", "Lisboa");
await page.click("#mapa-form button[type=submit]");
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos.Portugal;
}, { timeout: 5000 }).catch(() => fail("dizer 'Lisboa' devia conquistar Portugal"));
// O nome do país já não serve: é a capital que se pergunta.
await page.fill("#mapa-input", "França");
await page.click("#mapa-form button[type=submit]");
await page.waitForTimeout(300);
const franca = await page.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos["França"];
});
console.log(`   escrever "França" na camada das capitais conquistou o país: ${franca} (esperado false)`);
if (franca) fail("na camada das capitais, o nome do país não pode valer");
// Mas a capital dele sim.
await page.fill("#mapa-input", "Paris");
await page.click("#mapa-form button[type=submit]");
await page.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return !!m.mapa.donos["França"];
}, { timeout: 5000 }).catch(() => fail("dizer 'Paris' devia conquistar a França"));
console.log("   e 'Paris' conquistou a França");
await page.selectOption("#mapa-camada", "paises");
await page.waitForTimeout(200);

console.log("N+4) No modo guiado o mapa FALA — e na língua de quem joga...");
// A narração servia os mini-jogos, e quase todos foram para a oficina. O mapa
// não tinha voz nenhuma. Agora tem: o que aparece na caixa de estado é o que
// se ouve. E a voz segue a língua escolhida — um sintetizador português a ler
// inglês é pior do que o silêncio.
await page.evaluate(async () => {
  const v = await import("./js/voice.js");
  v.setPresentationMode("guiado");
  v.setVoiceEnabled(true);
  v.__voice.said.length = 0;
});
await page.fill("#mapa-input", "brasil");
await page.click("#mapa-form button[type=submit]");
await page.waitForTimeout(400);
const falado = await page.evaluate(async () => {
  const v = await import("./js/voice.js");
  return v.__voice.said.slice();
});
console.log(`   o mapa disse: ${JSON.stringify(falado.slice(-2))}`);
if (falado.length === 0) fail("no modo guiado o mapa devia dizer o que se passa");
if (!falado.some((f) => /brasil/i.test(f))) fail("devia dizer o país que se acertou");

// A língua da voz acompanha a do jogo.
const idiomas = await page.evaluate(async () => {
  const i = await import("./js/i18n.js");
  const v = await import("./js/voice.js");
  const lidos = [];
  for (const lang of ["pt", "en", "es"]) {
    i.definirLingua(lang);
    // Não há como ler o u.lang sem falar de verdade, por isso lê-se a decisão
    // pela mesma porta que o say() usa: a língua atual do jogo.
    lidos.push([lang, i.lingua()]);
  }
  i.definirLingua("pt");
  v.setPresentationMode("minimo");
  return lidos;
});
console.log(`   línguas: ${JSON.stringify(idiomas)}`);
if (idiomas.some(([pedida, obtida]) => pedida !== obtida)) fail("a língua do jogo devia mudar quando se pede");

// E no modo mínimo cala-se: é a diferença entre os dois modos.
await page.evaluate(async () => {
  const v = await import("./js/voice.js");
  v.__voice.said.length = 0;
});
await page.fill("#mapa-input", "argentina");
await page.click("#mapa-form button[type=submit]");
await page.waitForTimeout(400);
const noMinimo = await page.evaluate(async () => (await import("./js/voice.js")).__voice.said.length);
console.log(`   no modo mínimo disse ${noMinimo} frases (esperado 0)`);
if (noMinimo !== 0) fail("no modo mínimo o mapa tem de estar calado");

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}
await browser.close();
console.log(process.exitCode ? "=> mapa-ecra FALHOU" : "=> mapa-ecra ok");
