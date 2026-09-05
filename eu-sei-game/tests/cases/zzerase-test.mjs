import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });
await page.click('[data-open-board]');
await page.waitForSelector('[data-screen="board"].active');
await page.evaluate(async () => {
  const m = await import("./js/board.js");
  window.__b = m.__board; window.__m = m;
  m.__board.strokes = []; m.setBoardBackground("chalk");
});
const box = await page.locator("#board-canvas").boundingBox();
async function drag(from, to) {
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + from[0] + (to[0]-from[0])*i/10, box.y + from[1] + (to[1]-from[1])*i/10);
  await page.mouse.up();
}
await page.click('[data-board-tool="pen"]');
await drag([300, 200], [600, 200]);
const px = (x, y) => page.evaluate(([x, y]) => {
  const c = document.getElementById("board-canvas");
  const d = c.getContext("2d").getImageData(Math.round(x * (window.devicePixelRatio||1)), Math.round(y * (window.devicePixelRatio||1)), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, [x, y]);
console.log("papel do quadro de giz (esperado ~40,53,44):", await px(100, 400));
await page.click('[data-board-tool="eraser"]');
await drag([300, 200], [600, 200]);
const erased = await px(450, 200);
console.log("onde a borracha passou:", erased);
const isHole = erased[3] < 250 || (erased[0] > 200 && erased[1] > 200 && erased[2] > 200);
console.log(isHole ? "=> BURACO: a borracha comeu o fundo" : "=> ok: o fundo ficou intacto");
await browser.close();
process.exitCode = 1;
