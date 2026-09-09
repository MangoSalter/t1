// Acessibilidade: o foco tem de ser visivel para quem navega por teclado, e a
// preferencia de movimento reduzido tem de valer para TODAS as animacoes, nao
// so para algumas.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.EU_SEI_CHROMIUM || undefined });
const errors = [];

console.log("1) Navegar por teclado mostra onde esta o foco...");
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:8936/index.html?oficina=1", { waitUntil: "networkidle" });
await page.keyboard.press("Tab");
const focus = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    outlineWidth: parseFloat(cs.outlineWidth) || 0,
    outlineStyle: cs.outlineStyle,
  };
});
console.log(`   elemento focado: ${focus?.tag}, contorno: ${focus?.outlineWidth}px ${focus?.outlineStyle}`);
if (!focus) { console.log("   FALHOU: Tab não focou nada"); process.exitCode = 1; }
else if (focus.outlineWidth < 2 || focus.outlineStyle === "none") {
  console.log("   FALHOU: sem contorno de foco visível — quem navega por teclado fica às cegas");
  process.exitCode = 1;
}

console.log("2) Os botões dos mini-jogos também mostram foco...");
await page.click("#solo-menu-btn");
const btnFocus = await page.evaluate(() => {
  const btn = document.getElementById("solo-play-pac-btn");
  btn.focus();
  const cs = getComputedStyle(btn);
  return { w: parseFloat(cs.outlineWidth) || 0, style: cs.outlineStyle };
});
console.log(`   contorno no botão do Kota Corre: ${btnFocus.w}px ${btnFocus.style}`);
// focus() programatico nem sempre conta como :focus-visible; o que interessa
// e que a regra exista para o seletor.
const ruleExists = await page.evaluate(() => {
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.selectorText && r.selectorText.includes("button:focus-visible")) return true;
    }
  }
  return false;
});
console.log(`   regra button:focus-visible definida: ${ruleExists}`);
if (!ruleExists) { console.log("   FALHOU"); process.exitCode = 1; }
await page.close();

console.log("3) Com movimento reduzido, NENHUMA animação continua a correr...");
const ctx = await browser.newContext({ reducedMotion: "reduce" });
const p2 = await ctx.newPage();
p2.on("pageerror", (e) => errors.push(e.message));
await p2.goto("http://localhost:8936/index.html?oficina=1", { waitUntil: "networkidle" });
const moving = await p2.evaluate(() => {
  const bad = [];
  document.querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    const dur = parseFloat(cs.animationDuration) || 0;
    if (cs.animationName !== "none" && dur > 0.01) {
      bad.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40));
    }
  });
  return bad;
});
console.log(`   elementos ainda animados: ${moving.length} ${moving.slice(0, 3).join(", ")}`);
if (moving.length > 0) {
  console.log("   FALHOU: a preferência do sistema está a ser ignorada");
  process.exitCode = 1;
}

console.log("4) A mascote e o cartão ficam mesmo parados (sem inclinação)...");
const stopped = await p2.evaluate(() => {
  const card = document.querySelector(".screen.active .card");
  const cs = getComputedStyle(card);
  return { anim: cs.animationName, transform: cs.transform };
});
console.log(`   cartão: animação=${stopped.anim}, transform=${stopped.transform}`);
if (stopped.anim !== "none" || (stopped.transform !== "none" && stopped.transform !== "matrix(1, 0, 0, 1, 0, 0)")) {
  console.log("   FALHOU: o cartão devia ficar direito e parado");
  process.exitCode = 1;
}

console.log("5) Sem a preferência ligada, as animações continuam a existir (não se removeu tudo para sempre)...");
const ctx2 = await browser.newContext();
const p3 = await ctx2.newPage();
await p3.goto("http://localhost:8936/index.html?oficina=1", { waitUntil: "networkidle" });
const animatedNormally = await p3.evaluate(() => {
  const el = document.querySelector(".mascot");
  return getComputedStyle(el).animationName;
});
console.log(`   animação da mascote em modo normal: ${animatedNormally} (esperado wobble)`);
if (animatedNormally === "none") { console.log("   FALHOU: as animações desapareceram para todos"); process.exitCode = 1; }

