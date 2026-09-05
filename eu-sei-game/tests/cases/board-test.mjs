// Quadro branco solo. Testa as REGRAS, não só os cliques:
//  - a borracha apaga onde passa e a "limpar tudo" apaga tudo: são coisas
//    diferentes, e trocá-las seria a pior avaria possível deste ecrã;
//  - afastar (zoom out) tem de tornar o traço mais fino EM RELAÇÃO À FOLHA,
//    que foi exatamente o que foi pedido — um zoom que só muda o número no
//    ecrã passaria num teste ingénuo;
//  - nenhuma ferramenta futura pode ser adicionada sem cor, espessura e
//    modo de composição, senão rebenta no redesenho.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  // net::ERR_* são falhas de rede do ambiente (aqui, o tipo de letra do
  // Google Fonts, que o sandbox não deixa sair). Um ficheiro local em falta
  // dá 404, não net::ERR_, por isso filtrar isto não esconde avarias nossas.
  if (m.type() === "error" && !m.text().includes("net::ERR_")) errors.push(m.text());
});
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

const fail = (msg) => { console.log(`   FALHOU: ${msg}`); process.exitCode = 1; };

// Desenhar um traço arrastando o rato sobre a tela.
async function drag(from, to, steps = 12) {
  const box = await page.locator("#board-canvas").boundingBox();
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      box.x + from[0] + ((to[0] - from[0]) * i) / steps,
      box.y + from[1] + ((to[1] - from[1]) * i) / steps
    );
  }
  await page.mouse.up();
}

const strokeCount = () => page.evaluate(() => window.__boardTest.strokes.length);

console.log("1) O quadro abre a partir do ecrã inicial...");
await page.click('[data-open-board]');
await page.waitForSelector('[data-screen="board"].active', { timeout: 5000 });
// O módulo expõe o estado para os testes; sem isto só se podia olhar para
// pixéis, e um pixel castanho não diz se foi a caneta ou a borracha.
await page.evaluate(async () => {
  const mod = await import("./js/board.js");
  window.__boardTest = mod.__board;
  window.__boardMod = mod;
});
if (await page.locator("#board-canvas").isVisible() === false) fail("a folha não apareceu");

console.log("2) Desenhar deixa traço, e o traço fica guardado...");
await drag([200, 200], [500, 320]);
let n = await strokeCount();
console.log(`   traços depois de desenhar: ${n}`);
if (n !== 1) fail(`esperava 1 traço, tenho ${n}`);
const firstToolUsed = await page.evaluate(() => window.__boardTest.strokes[0].tool);
if (firstToolUsed !== "pen") fail(`o primeiro traço devia ser da caneta, é "${firstToolUsed}"`);

console.log("3) Anular e refazer...");
await page.click("#board-undo-btn");
if (await strokeCount() !== 0) fail("anular não tirou o traço");
await page.click("#board-redo-btn");
if (await strokeCount() !== 1) fail("refazer não repôs o traço");

console.log("4) A BORRACHA apaga onde passa — não limpa a folha...");
await page.click('[data-board-tool="eraser"]');
await drag([250, 210], [300, 240]);
n = await strokeCount();
console.log(`   traços depois de apagar: ${n} (1 desenho + 1 marca de borracha)`);
// Este é o coração do pedido: a borracha ACRESCENTA um traço que apaga, e o
// desenho original continua na lista. Se a borracha esvaziasse a lista, era
// um "limpar tudo" disfarçado.
if (n !== 2) fail(`a borracha devia deixar a lista com 2 traços, tem ${n}`);
const eraserStroke = await page.evaluate(() => {
  const s = window.__boardTest.strokes[1];
  return { tool: s.tool, points: s.points.length };
});
if (eraserStroke.tool !== "eraser") fail(`o segundo traço devia ser da borracha, é "${eraserStroke.tool}"`);
const composite = await page.evaluate(async () => (await import("./js/board.js")).BOARD_TOOLS.eraser.composite);
if (composite !== "destination-out") fail(`a borracha tem de apagar por composição, usa "${composite}"`);
// E o desenho de baixo continua inteiro: apagar por cima não pode mexer nos
// pontos do traço original.
const originalIntact = await page.evaluate(() => window.__boardTest.strokes[0].points.length > 2);
if (!originalIntact) fail("apagar por cima estragou o traço original");

