// QUANTO DO JOGO É QUE ESTÁ MESMO NAS TRÊS LÍNGUAS.
//
// O seletor de língua está na primeira coisa que se vê, e promete três. Até
// aqui cumpria uma: só o mapa passava pelo t(). Medido com o próprio
// i18n-ecra.js a correr, a marcação estática tinha 9 textos traduzidos e 285
// em português — o ecrã de entrada, o menu de jogar sozinho e a sala de
// espera incluídos. Quem escolhia English criava a sala em português.
//
// Este caso mede, não confia. Um tecto por ecrã na porta de entrada (zero, e
// é zero mesmo) e um tecto global que só pode descer. Como o carga-inicial:
// um número que alguém tem de mexer de propósito, não uma nota que envelhece
// sozinha.
import { chromium, devices } from "playwright";
import { abrirBrowser } from "./test-helpers.mjs";

const browser = await abrirBrowser(chromium);
const erros = [];
function check(label, cond, extra = "") {
  if (cond) console.log(`OK: ${label}`);
  else { console.error(`FALHOU: ${label}${extra ? ` — ${extra}` : ""}`); erros.push(label); }
}

// O que sobra em português não é tudo defeito. Três famílias ficam de fora
// de propósito:
//
// - os nomes próprios (Eu sei!, Dona Manga, Kota) não se traduzem em jogo
//   nenhum, e traduzi-los partia a coesão da casa;
// - os nomes das línguas dentro do seletor são sempre a língua que nomeiam —
//   "English" tem de dizer English mesmo a quem lê espanhol, senão não se
//   encontra;
// - as CATEGORIAS do jogo clássico (Animal, Cidade, Fruta...) são conteúdo e
//   vivem no data.js. Traduzi-las decide em que língua se RESPONDE, que é
//   coisa do dono e não arrumação; ficam listadas aqui para o tecto não as
//   contar como trabalho por fazer.
// O que sobra em português não é tudo defeito. Três famílias ficam de fora
// de propósito, e a lista é curta porque cada entrada é uma renúncia:
//
// - os nomes próprios (Eu sei!, Dona Manga, Kota) não se traduzem em jogo
//   nenhum, e traduzi-los partia a coesão da casa;
// - os nomes das línguas dentro do seletor são sempre a língua que nomeiam —
//   "English" tem de dizer English mesmo a quem lê espanhol, senão não se
//   encontra;
// - as palavras que são MESMO iguais em português e inglês (Texto/Text não,
//   mas Pausa/Pause partilham raiz e algumas coincidem de todo).
//
// À parte, as CATEGORIAS do jogo clássico (Animal, Cidade, Fruta...) são
// conteúdo e vivem no data.js. Traduzi-las decide em que língua se RESPONDE,
// que é coisa do dono e não arrumação.
const IGUAIS_DE_PROPOSITO = [
  "Eu sei!", "Português", "English", "Español",
  "Harry Potter", "Mar", "Tema", "Texto", "Fluorescente", "Círculo", "Mover",
  "Letra:", "pts", "Cancelar", "Continuar", "Guardar", "Fino", "Liso",
];

// Corre a mesma varredura em português e em inglês, e compara. É por aqui
// que se apanha o que NÃO está no HTML: uma frase construída em JavaScript
// não tem data-i18n nenhum, e marcá-la à mão era pedir para alguém marcar o
// que se esqueceu de traduzir — foi exatamente o que me aconteceu com os
// nomes das ferramentas do quadro. Se o texto sai igual nas duas línguas e
// não está na lista de cima, não passou pelo t().
async function varrer(lingua) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((l) => { localStorage.setItem("euSei_lingua", l); }, lingua);
  await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
  const out = await page.evaluate(() => {
    // AS SOBREPOSIÇÕES TAMBÉM. Vivem FORA dos [data-screen] e nascem
    // "hidden", por isso um varrimento de ecrãs não lhes toca — foi o que o
    // a11y-varrimento aprendeu à sua custa, e eu repeti o erro: o "zero" das
    // traduções era zero em 41 ecrãs e nenhuma das dezasseis sobreposições.
    // Abre-se uma de cada vez, mede-se, e fecha-se outra vez.
    const proprio = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
    const res = {};
    document.querySelectorAll(".pause-overlay, .minigame-end-overlay").forEach((ov) => {
      const escondida = ov.classList.contains("hidden");
      ov.classList.remove("hidden");
      const lista = [];
      ov.querySelectorAll("*").forEach((el) => {
        if (el.offsetParent === null) return;
        lista.push(proprio(el).replace(/\s+/g, " "));
      });
      if (escondida) ov.classList.add("hidden");
      res[`sobreposição:${ov.id || "(sem id)"}`] = lista;
    });
    document.querySelectorAll("[data-screen]").forEach((sec) => {
      const antes = sec.classList.contains("active");
      sec.classList.add("active");
      const lista = [];
      sec.querySelectorAll("*").forEach((el) => {
        if (el.offsetParent === null) return;
        if (el.closest("#cfg-cat-grid")) return;
        // Os pedaços dentro de uma frase com marcação (as teclas Ctrl+Z, B,
        // E do atalho do quadro) são nomes de teclas, iguais em toda a
        // parte; quem conta é a frase à volta, que é a que leva o atributo.
        if (el.parentElement?.closest("[data-i18n-html]")) return;
        lista.push(proprio(el).replace(/\s+/g, " "));
      });
      if (!antes) sec.classList.remove("active");
      res[sec.dataset.screen] = lista;
    });
    return res;
  });
  const categorias = await page.evaluate(() =>
    [...document.querySelectorAll("#cfg-cat-grid label")].map((l) => l.textContent.trim()).length);
  await ctx.close();
  return { out, categorias };
}

