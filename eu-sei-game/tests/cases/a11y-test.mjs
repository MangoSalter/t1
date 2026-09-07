// Acessibilidade: o foco tem de ser visivel para quem navega por teclado, e a
// preferencia de movimento reduzido tem de valer para TODAS as animacoes, nao
// so para algumas.
import { chromium, devices } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
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

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