console.log("5) Anular desfaz a borracha (é um traço como outro qualquer)...");
await page.click("#board-undo-btn");
if (await strokeCount() !== 1) fail("anular não desfez a marca da borracha");

console.log("6) 'Limpar tudo' pergunta antes, e só aí apaga tudo...");
page.once("dialog", (d) => d.dismiss());
await page.click("#board-clear-btn");
if (await strokeCount() !== 1) fail("recusar a confirmação apagou o quadro na mesma");
page.once("dialog", (d) => d.accept());
await page.click("#board-clear-btn");
if (await strokeCount() !== 0) fail("aceitar a confirmação não limpou o quadro");
// Limpar sem querer tem de se poder desfazer.
await page.click("#board-redo-btn");
if (await strokeCount() !== 1) fail("não consegui recuperar o quadro depois de limpar");

console.log("7) AFASTAR torna o traço mais fino em relação à folha...");
// A pergunta a que este passo responde: ao afastar, o mesmo traço passa a
// ocupar menos ecrã? Mede-se em pixéis de ecrã o comprimento do traço antes
// e depois — é a definição prática de "zoom out".
const screenSpan = () => page.evaluate(() => {
  const b = window.__boardTest;
  const s = b.strokes[0];
  const xs = s.points.map((p) => p.x * b.zoom + b.panX);
  const ys = s.points.map((p) => p.y * b.zoom + b.panY);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
});
const spanBefore = await screenSpan();
const widthBefore = await page.evaluate(() => window.__boardTest.strokes[0].width * window.__boardTest.zoom);
await page.click("#board-zoom-out-btn");
await page.click("#board-zoom-out-btn");
const spanAfter = await screenSpan();
const widthAfter = await page.evaluate(() => window.__boardTest.strokes[0].width * window.__boardTest.zoom);
const zoomNow = await page.evaluate(() => window.__boardTest.zoom);
console.log(`   zoom ${zoomNow.toFixed(2)} — traço no ecrã: ${spanBefore.toFixed(0)}px -> ${spanAfter.toFixed(0)}px, espessura ${widthBefore.toFixed(2)} -> ${widthAfter.toFixed(2)}`);
if (zoomNow >= 1) fail("afastar não baixou o zoom");
if (spanAfter >= spanBefore - 1) fail("afastar não encolheu o desenho no ecrã");
if (widthAfter >= widthBefore) fail("afastar não afinou a linha — a espessura tem de acompanhar a folha");

console.log("8) Aproximar e voltar a 100%...");
await page.click("#board-zoom-in-btn");
const zoomIn = await page.evaluate(() => window.__boardTest.zoom);
if (!(zoomIn > zoomNow)) fail("aproximar não subiu o zoom");
await page.click("#board-zoom-reset-btn");
if (await page.evaluate(() => window.__boardTest.zoom) !== 1) fail("o botão de 100% não repôs o zoom");

console.log("9) Enquadrar traz o desenho para dentro do ecrã...");
// Empurra a folha para bem longe e confirma que o botão a traz de volta.
await page.evaluate(() => { window.__boardTest.panX = -9000; window.__boardTest.panY = -9000; });
await page.click("#board-zoom-fit-btn");
const visible = await page.evaluate(() => {
  const b = window.__boardTest;
  return b.strokes[0].points.some((p) => {
    const x = p.x * b.zoom + b.panX;
    const y = p.y * b.zoom + b.panY;
    return x > 0 && x < b.rectW && y > 0 && y < b.rectH;
  });
});
if (!visible) fail("enquadrar não trouxe o desenho para o ecrã");

console.log("10) Espessura e transparência mudam mesmo o traço seguinte...");
await page.click('[data-board-tool="pen"]');
await page.click("#board-panel > summary");
await page.locator("#board-width-range").fill("30");
await page.locator("#board-opacity-range").fill("25");
await drag([600, 400], [750, 500]);
const last = await page.evaluate(() => {
  const s = window.__boardTest.strokes[window.__boardTest.strokes.length - 1];
  return { width: s.width, opacity: s.opacity };
});
console.log(`   traço novo: espessura ${last.width}, transparência ${last.opacity}`);
if (last.width !== 30) fail(`a espessura escolhida não foi usada (${last.width})`);
if (Math.abs(last.opacity - 0.25) > 0.01) fail(`a transparência escolhida não foi usada (${last.opacity})`);

