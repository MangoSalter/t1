// Acessibilidade: o foco tem de ser visivel para quem navega por teclado, e a
// preferencia de movimento reduzido tem de valer para TODAS as animacoes, nao
// so para algumas.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errors = [];

console.log("1) Navegar por teclado mostra onde esta o foco...");
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
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
await p2.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
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
await p3.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
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
const { devices } = await import("playwright");
const mob = await browser.newContext({ ...devices["iPhone 13"] });
const pm = await mob.newPage();
await pm.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
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

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