console.log("6) Contraste do texto cumpre a WCAG AA (4.5:1) — este jogo joga-se na rua...");
const contrast = await p3.evaluate(() => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number).map((c) => c / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const toRgb = (hex) => {
    const d = document.createElement("div");
    d.style.color = hex; document.body.appendChild(d);
    const out = getComputedStyle(d).color; d.remove(); return out;
  };
  return {
    dica: ratio(toRgb(v("--muted")), toRgb(v("--card-bg"))),
    botao: ratio(toRgb(v("--paper")), toRgb(v("--primary"))),
    acerto: ratio(toRgb(v("--paper")), toRgb(v("--success"))),
  };
});
Object.entries(contrast).forEach(([k, r]) => {
  console.log(`   ${k}: ${r.toFixed(2)}:1 ${r >= 4.5 ? "ok" : "FALHA (mínimo 4.5)"}`);
  if (r < 4.5) process.exitCode = 1;
});

console.log("7) Alvos de toque no telemovel: minimo 44px de altura...");
const mob = await browser.newContext({ ...devices["iPhone 13"] });
const pm = await mob.newPage();
await pm.goto("http://localhost:8936/index.html?oficina=1", { waitUntil: "networkidle" });
await pm.click("#solo-menu-btn");
await pm.click("#solo-marathon-menu-btn");
await pm.waitForSelector('[data-screen="solo-marathon-setup"].active', { timeout: 5000 });
const tiny = await pm.evaluate(() => {
  const bad = [];
  // O <label> e que recebe o toque, nao a caixa de 18px la dentro.
  document.querySelectorAll(".screen.active label, .screen.active button").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    if (r.height < 40) bad.push(`${el.textContent.trim().slice(0, 22)} (${Math.round(r.height)}px)`);
  });
  return bad;
});
console.log(`   alvos abaixo de 40px: ${tiny.length} ${tiny.slice(0, 4).join(", ")}`);
if (tiny.length > 0) {
  console.log("   FALHOU: alvos pequenos demais para dedos — erra-se a categoria ao lado");
  process.exitCode = 1;
}

// E NO JOGO CLÁSSICO, QUE É ONDE MAIS SE TOCA.
//
// O passo de cima já existia, mas visitava um ecrã só — o da maratona. A
// votação, que é a fase em que toda a gente toca mais vezes no telemóvel
// (vota-se em todas as respostas de toda a gente, depressa, e um toque ao lado
// muda a pontuação de outra pessoa), nunca foi medida. Tinha os botões a 36px.
console.log("7b) E na votação do jogo clássico, que é onde mais se toca...");
await pm.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await pm.fill("#name-input", "Ana");
await pm.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await pm.click("#create-room-btn");
await pm.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const codigoA11y = (await pm.locator("#lobby-code").textContent()).trim();
await pm.evaluate((c) => window.__testDb.update(`rooms/${c}/players`, {
  p2: { name: "Beto", score: 0, connected: true },
  p3: { name: "Carla", score: 0, connected: true },
}), codigoA11y);
await pm.waitForTimeout(300);
await pm.evaluate((c) => {
  const r = window.__testDb.get(`rooms/${c}`);
  window.__testDb.update(`rooms/${c}`, {
    state: "voting", round: 1, voting: { endAt: Date.now() + 60000 },
    categoriesRound: { letter: "M", categoryIndexes: [0, 1, 2, 3], endAt: Date.now() + 90000 },
    answers: {
      [r.hostId]: { c0: "Maria", c1: "Marrocos" },
      p2: { c0: "Miguel", c1: "México" },
      p3: { c0: "Mara", c1: "Malta" },
    },
  });
}, codigoA11y);
await pm.waitForTimeout(800);
const naVotacao = await pm.evaluate(() => {
  const scr = document.querySelector(".screen.active");
  const maus = [];
  scr.querySelectorAll("button").forEach((el) => {
    if (el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 44) maus.push(`${el.textContent.trim().slice(0, 18)} (${Math.round(r.height)}px)`);
  });
  return { ecra: scr.dataset.screen, maus, botoes: scr.querySelectorAll("button").length };
});
console.log(`   ecrã ${naVotacao.ecra}: ${naVotacao.botoes} botões, abaixo de 44px: ${naVotacao.maus.length} ${naVotacao.maus.slice(0, 3).join(", ")}`);
if (naVotacao.ecra !== "voting") {
  console.log("   FALHOU: não cheguei ao ecrã da votação — a medição não diz nada");
  process.exitCode = 1;
}
if (naVotacao.maus.length > 0) {
  console.log("   FALHOU: botões de votar pequenos demais — um toque ao lado muda a pontuação de outra pessoa");
  process.exitCode = 1;
}