console.log("10b) Cada ferramenta guarda a SUA espessura...");
// Uma espessura só para todas obrigava a reajustar o deslizador a cada troca:
// a borracha quer-se larga e o lápis fino. Trocar e voltar tem de repor o que
// lá estava, não arrastar o número da outra ferramenta.
await page.click('[data-board-tool="pen"]');
await page.locator("#board-width-range").fill("8");
await page.click('[data-board-tool="eraser"]');
const larguraBorracha = await page.evaluate(() => window.__boardTest.width);
await page.locator("#board-width-range").fill("40");
await page.click('[data-board-tool="pen"]');
const larguraCaneta = await page.evaluate(() => window.__boardTest.width);
await page.click('[data-board-tool="eraser"]');
const borrachaOutraVez = await page.evaluate(() => window.__boardTest.width);
console.log(`   caneta 8 -> borracha ${larguraBorracha} -> borracha 40 -> caneta ${larguraCaneta} -> borracha ${borrachaOutraVez}`);
if (larguraCaneta !== 8) fail(`a caneta devia continuar nos 8, está em ${larguraCaneta}`);
if (borrachaOutraVez !== 40) fail(`a borracha devia continuar nos 40, está em ${borrachaOutraVez}`);
if (larguraBorracha === 8) fail("a borracha não devia nascer com a espessura da caneta");
await page.click('[data-board-tool="pen"]');
await page.locator("#board-width-range").fill("30");
await page.click("#board-panel > summary");

console.log("11) Cores, formas e texto...");
await page.click('[data-board-color="#b24b38"]');
await page.click('[data-board-tool="rect"]');
await drag([300, 450], [430, 560], 4);
const shape = await page.evaluate(() => {
  const s = window.__boardTest.strokes[window.__boardTest.strokes.length - 1];
  return { tool: s.tool, color: s.color, points: s.points.length };
});
if (shape.tool !== "rect") fail(`esperava um retângulo, tenho "${shape.tool}"`);
if (shape.color !== "#b24b38") fail(`a cor escolhida não foi usada (${shape.color})`);
if (shape.points !== 2) fail(`uma forma guarda 2 pontos, esta tem ${shape.points}`);

// Um clique com a forma sem arrastar não pode deixar lixo na lista.
const beforeClick = await strokeCount();
const box = await page.locator("#board-canvas").boundingBox();
await page.mouse.click(box.x + 800, box.y + 300);
if (await strokeCount() !== beforeClick) fail("um clique sem arrastar deixou uma forma de tamanho zero");

page.once("dialog", (d) => d.accept("Olá quadro"));
await page.click('[data-board-tool="text"]');
await page.mouse.click(box.x + 500, box.y + 520);
const textStroke = await page.evaluate(() => {
  const s = window.__boardTest.strokes[window.__boardTest.strokes.length - 1];
  return { tool: s.tool, text: s.text };
});
if (textStroke.tool !== "text" || textStroke.text !== "Olá quadro") {
  fail(`o texto não foi escrito no quadro (${JSON.stringify(textStroke)})`);
}

console.log("12) O quadro sobrevive a recarregar a página...");
const beforeReload = await strokeCount();
await page.reload({ waitUntil: "networkidle" });
await page.click('[data-open-board]');
await page.waitForSelector('[data-screen="board"].active');
await page.evaluate(async () => { window.__boardTest = (await import("./js/board.js")).__board; });
const afterReload = await strokeCount();
console.log(`   traços antes: ${beforeReload}, depois de recarregar: ${afterReload}`);
if (afterReload !== beforeReload) fail("o quadro não sobreviveu a recarregar");

