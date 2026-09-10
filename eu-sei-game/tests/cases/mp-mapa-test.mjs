// O mapa-múndi numa sala, com dois jogadores a sério.
//
// A pergunta que interessa é a que não se pode responder olhando para o
// código: quando a Ana conquista um país, o Beto vê-o pintado NO ECRÃ DELE,
// com a cor da Ana? E quando o Beto falha, a Ana ganha alguma coisa por saber
// o que ele não sabia?
import { chromium } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
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
const anaUid = await ana.evaluate((c) => window.__testDb.get(`rooms/${c}`).hostId, code);
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

// A comparação é feita DENTRO da página: passar a tela inteira para fora
// (1280x584, três milhões de números) demorava segundos e comia a janela de
// oito em que o país vale a dobrar — o passo seguinte deste teste passou a
// falhar por causa da medição, não do jogo.
const guardarTela = (p) => p.evaluate(() => {
  const cv = document.getElementById("mapa-canvas");
  window.__telaAntes = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.slice();
});
const mudancasNaTela = (p) => p.evaluate(() => {
  const cv = document.getElementById("mapa-canvas");
  const agora = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  const antes = window.__telaAntes;
  let n = 0;
  for (let i = 0; i < agora.length; i += 4) {
    if (agora[i] !== antes[i] || agora[i + 1] !== antes[i + 1] || agora[i + 2] !== antes[i + 2]) n += 1;
  }
  return n;
});
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
await guardarTela(ana); // a fotografia é ANTES do erro: depois já traz a marca
await escrever(beto, "gronelandia");
await beto.waitForTimeout(800);

// E a Ana tem de VER onde está a oportunidade. A regra existia e não se via:
// só quem tivesse visto o outro falhar é que sabia onde valia a dobrar. A
// marca é um contorno a tracejado e um "x2" — nem cor nem preenchimento, para
// quem não distingue cores a ver na mesma.
//
// Compara-se a TELA INTEIRA, píxel a píxel. A primeira versão contava píxeis
// escuros à volta do país e não acusava nada: o "x2" traz um halo branco por
// baixo que apaga tantos píxeis escuros do contorno como os que a letra
// acrescenta. O número mexia zero e a marca estava lá.
await ana.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return Object.keys(m.mapa.emCausa || {}).includes("Argentina");
}, { timeout: 10000 });
await ana.waitForTimeout(300);
const mudou = await mudancasNaTela(ana);
console.log(`   píxeis mudados no mapa quando a Argentina fica em causa: ${mudou}`);
if (mudou < 200) fail("o país em causa tinha de ficar marcado no desenho, não só no estado da sala");

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

console.log("6) A ajuda do Brasa aparece no mapa DE TODA A GENTE, não só de quem a pediu...");
// Uma ajuda que só um vê não é uma ajuda numa sala: é uma vantagem, e quem
// pediu ajuda não devia ficar à frente por ter pedido ajuda.
const pistasDe = (p) => p.evaluate(async () => {
  const m = await import("./js/mapa.js");
  return [...(m.mapa.pistas || [])];
});
console.log(`   pistas antes: Ana ${JSON.stringify(await pistasDe(ana))}, Beto ${JSON.stringify(await pistasDe(beto))}`);
await beto.click("#mapa-ajuda-btn");
await ana.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return (m.mapa.pistas || []).length > 0;
}, { timeout: 10000 });
const pistasAna = await pistasDe(ana);
const pistasBeto = await pistasDe(beto);
console.log(`   o Beto pediu ajuda e a Ana passou a ver: ${JSON.stringify(pistasAna)}`);
if (pistasAna.length === 0) fail("a bandeira revelada devia aparecer também no mapa da Ana");
if (JSON.stringify(pistasAna) !== JSON.stringify(pistasBeto)) {
  fail(`os dois mapas deviam mostrar as mesmas pistas (Ana ${JSON.stringify(pistasAna)}, Beto ${JSON.stringify(pistasBeto)})`);
}
semErros("depois da ajuda");