console.log("8) As sobreposições novas: alvos que se dão com o dedo e teclado que chega lá...");
// Os ecrãs novos (paleta, painel de fim, opções do mapa) não passavam por
// aqui, e o primeiro que se mediu estava partido: os 68 quadrados da paleta
// tinham DOIS PÍXEIS de lado num telemóvel. A grelha estica os filhos por
// omissão, a altura passa a ser a da linha — que sem conteúdo é zero — e o
// aspect-ratio deixa de valer. Uma paleta impossível de tocar.
const tel = await browser.newContext({ ...devices["iPhone 13"] });
const tp = await tel.newPage();
await tp.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await tp.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await tp.reload({ waitUntil: "networkidle" });
await tp.click("[data-open-board]");
await tp.waitForSelector('[data-screen="board"].active', { timeout: 8000 });
await tp.click("#board-paleta-btn");
await tp.waitForSelector("#paleta-overlay:not(.hidden)", { timeout: 5000 });
const paleta = await tp.evaluate(() => {
  const bs = [...document.querySelectorAll(".paleta-cor")];
  const lados = bs.map((b) => {
    const r = b.getBoundingClientRect();
    return Math.min(r.width, r.height);
  });
  return {
    quantos: bs.length,
    menor: Math.round(Math.min(...lados)),
    semEtiqueta: bs.filter((b) => !b.getAttribute("aria-label")).length,
    cabeNoEcra: document.querySelector(".paleta-card").getBoundingClientRect().height <= window.innerHeight,
  };
});
console.log(`   paleta: ${paleta.quantos} cores, o mais pequeno tem ${paleta.menor}px de lado, ${paleta.semEtiqueta} sem etiqueta`);
if (paleta.menor < 44) { console.log(`   FALHOU: um quadrado de ${paleta.menor}px não se toca com o dedo`); process.exitCode = 1; }
if (paleta.semEtiqueta > 0) { console.log("   FALHOU: todas as cores precisam de etiqueta para quem usa leitor de ecrã"); process.exitCode = 1; }
if (!paleta.cabeNoEcra) { console.log("   FALHOU: a paleta não cabe no ecrã do telemóvel"); process.exitCode = 1; }
await tel.close();

console.log("9) Escape fecha o que se abre, e o painel de fim recebe o foco...");
const kb = await browser.newPage();
await kb.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await kb.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await kb.reload({ waitUntil: "networkidle" });
await kb.click("[data-open-board]");
await kb.waitForSelector('[data-screen="board"].active', { timeout: 8000 });
await kb.click("#board-paleta-btn");
await kb.waitForSelector("#paleta-overlay:not(.hidden)", { timeout: 5000 });
await kb.keyboard.press("Escape");
await kb.waitForTimeout(200);
const fechouComEscape = await kb.evaluate(() => document.getElementById("paleta-overlay").classList.contains("hidden"));
console.log(`   Escape fecha a paleta: ${fechouComEscape}`);
if (!fechouComEscape) { console.log("   FALHOU: uma sobreposição que não fecha com Escape prende quem usa teclado"); process.exitCode = 1; }

