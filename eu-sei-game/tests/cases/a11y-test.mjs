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

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