console.log("7) A Dona Manga rouba um país a quem o tinha, e os dois ecrãs dão por isso...");
// O anfitrião é que a solta, ao fim de MAPA_MANGA_CADA_MS. Em vez de esperar
// noventa segundos, envelhece-se o relógio da partida.
const antesDaManga = await donos(ana);
console.log(`   países conquistados antes: ${JSON.stringify(Object.keys(antesDaManga))}`);
// A gata só rouba com três países no mapa — é preciso mais um.
await escrever(ana, "peru");
await ana.waitForFunction(async () => {
  const m = await import("./js/mapa.js");
  return Object.keys(m.mapa.donos).length >= 3;
}, { timeout: 10000 });
await ana.evaluate((c) => {
  window.__testDb.update(`rooms/${c}/mapa`, { comecouEm: Date.now() - 600000 });
}, code);
await ana.waitForFunction((c) => !!window.__testDb.get(`rooms/${c}`).mapa?.manga, code, { timeout: 20000 });
const travessura = await ana.evaluate((c) => window.__testDb.get(`rooms/${c}`).mapa.manga, code);
console.log(`   a Dona Manga levou: ${travessura.pais} (era de ${travessura.de === anaUid ? "Ana" : travessura.de})`);
if (!travessura.pais) fail("a gata devia ter escolhido um país");
// E o país volta mesmo a estar por conquistar, nos dois ecrãs.
for (const [nome, p] of [["Ana", ana], ["Beto", beto]]) {
  await p.waitForFunction(async (alvo) => {
    const m = await import("./js/mapa.js");
    return !m.mapa.donos[alvo];
  }, travessura.pais, { timeout: 10000 }).catch(() => fail(`${nome} devia ver ${travessura.pais} outra vez por conquistar`));
}
const anuncio = (await ana.locator("#mapa-status").textContent()).trim();
console.log(`   e o mapa disse: "${anuncio}"`);
if (!/manga/i.test(anuncio)) fail("o mapa devia contar que foi a Dona Manga");
semErros("depois da travessura");

console.log("8) Acabar a partida paga um pódio ao placar da sala, não os pontos todos do mapa...");
const marcadorDaAna = await ana.evaluate((c) => window.__testDb.get(`rooms/${c}`).mapa.marcadores, code);
const pontosNoMapa = marcadorDaAna[anaUid]?.pontos || 0;
const scoreAntes = await ana.evaluate((c) => window.__testDb.get(`rooms/${c}`).players[window.__testDb.get(`rooms/${c}`).hostId].score || 0, code);
console.log(`   a Ana tem ${pontosNoMapa} pontos no mapa e ${scoreAntes} no placar da sala`);
if (scoreAntes !== 0) fail("durante o jogo o mapa não devia estar a somar ao placar da sala");
// O anfitrião acaba a partida pelo botão de voltar.
await ana.click("#mapa-exit-btn");
await ana.waitForFunction((c) => window.__testDb.get(`rooms/${c}`).mapa?.pago === true, code, { timeout: 15000 });
const pago = await ana.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  return { pagamento: r.mapa.pagamento, scores: Object.fromEntries(Object.entries(r.players).map(([u, p]) => [p.name, p.score || 0])) };
}, code);
console.log(`   pagamento: ${JSON.stringify(pago.pagamento)} · placar: ${JSON.stringify(pago.scores)}`);
if (!(pago.scores.Ana > 0)) fail("a Ana devia ter levado alguma coisa por ter conquistado mais");
if (pago.scores.Ana > 40) fail(`o mapa não pode pagar ${pago.scores.Ana} à sala — os outros bónus pagam 25`);
if (pontosNoMapa > 40 && pago.scores.Ana >= pontosNoMapa) {
  fail("o placar da sala não pode levar os pontos todos do marcador do mapa");
}
semErros("depois de pagar");

console.log("9) Nenhum erro de JavaScript em todo o percurso...");
semErros("no fim");
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: ok");
await browser.close();