// O painel de fim é um diálogo: o foco tem de entrar nele.
await kb.evaluate(() => document.querySelectorAll("[data-screen]").forEach((el) => el.classList.toggle("active", el.dataset.screen === "home")));
await kb.click('[data-screen="home"] [data-open-mapa]');
await kb.waitForSelector('[data-screen="mapa"].active', { timeout: 8000 });
await kb.waitForFunction(async () => (await import("./js/mapa.js")).mapa.paises.length > 0, { timeout: 10000 });
await kb.selectOption("#mapa-modo", "oceanos");
await kb.waitForTimeout(200);
for (const n of ["pacifico", "atlantico", "indico", "antartico", "artico"]) {
  await kb.fill("#mapa-input", n);
  await kb.click("#mapa-form button[type=submit]");
  await kb.waitForTimeout(80);
}
await kb.waitForSelector("#mapa-fim:not(.hidden)", { timeout: 5000 });
const foco = await kb.evaluate(() => ({
  focado: document.activeElement?.id || "",
  role: document.getElementById("mapa-fim").getAttribute("role"),
}));
console.log(`   painel de fim: role=${foco.role}, foco em "${foco.focado}"`);
if (!foco.focado.startsWith("mapa-fim")) {
  console.log("   FALHOU: o foco devia entrar no painel — senão escreve-se num jogo que já acabou");
  process.exitCode = 1;
}

console.log("10) E na barra do quadro da Forca, que é a barra que mais se toca...");
// Os passos de cima medem ecrãs do cartão da app. O quadro é outro mundo: é
// ecrã inteiro, com uma barra de ferramentas própria, e passou meses com as
// ferramentas a 40px enquanto as cores ao lado já estavam nos 44 — trocar de
// ferramenta é o gesto que mais se repete a desenhar, por isso é o alvo que
// mais se falha. Mede-se a barra inteira, não uma regra: assim a próxima
// ferramenta que se acrescentar também tem de caber no dedo.
const quadroCtx = await browser.newContext({ ...devices["iPhone 13"] });
const qp = await quadroCtx.newPage();
await qp.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await qp.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await qp.reload({ waitUntil: "networkidle" });
await qp.fill("#name-input", "Ana");
await qp.waitForFunction(() => !document.getElementById("create-room-btn").disabled, { timeout: 5000 });
await qp.click("#create-room-btn");
await qp.waitForSelector('[data-screen="lobby"].active', { timeout: 5000 });
const codigoQuadro = (await qp.locator("#lobby-code").textContent()).trim();
await qp.evaluate((c) => {
  window.__testDb.update(`rooms/${c}/players`, {
    p2: { name: "Beto", score: 0, connected: true },
    p3: { name: "Carla", score: 0, connected: true },
  });
  window.__testDb.update(`rooms/${c}/config`, { bonusGames: ["hangman"] });
}, codigoQuadro);
const rondasQuadro = await qp.evaluate((c) => window.__testDb.get(`rooms/${c}`).config.numRounds, codigoQuadro);
await qp.evaluate(({ c, n }) => window.__testDb.update(`rooms/${c}`, { round: n, state: "roundScore" }), { c: codigoQuadro, n: rondasQuadro });
await qp.waitForSelector('[data-screen="roundscore"].active', { timeout: 5000 });
await qp.click("#round-next-btn");
await qp.waitForSelector('[data-screen="hangman"].active', { timeout: 5000 });
const naForca = await qp.evaluate(() => {
  const scr = document.querySelector('[data-screen="hangman"]');
  const maus = [];
  let vistos = 0;
  scr.querySelectorAll("button, label").forEach((el) => {
    if (el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) return;
    vistos += 1;
    if (r.height < 44 || r.width < 44) {
      maus.push(`${(el.textContent || "").trim().slice(0, 14) || el.id} (${Math.round(r.height)}x${Math.round(r.width)})`);
    }
  });
  return { vistos, maus };
});
console.log(`   ${naForca.vistos} controlos visíveis, abaixo de 44px: ${naForca.maus.length} ${naForca.maus.slice(0, 4).join(", ")}`);
if (naForca.vistos < 15) {
  console.log("   FALHOU: cheguei ao quadro sem a barra toda — a medição não diz nada");
  process.exitCode = 1;
}
if (naForca.maus.length > 0) {
  console.log("   FALHOU: alvos pequenos demais na barra do quadro");
  process.exitCode = 1;
}
await quadroCtx.close();

