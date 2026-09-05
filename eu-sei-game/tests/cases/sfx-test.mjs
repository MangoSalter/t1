// Sons: o que interessa verificar nao e "ouve-se bem" (isso e gosto), mas que
// o interruptor manda mesmo, que a preferencia sobrevive, e que nenhum som
// tem duracao ou volume capazes de irritar.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

console.log("1) Sem ficheiros de audio: os sons sao sintetizados...");
const audioRequests = [];
page.on("request", (r) => { if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(r.url())) audioRequests.push(r.url()); });
const names = await page.evaluate(async () => (await import("./js/sfx.js")).SFX_NAMES);
console.log(`   sons definidos: ${names.join(", ")}`);
if (names.length < 5) { console.log("   FALHOU: esperava um conjunto de sons"); process.exitCode = 1; }

console.log("2) Nenhum som e longo ou alto de mais (regra: <= 0.35s por nota, volume baixo)...");
// Instrumenta o AudioContext para registar o que cada som realmente cria.
const played = await page.evaluate(async (names) => {
  const notes = [];
  const RealCtx = window.AudioContext || window.webkitAudioContext;
  class SpyCtx extends RealCtx {
    createOscillator() {
      const osc = super.createOscillator();
      const start = osc.start.bind(osc);
      const stop = osc.stop.bind(osc);
      const rec = { start: 0, stop: 0, gain: 0 };
      notes.push(rec);
      osc.start = (t) => { rec.start = t; return start(t); };
      osc.stop = (t) => { rec.stop = t; return stop(t); };
      return osc;
    }
    createGain() {
      const g = super.createGain();
      const ramp = g.gain.exponentialRampToValueAtTime.bind(g.gain);
      g.gain.exponentialRampToValueAtTime = (v, t) => {
        const last = notes[notes.length - 1];
        if (last && v > last.gain) last.gain = v;
        return ramp(v, t);
      };
      return g;
    }
  }
  window.AudioContext = SpyCtx;
  const m = await import("./js/sfx.js");
  names.forEach((n) => m.sfx(n));
  await new Promise((r) => setTimeout(r, 200));
  return notes.map((n) => ({ dur: n.stop - n.start, gain: n.gain }));
}, names);
const longest = Math.max(...played.map((n) => n.dur));
const loudest = Math.max(...played.map((n) => n.gain));
console.log(`   ${played.length} notas tocadas; mais longa: ${longest.toFixed(2)}s; volume maximo: ${loudest.toFixed(3)}`);
if (played.length === 0) { console.log("   FALHOU: nenhum som chegou a tocar"); process.exitCode = 1; }
if (longest > 0.35) { console.log(`   FALHOU: ha uma nota de ${longest.toFixed(2)}s — longo de mais`); process.exitCode = 1; }
if (loudest > 0.12) { console.log(`   FALHOU: volume ${loudest} alto de mais para um som de interface`); process.exitCode = 1; }

console.log("3) O interruptor desliga MESMO (nao toca nada com os sons off)...");
const whenOff = await page.evaluate(async (names) => {
  let created = 0;
  const RealCtx = window.AudioContext || window.webkitAudioContext;
  class CountCtx extends RealCtx {
    createOscillator() { created++; return super.createOscillator(); }
  }
  window.AudioContext = CountCtx;
  const m = await import("./js/sfx.js");
  m.setSfxEnabled(false);
  names.forEach((n) => m.sfx(n));
  await new Promise((r) => setTimeout(r, 150));
  return { created, enabled: m.sfxEnabled() };
}, names);
console.log(`   osciladores criados com os sons desligados: ${whenOff.created} (esperado 0)`);
if (whenOff.created !== 0 || whenOff.enabled) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("4) A preferencia fica guardada e a caixa aparece desmarcada...");
const stored = await page.evaluate(() => localStorage.getItem("euSei_sfx"));
console.log(`   guardado: ${stored} (esperado off)`);
if (stored !== "off") { console.log("   FALHOU"); process.exitCode = 1; }
await page.reload({ waitUntil: "networkidle" });
await page.click("#solo-menu-btn");
const checked = await page.locator("#solo-sfx-toggle").isChecked();
console.log(`   caixa marcada depois de recarregar: ${checked} (esperado false)`);
if (checked) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("5) Voltar a ligar pelo interruptor repoe o som...");
await page.click("#solo-sfx-toggle");
const backOn = await page.evaluate(async () => (await import("./js/sfx.js")).sfxEnabled());
console.log(`   sons ligados: ${backOn} (esperado true)`);
if (!backOn) { console.log("   FALHOU"); process.exitCode = 1; }

console.log("6) Nenhum pedido de ficheiro de audio foi feito (sons sao sintetizados)...");
console.log(`   pedidos de audio: ${audioRequests.length} (esperado 0)`);
if (audioRequests.length > 0) { console.log("   FALHOU"); process.exitCode = 1; }

await browser.close();
const real = errors.filter((e) => !/gstatic|googleapis|TUNNEL|Fingerprinting|CONNECTION_RESET/.test(e));
console.log(real.length === 0 ? "\nSem erros de consola relevantes." : "\nERROS:\n" + real.join("\n"));
if (real.length > 0) process.exitCode = 1;
console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: OK");
