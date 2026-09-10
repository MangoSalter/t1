// OS VARRIMENTOS DO TELEMÓVEL: um alvo de toque e um nome para leitor de ecrã
// em cada controlo, em todo o lado.
//
// Isto vivia no a11y-test e passou a ficheiro próprio quando o conjunto
// chegou aos cinco minutos que o runner dá a cada caso e foi morto a meio.
// Separam-se bem: o a11y-test cuida do foco, do movimento reduzido e do
// contraste; aqui mede-se tamanho e nome, ecrã a ecrã e sobreposição a
// sobreposição. E como o runner corre os casos em paralelo, partir em dois
// também encurta o relógio.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const errors = [];

// Corre DENTRO da página, e serve os dois passos que se seguem. Recebe o que
// varrer ("sobreposicoes" ou "ecras") e devolve, por cada raiz, os controlos
// visíveis, os que não cabem no dedo e os que um leitor de ecrã não sabe
// anunciar.
//
// O nome acessível não é o textContent. Um <select> tem as opções lá dentro,
// por isso "o texto tem letras" dava-o sempre por nomeado — e a primeira
// versão desta verificação PASSOU depois de eu tirar de propósito o
// aria-label ao selector de língua. O que conta é a etiqueta: aria-label,
// title, ou o <label> à volta sem o texto do próprio controlo.
//
// E o PLACEHOLDER não conta, de propósito. Os browsers usam-no como último
// recurso, por isso a rigor um campo com placeholder não está mudo — mas o
// placeholder desaparece assim que se escreve, e quem usa leitor de ecrã e
// volta ao campo a meio deixa de ouvir o que ele é. Sete campos viviam disso:
// o nome, o código da sala, as duas caixas da Forca solo, a do Palavra
// Relâmpago e as duas do mapa. Levaram aria-label.
function varrerControlos(modo) {
  const nomeDe = (el) => {
    const direto = (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
    if (direto) return direto;
    const semControlos = (raiz) => {
      const copia = raiz.cloneNode(true);
      copia.querySelectorAll("select, input, textarea").forEach((c) => c.remove());
      return copia.textContent.trim();
    };
    if (el.tagName === "LABEL") return semControlos(el);
    if (["SELECT", "INPUT", "TEXTAREA"].includes(el.tagName)) {
      const rotulo = el.closest("label") || (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
      return rotulo ? semControlos(rotulo) : "";
    }
    return (el.textContent || "").trim();
  };
  const medir = (raiz) => {
    const maus = [];
    const semNome = [];
    let vistos = 0;
    raiz.querySelectorAll("button, label, [role=button], select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea").forEach((el) => {
      if (el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) return;
      vistos += 1;
      const nome = nomeDe(el);
      if (r.height < 44 || r.width < 44) {
        maus.push(`${nome.slice(0, 12) || el.id} (${Math.round(r.height)}x${Math.round(r.width)})`);
      }
      if (!/\p{L}/u.test(nome)) semNome.push(`${el.id || el.className} "${nome}"`);
    });
    return { vistos, maus, semNome };
  };

  // O ecrã que está ligado agora, com tudo o que o jogo lhe pôs lá dentro, e
  // as sobreposições que estiverem abertas por cima dele.
  if (modo === "ativo") {
    const raizes = [
      document.querySelector(".screen.active"),
      ...document.querySelectorAll(".pause-overlay:not(.hidden), .minigame-end-overlay:not(.hidden)"),
    ].filter(Boolean);
    return raizes.map((raiz) => ({ onde: raiz.dataset.screen || raiz.id, ...medir(raiz), transborda: false }));
  }

  if (modo === "sobreposicoes") {
    return [...document.querySelectorAll(".pause-overlay, .minigame-end-overlay")].map((ov) => {
      const escondida = ov.classList.contains("hidden");
      ov.classList.remove("hidden");
      const medida = medir(ov);
      // E se o cartão não cabe no ecrã do telemóvel, o que está no fundo não
      // se alcança — medir os botões não chega se metade deles ficar fora.
      const cartao = ov.querySelector(".card, .minigame-end-card");
      const transborda = cartao ? cartao.getBoundingClientRect().height > window.innerHeight : false;
      if (escondida) ov.classList.add("hidden");
      return { onde: ov.id || "(sem id)", ...medida, transborda };
    });
  }

  const ecras = [...document.querySelectorAll("[data-screen]")];
  const antes = ecras.map((e) => e.classList.contains("active"));
  const resultado = ecras.map((alvo) => {
    ecras.forEach((e) => e.classList.toggle("active", e === alvo));
    return { onde: alvo.dataset.screen, ...medir(alvo), transborda: false };
  });
  ecras.forEach((e, i) => e.classList.toggle("active", antes[i]));
  return resultado;
}

// Uma queixa por família, com a lista à frente, para não imprimir um ecrã de
// texto quando alguma coisa se parte em cinquenta sítios ao mesmo tempo.
function queixar(titulo, linhas) {
  console.log(`   ${titulo}: ${linhas.length}`);
  linhas.slice(0, 8).forEach((l) => console.log(`      ${l}`));
  if (linhas.length > 0) process.exitCode = 1;
}

console.log("1) As sobreposições, que se abrem por cima de tudo e nunca foram medidas...");
// O passo 8 do a11y-test mede UMA sobreposição — a paleta. Há dezasseis, e as outras
// quinze nunca passaram por aqui por duas razões que se somam: vivem fora
// dos [data-screen], por isso o varrimento barato dos ecrãs não lhes toca, e
// nascem com "hidden", por isso um varrimento que salte o que não se vê
// também não. Abre-se uma de cada vez e mede-se o que lá está.
//
// Quem isto apanhou: o editor do avatar. As sete cores com que se desenha a
// cara mediam 26px de lado, sem regra de telemóvel nenhuma, e não tinham
// nome nenhum para quem usa leitor de ecrã — e o avatar desenha-se no
// telemóvel, no primeiro ecrã, antes de entrar em sala.
//
// O que isto NÃO apanha: as sobreposições cujo conteúdo só é construído
// quando se abrem a sério (as cores da Forca). Por isso conta-se quantos
// controlos se viu em cada uma e imprime-se — uma sobreposição vazia fica à
// vista em vez de passar calada.
const sobCtx = await browser.newContext({ ...devices["iPhone 13"] });
const sp = await sobCtx.newPage();
await sp.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await sp.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await sp.reload({ waitUntil: "networkidle" });
const sobreposicoes = await sp.evaluate(varrerControlos, "sobreposicoes");
console.log(`   ${sobreposicoes.length} sobreposições medidas`);
console.log(`   vazias (conteúdo só nasce ao abrir a sério): ${sobreposicoes.filter((o) => o.vistos === 0).map((o) => o.onde).join(", ") || "nenhuma"}`);
if (sobreposicoes.length < 15) {
  console.log(`   FALHOU: só encontrei ${sobreposicoes.length} sobreposições — o seletor deixou de as apanhar`);
  process.exitCode = 1;
}
queixar("alvos abaixo de 44px", sobreposicoes.flatMap((o) => o.maus.map((m) => `${o.onde}: ${m}`)));
queixar("sem nome para leitor de ecrã", sobreposicoes.flatMap((o) => o.semNome.map((n) => `${o.onde}: ${n}`)));
queixar("mais altas do que o ecrã do telemóvel", sobreposicoes.filter((o) => o.transborda).map((o) => o.onde));
await sobCtx.close();

console.log("2) Os 41 ecrãs, todos, sem navegar até nenhum...");
// Este varrimento existia como ferramenta de mão — abrir a página num
// telemóvel, ligar cada [data-screen] à vez e medir o que aparece — e foi
// assim que se apanhou a barra da Forca a 40px. Ficava por escrever no
// disco: da próxima vez que alguém acrescente um ecrã, ninguém volta a
// correr uma ferramenta que não está em lado nenhum. Agora corre sempre.
//
// Os passos 10 e 11 do a11y-test navegam até três ecrãs a sério e medem tudo o que lá
// está, dinâmico incluído; este chega aos 41, mas só vê o que vem escrito no
// index.html. Um não substitui o outro: este diz onde ir olhar.
const varreCtx = await browser.newContext({ ...devices["iPhone 13"] });
const vp = await varreCtx.newPage();
await vp.goto("http://localhost:8936/index.html?oficina=1", { waitUntil: "networkidle" });
await vp.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await vp.reload({ waitUntil: "networkidle" });
const varrimento = await vp.evaluate(varrerControlos, "ecras");
console.log(`   ${varrimento.length} ecrãs, ${varrimento.filter((e) => e.vistos > 0).length} com controlos no index.html`);
if (varrimento.length < 35) {
  console.log(`   FALHOU: só encontrei ${varrimento.length} ecrãs — o seletor deixou de os apanhar`);
  process.exitCode = 1;
}
queixar("alvos abaixo de 44px", varrimento.flatMap((e) => e.maus.map((m) => `${e.onde}: ${m}`)));
queixar("sem nome para leitor de ecrã", varrimento.flatMap((e) => e.semNome.map((n) => `${e.onde}: ${n}`)));
await varreCtx.close();

console.log("3) O jogo clássico a sério, com os botões que só nascem a jogar...");
// O passo 2 chega aos 41 ecrãs mas só vê o que está escrito no index.html.
// Estes quatro ecrãs enchem-se de botões feitos em JavaScript — as letras
// para votar, as linhas do "porquê estes pontos", o álbum da noite — e
// nenhum deles tinha sido medido num telemóvel. É o jogo principal: se
// alguma coisa aqui não se acerta com o dedo, não se acerta no jogo todo.
const classicoCtx = await browser.newContext({ ...devices["iPhone 13"] });
const jp = await classicoCtx.newPage();
await jp.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await jp.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await jp.reload({ waitUntil: "networkidle" });
await jp.fill("#name-input", "Ana");
await jp.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await jp.click("#create-room-btn");
await jp.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const codigoClassico = (await jp.locator("#lobby-code").textContent()).trim();
await jp.evaluate((c) => window.__testDb.update(`rooms/${c}/players`, {
  p2: { name: "Beto", score: 12, connected: true },
  p3: { name: "Carla", score: 7, connected: true },
}), codigoClassico);
await jp.waitForTimeout(300);

const passarPor = async (nome, ecraEsperado, patch) => {
  await jp.evaluate(({ c, p }) => {
    const r = window.__testDb.get(`rooms/${c}`);
    window.__testDb.update(`rooms/${c}`, typeof p === "string" ? JSON.parse(p.replace(/__HOST__/g, r.hostId)) : p);
  }, { c: codigoClassico, p: patch });
  await jp.waitForSelector(`[data-screen="${ecraEsperado}"].active`, { timeout: 6000 });
  await jp.waitForTimeout(250);
  const medidas = await jp.evaluate(varrerControlos, "ativo");
  const vistos = medidas.reduce((n, m) => n + m.vistos, 0);
  console.log(`   ${nome}: ${vistos} controlos`);
  return { nome, vistos, medidas };
};

const agora = Date.now();
const etapas = [];
etapas.push(await passarPor("escolha da letra", "letterpick", JSON.stringify({
  state: "letterPick", round: 1,
  ball: { winnerId: "__HOST__" },
  letterPick: { candidates: ["M", "P", "T"], votes: { p2: "M", p3: "P" }, endAt: agora + 60000 },
})));
etapas.push(await passarPor("a escrever respostas", "categories", {
  state: "categories",
  categoriesRound: { letter: "M", categoryIndexes: [0, 1, 2, 3], endAt: agora + 90000 },
}));
etapas.push(await passarPor("porquê estes pontos", "roundscore", JSON.stringify({
  state: "roundScore",
  roundResults: {
    roundPoints: { __HOST__: 20, p2: 10, p3: 0 },
    byPlayer: {
      __HOST__: { c0: { text: "Maria", points: 10, unique: true }, c1: { text: "Marrocos", points: 10, unique: true } },
      p2: { c0: { text: "Maria", points: 5, unique: false }, c1: { text: "", points: 0 } },
      p3: { c0: { text: "Ana", points: 0, invalid: true }, c1: { text: "Malta", points: 10, unique: true } },
    },
  },
})));
etapas.push(await passarPor("fim da partida", "final", { state: "final" }));

// Sem esta conta, um ecrã que não chegou a encher-se passava calado.
for (const e of etapas) {
  if (e.vistos < 2) {
    console.log(`   FALHOU: "${e.nome}" só tinha ${e.vistos} controlos — não cheguei lá, a medição não diz nada`);
    process.exitCode = 1;
  }
}
queixar("alvos abaixo de 44px", etapas.flatMap((e) => e.medidas.flatMap((m) => m.maus.map((x) => `${e.nome}/${m.onde}: ${x}`))));
queixar("sem nome para leitor de ecrã", etapas.flatMap((e) => e.medidas.flatMap((m) => m.semNome.map((x) => `${e.nome}/${m.onde}: ${x}`))));
await classicoCtx.close();

console.log("4) O botão a dizer 'a carregar...' — que é UI nova e nunca foi medida...");
// Os três pesos-pesados chegam ao clique (ver o carregador no fim do
// index.html) e o botão muda de texto enquanto o módulo viaja. Isso é UI
// nova: num telemóvel um botão que encolhe abaixo dos 44px a meio de um
// toque é um botão que se falha à segunda tentativa. Mede-se no estado
// transitório, segurando o pedido do módulo o tempo suficiente para lá
// chegar.
const lentoCtx = await browser.newContext({ ...devices["iPhone 13"] });
const lp = await lentoCtx.newPage();
// Segura o solo.js: é o maior dos três, e é o que uma rede má faz de graça.
await lp.route("**/js/solo.js", async (rota) => {
  await new Promise((r) => setTimeout(r, 1500));
  await rota.continue();
});
await lp.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await lp.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await lp.reload({ waitUntil: "networkidle" });
const botaoSolo = lp.locator("#solo-menu-btn");
const rotuloAntes = (await botaoSolo.textContent()).trim();
const caixaAntes = await botaoSolo.boundingBox();
const aClicar = botaoSolo.click();
await lp.waitForFunction(
  () => /carregar/i.test(document.getElementById("solo-menu-btn").textContent),
  { timeout: 5000 },
);
const caixaDurante = await botaoSolo.boundingBox();
console.log(`   antes: ${Math.round(caixaAntes.width)}x${Math.round(caixaAntes.height)} · a carregar: ${Math.round(caixaDurante.width)}x${Math.round(caixaDurante.height)}`);
if (caixaDurante.height < 44 || caixaDurante.width < 44) {
  console.log("   FALHOU: o botão encolheu abaixo dos 44px enquanto carregava");
  process.exitCode = 1;
}
await aClicar;
await lp.waitForSelector('[data-screen="solo-menu"].active', { timeout: 10000 });
const rotuloDepois = (await botaoSolo.textContent()).trim();
console.log(`   rótulo: "${rotuloAntes}" -> "a carregar..." -> "${rotuloDepois}"`);
if (rotuloDepois !== rotuloAntes) {
  console.log(`   FALHOU: o rótulo não voltou ao que era ("${rotuloDepois}")`);
  process.exitCode = 1;
}
await lentoCtx.close();

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