console.log("13) Nenhuma ferramenta pode ficar sem o que o redesenho precisa...");
// Regra, não comportamento: se alguém acrescentar uma ferramenta nova sem
// composite/alpha/widthScale, o redesenho rebenta em silêncio. Falha aqui.
const badTools = await page.evaluate(async () => {
  const { BOARD_TOOLS } = await import("./js/board.js");
  return Object.entries(BOARD_TOOLS)
    .filter(([, t]) => !t.composite || typeof t.alpha !== "number" || typeof t.widthScale !== "number" || !t.label)
    .map(([k]) => k);
});
if (badTools.length > 0) fail(`ferramentas mal definidas: ${badTools.join(", ")}`);

// E só a borracha pode apagar: uma caneta com destination-out apagaria a
// folha achando que estava a escrever.
const wrongErasers = await page.evaluate(async () => {
  const { BOARD_TOOLS } = await import("./js/board.js");
  return Object.entries(BOARD_TOOLS)
    .filter(([k, t]) => t.composite === "destination-out" && k !== "eraser")
    .map(([k]) => k);
});
if (wrongErasers.length > 0) fail(`estas ferramentas apagam sem ser a borracha: ${wrongErasers.join(", ")}`);

console.log("14) A BORRACHA não pode comer o fundo...");
// A borracha apaga com "destination-out", que come tudo o que estiver na mesma
// tela. Com o fundo por baixo na mesma tela, apagar num quadro de giz abria
// buracos brancos e num fundo quadriculado apagava a grelha. Mede-se o pixel:
// onde a borracha passou tem de continuar a ler-se o papel escuro.
await page.evaluate(async () => {
  const m = await import("./js/board.js");
  m.__board.strokes = [];
  m.setBoardBackground("chalk");
  m.selectColor("#f2ead8");
  m.selectWidth(9);
});
const readPixel = (x, y) => page.evaluate(([px, py]) => {
  const c = document.getElementById("board-canvas");
  const r = window.devicePixelRatio || 1;
  const d = c.getContext("2d").getImageData(Math.round(px * r), Math.round(py * r), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, [x, y]);
await page.click('[data-board-tool="pen"]');
await drag([300, 150], [700, 150]);
const paper = await readPixel(120, 300);
console.log(`   papel do quadro de giz: ${paper.join(",")}`);
await page.click('[data-board-tool="eraser"]');
await drag([300, 150], [700, 150]);
const wiped = await readPixel(500, 150);
console.log(`   onde a borracha passou: ${wiped.join(",")}`);
if (wiped[3] < 250) fail("a borracha deixou o fundo transparente — abriu um buraco na folha");
if (wiped[0] > 150 && wiped[1] > 150 && wiped[2] > 150) {
  fail(`a borracha deixou uma mancha clara (${wiped.join(",")}) em vez do papel escuro`);
}
if (Math.abs(wiped[0] - paper[0]) > 12 || Math.abs(wiped[1] - paper[1]) > 12 || Math.abs(wiped[2] - paper[2]) > 12) {
  fail(`onde se apagou não voltou ao papel (papel ${paper.join(",")}, apagado ${wiped.join(",")})`);
}
await page.evaluate(async () => {
  const m = await import("./js/board.js");
  m.setBoardBackground("plain");
  m.__board.strokes = [];
});
await page.click('[data-board-tool="pen"]');

console.log("14b) O quadro cheio PARA de aceitar — nunca come o que já lá está...");
// Mesma regra do quadro de sala, e pelo mesmo motivo: a borracha também é um
// traço, por isso um teto que deitasse fora os antigos fazia o desenho
// encolher por trás de quem estava a apagar um canto.
const marcado = await page.evaluate(async () => {
  const m = await import("./js/board.js");
  const b = m.__board;
  b.strokes = [{ tool: "pen", color: "#111111", width: 4, points: [{ x: 5, y: 5 }, { x: 9, y: 9 }], marca: "PRIMEIRO" }];
  // Enche até ao teto com traços sintéticos.
  while (b.strokes.length < 4000) {
    b.strokes.push({ tool: "pen", color: "#222222", width: 2, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  }
  return { total: b.strokes.length, primeiro: b.strokes[0].marca };
});
console.log(`   antes de desenhar: ${marcado.total} traços, o primeiro é "${marcado.primeiro}"`);
await drag([200, 300], [400, 380]);
await drag([220, 320], [420, 400]);
const depoisDeCheio = await page.evaluate(() => ({
  total: window.__boardTest.strokes.length,
  primeiro: window.__boardTest.strokes[0].marca || "(perdido)",
  aviso: document.getElementById("board-status").textContent,
}));
console.log(`   depois: ${depoisDeCheio.total} traços, o primeiro é "${depoisDeCheio.primeiro}"`);
console.log(`   aviso no ecrã: "${depoisDeCheio.aviso}"`);
if (depoisDeCheio.primeiro !== "PRIMEIRO") fail("o quadro cheio comeu o traço mais antigo");
if (depoisDeCheio.total > 4000) fail(`passou do teto: ${depoisDeCheio.total}`);
if (!/cheio/i.test(depoisDeCheio.aviso)) fail("o quadro cheio tem de dizer que está cheio");

console.log("14c) Anular um 'limpar tudo' devolve o desenho INTEIRO...");
// Com um corte pelo tamanho da pilha de anulações, quem tivesse mais traços
// do que isso recuperava só o fim e ficava com meio desenho a achar que era
// tudo — pior do que não recuperar nada, porque parece que correu bem.
await page.evaluate(async () => {
  const m = await import("./js/board.js");
  const b = m.__board;
  b.strokes = [];
  for (let i = 0; i < 300; i += 1) {
    b.strokes.push({ tool: "pen", color: "#333333", width: 2, points: [{ x: i, y: i }, { x: i + 1, y: i + 1 }], n: i });
  }
  b.redo = [];
});
page.once("dialog", (d) => d.accept());
await page.click("#board-clear-btn");
if (await strokeCount() !== 0) fail("limpar não esvaziou o quadro");
await page.click("#board-redo-btn");
const recuperados = await page.evaluate(() => window.__boardTest.strokes.length);
console.log(`   300 traços -> limpar -> anular devolveu ${recuperados}`);
if (recuperados !== 300) fail(`devolveu só ${recuperados} dos 300 traços`);
const ordemOk = await page.evaluate(() => window.__boardTest.strokes.every((s, i) => s.n === i));
if (!ordemOk) fail("os traços voltaram fora da ordem em que foram desenhados");
await page.evaluate(() => { window.__boardTest.strokes = []; window.__boardTest.redo = []; });
await drag([200, 200], [400, 300]);

console.log("15) Há sempre caminho de volta: o botão e o 'voltar' do browser...");
// A queixa foi mesmo esta: entrava-se no quadro e não se via como sair. O
// botão é agora o primeiro da barra; e quem carrega no "voltar" do telemóvel
// por instinto também tem de sair do quadro, não do jogo.
const backBtn = await page.evaluate(() => {
  const b = document.getElementById("board-exit-btn");
  const tb = document.querySelector(".board-toolbar").getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const all = [...document.querySelectorAll(".board-toolbar button")];
  return {
    visible: r.width > 0 && r.height > 0,
    dentroDaBarra: r.top >= tb.top - 1 && r.bottom <= tb.bottom + 1,
    // Sem precisar de deslizar a barra para o encontrar:
    naPrimeiraFila: r.top - tb.top < 8,
    ordem: all.indexOf(b),
    texto: b.textContent.trim(),
  };
});
console.log(`   botão "${backBtn.texto}": visível=${backBtn.visible}, primeira fila=${backBtn.naPrimeiraFila}`);
if (!backBtn.visible || !backBtn.dentroDaBarra) fail("o botão de voltar não está visível na barra");
if (!backBtn.naPrimeiraFila) fail("o botão de voltar não está na primeira fila — obriga a procurar");
await page.click("#board-exit-btn");
await page.waitForSelector('[data-screen="home"].active', { timeout: 5000 });

// E o "voltar" do browser/telemóvel também sai do quadro.
await page.click("[data-open-board]");
await page.waitForSelector('[data-screen="board"].active', { timeout: 5000 });
await page.goBack();
await page.waitForSelector('[data-screen="home"].active', { timeout: 5000 });
console.log("   o 'voltar' do browser sai do quadro sem sair do jogo: ok");

console.log("16) Também se chega ao quadro pelo menu de jogar sozinho...");
await page.click("#solo-menu-btn");
await page.click('.screen.active [data-open-board]');
await page.waitForSelector('[data-screen="board"].active', { timeout: 5000 });

console.log("17) No telemóvel a folha manda, e os alvos dão-se com o dedo...");
// Medido num iPhone 13: a barra chegou a ocupar 279px de 664 (42% do ecrã só
// para botões). Este passo impede que volte a crescer, e mede os alvos de
// toque como o resto da app faz — pela ETIQUETA, que é o que se toca, não
// pela caixa de seleção lá dentro.
const mob = await browser.newContext({ ...devices["iPhone 13"] });
const mpage = await mob.newPage();
await mpage.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await mpage.click("[data-open-board]");
await mpage.waitForSelector('[data-screen="board"].active');
await mpage.click("#board-panel > summary");
const layout = await mpage.evaluate(() => {
  const tb = document.querySelector(".board-toolbar").getBoundingClientRect();
  const panel = document.querySelector(".board-panel-body").getBoundingClientRect();
  const small = [];
  document.querySelectorAll(".board-screen button, .board-screen select, .board-screen summary, .board-screen label").forEach((el) => {
    if (!el.offsetParent) return;
    if (el.closest("details:not([open])")) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 40 || r.width < 40) small.push(`${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  // O deslizador não tem etiqueta própria: mede-se ele mesmo.
  document.querySelectorAll('.board-panel-body input[type="range"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height < 40) small.push(`${el.id} ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  return {
    toolbarH: Math.round(tb.height),
    vh: window.innerHeight,
    vw: window.innerWidth,
    panelLeft: Math.round(panel.left),
    panelRight: Math.round(panel.right),
    panelTop: Math.round(panel.top),
    panelBottom: Math.round(panel.bottom),
    small,
  };
});
const share = layout.toolbarH / layout.vh;
console.log(`   barra: ${layout.toolbarH}px de ${layout.vh} (${Math.round(share * 100)}% do ecrã)`);
console.log(`   alvos abaixo de 40px: ${layout.small.length ? layout.small.join(" | ") : "nenhum"}`);
if (share > 0.34) fail(`a barra come ${Math.round(share * 100)}% do ecrã — a folha é que devia mandar`);
if (layout.small.length > 0) fail(`alvos pequenos demais para o dedo: ${layout.small.join(", ")}`);
// O painel abria ancorado ao botão "Mais" e saía pela margem esquerda fora.
if (layout.panelLeft < 0 || layout.panelRight > layout.vw) {
  fail(`o painel sai do ecrã (de ${layout.panelLeft} a ${layout.panelRight}, ecrã ${layout.vw})`);
}
// E também não pode sair por cima nem por baixo: era assim que fugia — ficava
// agarrado ao botão e, ao rolar, saía do ecrã.
if (layout.panelTop < 0 || layout.panelBottom > layout.vh) {
  fail(`o painel sai do ecrã na vertical (de ${layout.panelTop} a ${layout.panelBottom}, ecrã ${layout.vh})`);
}
// E com o painel aberto a barra continua a funcionar: num quadro quer-se
// escolher a borracha e ver a espessura dela mudar no mesmo gesto, sem ter de
// fechar e abrir a cada troca.
const barraUsavelComPainel = await mpage.evaluate(() => {
  const b = document.querySelector('[data-board-tool="eraser"]');
  const r = b.getBoundingClientRect();
  const emCima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!b.contains(emCima) || b === emCima;
});
console.log(`   a barra continua a funcionar com o painel aberto: ${barraUsavelComPainel}`);
if (!barraUsavelComPainel) fail("o painel não pode tapar a barra de ferramentas");
// Fecha-se pelo "Pronto".
await mpage.click("#board-panel-close-btn");
const fechou = await mpage.evaluate(() => !document.getElementById("board-panel").hasAttribute("open"));
if (!fechou) fail("o botão Pronto devia fechar o painel");
await mob.close();

if (errors.length > 0) {
  console.log(`   FALHOU: erros de JavaScript: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
}

await browser.close();
console.log(process.exitCode ? "=> board-test FALHOU" : "=> board-test ok");