const pt = await varrer("pt");
const en = await varrer("en");

const temLetra = (x) => /\p{L}/u.test(x);
const medida = (x) => /^[\d.,]+\s*(px|%|s|pts|kb|mb)$/i.test(x);
const nus = {};
for (const [ecra, lista] of Object.entries(pt.out)) {
  const outra = en.out[ecra] || [];
  // As duas varreduras percorrem a MESMA árvore: só o texto muda, por isso a
  // posição chega para emparelhar. Se um dia deixarem de ter o mesmo
  // tamanho, é porque a língua mudou a estrutura — e isso é para saber.
  if (lista.length !== outra.length) {
    erros.push(`${ecra}: a árvore muda de tamanho com a língua (${lista.length} vs ${outra.length})`);
    console.error(`FALHOU: ${ecra}: a árvore muda de tamanho com a língua`);
    continue;
  }
  nus[ecra] = lista.filter((txt, i) => txt && temLetra(txt) && !medida(txt)
    && txt === outra[i] && !IGUAIS_DE_PROPOSITO.includes(txt)).map((x) => x.slice(0, 50));
}

for (const ecra of ["home", "solo-menu", "lobby"]) {
  const restam = nus[ecra] || [];
  check(`${ecra}: nada por traduzir`, restam.length === 0, restam.join(" | "));
}
check("o mapa das categorias do clássico está lá (são conteúdo, não chrome)", pt.categorias >= 30, `${pt.categorias}`);

// ---- 2. E EM ECRÃ NENHUM ----
// Zero. Eram 285 antes disto, e o que aparecer aqui a partir de agora é
// texto novo que alguém escreveu sem tradução — que é o que este número
// existe para apanhar.
const TECTO = 0;
const total = Object.values(nus).reduce((s, v) => s + v.length, 0);
const piores = Object.entries(nus).filter(([, v]) => v.length).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
for (const [e, v] of piores) console.error(`  ${e}: ${v.join(" | ")}`);
console.log(`Por traduzir: ${total} textos.`);
check(`nada por traduzir em ecrã nenhum (${total} <= ${TECTO})`, total <= TECTO);

const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

// ---- 3. TROCAR DE LÍNGUA REPINTA MESMO O ECRÃ ----
// A tabela pode estar certa e o ecrã continuar em português: basta o
// aoMudarLingua não chegar ao elemento. Lê-se o botão de criar sala nas três.
// Trocar de língua deixou de ser instantâneo: só a tabela escolhida viaja no
// primeiro carregamento, por isso a segunda tem de ser ida buscar. O ecrã só
// muda quando ela chega — espera-se por isso, em vez de ler a meio e apanhar
// metade de cada língua (foi o que este passo apanhou quando a tabela se
// partiu em três, e é o que uma pessoa vê durante um instante).
const ESPERADO = { pt: "Criar sala", en: "Create room", es: "Crear sala" };
const lido = {};
for (const lingua of ["pt", "en", "es"]) {
  await page.selectOption("#lingua-select", lingua);
  await page.waitForFunction(
    (esperado) => document.getElementById("create-room-btn").textContent.trim() === esperado,
    ESPERADO[lingua],
    { timeout: 5000 },
  ).catch(() => {});
  lido[lingua] = {
    criar: (await page.textContent("#create-room-btn")).trim(),
    nome: await page.getAttribute("#name-input", "placeholder"),
    aria: await page.getAttribute("#name-input", "aria-label"),
  };
}
check("criar sala muda nas três línguas",
  lido.pt.criar === "Criar sala" && lido.en.criar === "Create room" && lido.es.criar === "Crear sala",
  JSON.stringify(lido));
check("o campo do nome muda de placeholder e de nome acessível",
  lido.en.nome === "Your name" && lido.en.aria === "Your name" && lido.es.nome === "Tu nombre",
  JSON.stringify(lido));