console.log("11) E os ecrãs de ecrã inteiro que se abrem sem sala: quadro solo e mapa...");
// O passo 10 mede um ecrã. Este mede os outros dois que vivem fora do cartão
// da app, porque o erro que se repete aqui não é uma regra errada — é uma
// regra que só cobriu metade do que dizia cobrir. A barra do mapa dizia em
// comentário que os alvos ficavam "nos 44 px do costume" e punha só a altura:
// o botão do mundo, que é só o 🌍, media 38px de largura.
const cheiaCtx = await browser.newContext({ ...devices["iPhone 13"] });
const cp = await cheiaCtx.newPage();
await cp.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await cp.evaluate(() => localStorage.setItem("euSei_lingua", "pt"));
await cp.reload({ waitUntil: "networkidle" });
const medirEcra = () => cp.evaluate(() => {
  const maus = [];
  let vistos = 0;
  document.querySelectorAll("button, label, [role=button], select").forEach((el) => {
    if (el.offsetParent === null) return;
    const b = el.getBoundingClientRect();
    if (b.height === 0 || b.width === 0) return;
    vistos += 1;
    if (b.height < 44 || b.width < 44) {
      maus.push(`${(el.textContent || "").trim().slice(0, 12) || el.id} (${Math.round(b.height)}x${Math.round(b.width)})`);
    }
  });
  return { ecra: document.querySelector(".screen.active")?.dataset.screen, vistos, maus };
});
await cp.click("[data-open-board]");
await cp.waitForSelector('[data-screen="board"].active', { timeout: 8000 });
const noQuadro = await medirEcra();
console.log(`   quadro solo: ${noQuadro.vistos} controlos, abaixo de 44px: ${noQuadro.maus.length} ${noQuadro.maus.slice(0, 4).join(", ")}`);
await cp.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await cp.click('[data-screen="home"] [data-open-mapa]');
await cp.waitForSelector('[data-screen="mapa"].active', { timeout: 8000 });
await cp.waitForFunction(async () => (await import("./js/mapa.js")).mapa.paises.length > 0, { timeout: 15000 });
const noMapa = await medirEcra();
console.log(`   mapa: ${noMapa.vistos} controlos, abaixo de 44px: ${noMapa.maus.length} ${noMapa.maus.slice(0, 4).join(", ")}`);
for (const m of [noQuadro, noMapa]) {
  if (m.vistos < 5) {
    console.log(`   FALHOU: só ${m.vistos} controlos visíveis em "${m.ecra}" — não cheguei lá, a medição não diz nada`);
    process.exitCode = 1;
  }
  if (m.maus.length > 0) {
    console.log(`   FALHOU: alvos pequenos demais em "${m.ecra}"`);
    process.exitCode = 1;
  }
}
await cheiaCtx.close();

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
    raiz.querySelectorAll("button, label, [role=button], select").forEach((el) => {
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

console.log("12) E as sobreposições, que se abrem por cima de tudo e nunca foram medidas...");
// O passo 8 mede UMA sobreposição — a paleta. Há dezasseis, e as outras
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

console.log("13) E os 41 ecrãs, todos, sem navegar até nenhum...");
// Este varrimento existia como ferramenta de mão — abrir a página num
// telemóvel, ligar cada [data-screen] à vez e medir o que aparece — e foi
// assim que se apanhou a barra da Forca a 40px. Ficava por escrever no
// disco: da próxima vez que alguém acrescente um ecrã, ninguém volta a
// correr uma ferramenta que não está em lado nenhum. Agora corre sempre.
//
// Os passos 10 e 11 navegam até três ecrãs a sério e medem tudo o que lá
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

console.log("14) E o jogo clássico a sério, com os botões que só nascem a jogar...");
// O passo 13 chega aos 41 ecrãs mas só vê o que está escrito no index.html.
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

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