// ---- 4. O DESAFIO DO DIA TAMBÉM ----
// A frase leva pontos e dias seguidos lá dentro, por isso não é o data-i18n
// que a repõe: é o aoMudarLingua no app.js. Sem ele ficava em português no
// meio de um ecrã inglês.
await page.selectOption("#lingua-select", "en");
const desafioEn = (await page.textContent("#home-desafio-estado")).trim();
await page.selectOption("#lingua-select", "es");
const desafioEs = (await page.textContent("#home-desafio-estado")).trim();
check("a frase do desafio do dia é repintada ao trocar de língua",
  desafioEn.startsWith("One round") && desafioEs.startsWith("Una ronda"),
  `en=${desafioEn} es=${desafioEs}`);

// ---- 5. E NO TELEMÓVEL, NAS TRÊS ----
// Uma frase inglesa é quase sempre mais comprida do que a portuguesa, e este
// jogo joga-se todo em telemóveis. Ninguém tinha visto esta app em inglês a
// 390px.
//
// A verificação NÃO julga se um elemento pode transbordar: várias barras
// rolam de lado de propósito, e um varrimento que as apanhasse a todas
// dizia onze problemas em português, onde não há problema nenhum. O que se
// pergunta é se as línguas DISCORDAM — se o inglês ou o espanhol transborda
// onde o português não transborda, foi a tradução que o partiu.
//
// E à parte disso, uma regra absoluta que vale para as três: o CORPO da
// página nunca rola de lado. Uma barra que rola é uma escolha; a página a
// rolar é um defeito.
async function medirTelemovel(lingua) {
  const c = await browser.newContext({ ...devices["iPhone 13"] });
  const p = await c.newPage();
  await p.addInitScript((l) => { localStorage.setItem("euSei_lingua", l); }, lingua);
  await p.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const transbordam = [];
    const alturas = {};
    const rolam = [];
    // UM ecrã de cada vez. A primeira versão disto só acrescentava "active"
    // sem tirar o do ecrã que já estava visível, e media dois ecrãs
    // empilhados — larguras que nenhuma pessoa vê.
    const jaAtivos = [...document.querySelectorAll("[data-screen].active")];
    jaAtivos.forEach((x) => x.classList.remove("active"));
    document.querySelectorAll("[data-screen]").forEach((sec) => {
      sec.classList.add("active");
      if (document.documentElement.scrollWidth > window.innerWidth + 1) rolam.push(sec.dataset.screen);
      [...sec.querySelectorAll("button, label, summary, h1, h2, h3, .divider, option")].forEach((el, i) => {
        if (el.offsetParent === null) return;
        const caixa = el.getBoundingClientRect();
        const cortado = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible";
        // A identidade não pode ser o TEXTO: muda com a língua, que é o que
        // se está a comparar. É o sítio na árvore.
        const quem = `${sec.dataset.screen}|${el.tagName}|${el.id || i}`;
        // A ALTURA é o que interessa medir, e não a largura. Um rótulo
        // inglês mais comprido não sai da caixa: passa a duas linhas, e a
        // caixa cresce. Foi assim que a primeira versão disto me passou uma
        // falsificação — pus um "Create a brand new room for absolutely
        // everybody to join right now" no botão e ela ficou verde, porque
        // nada tinha transbordado de lado.
        alturas[quem] = Math.round(caixa.height);
        if (cortado) transbordam.push(quem);
      });
      sec.classList.remove("active");
    });
    jaAtivos.forEach((x) => x.classList.add("active"));
    return { transbordam, alturas, rolam };
  });
  await c.close();
  return r;
}
const tel = { pt: await medirTelemovel("pt"), en: await medirTelemovel("en"), es: await medirTelemovel("es") };
for (const l of ["pt", "en", "es"]) {
  check(`${l}: nenhum ecrã põe a página a rolar de lado no telemóvel`, tel[l].rolam.length === 0, tel[l].rolam.join(", "));
}
const basePt = new Set(tel.pt.transbordam);
for (const l of ["en", "es"]) {
  const novos = tel[l].transbordam.filter((x) => !basePt.has(x));
  check(`${l}: a tradução não corta texto onde o português não corta`, novos.length === 0, novos.join(", "));
  // Crescer um bocado é normal (uma palavra mais longa numa linha só). O que
  // não pode é um controlo DOBRAR de altura por causa da tradução: isso é uma
  // linha nova, e uma linha nova num telemóvel empurra o que está por baixo.
  const cresceram = Object.entries(tel[l].alturas)
    .filter(([quem, alt]) => {
      const base = tel.pt.alturas[quem];
      return base > 0 && alt > base * 1.6 && alt - base > 16;
    })
    .map(([quem, alt]) => `${quem} ${tel.pt.alturas[quem]}px -> ${alt}px`);
  check(`${l}: a tradução não faz nenhum controlo crescer para outra linha`, cresceram.length === 0, cresceram.join(" | "));
}

await browser.close();
if (erros.length) { console.error(`\n${erros.length} verificações falharam.`); process.exit(1); }
console.log("\nTodos os testes passaram.");
