import { chromium } from "playwright";
import { backToLetterpick } from "./test-helpers.mjs";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

const ALL_MG = ["solo-minigame", "solo-minigame-word", "solo-minigame-bug", "solo-minigame-monkey", "solo-minigame-memory"];

async function playRoundToMinigame() {
  await page.waitForSelector('[data-screen="solo-letterpick"].active', { timeout: 3000 });
  const letter = await page.locator("#solo-letter-buttons .letter-btn .letter-big").first().textContent();
  await page.locator("#solo-letter-buttons .letter-btn").first().click();
  await page.waitForSelector('[data-screen="solo-round"].active', { timeout: 3000 });
  const inputs = await page.locator("#solo-cat-list .cat-item input").all();
  for (let i = 0; i < inputs.length; i++) await inputs[i].fill(`${letter}palavra${i}`);
  await page.click("#solo-finish-btn");
  await page.waitForSelector('[data-screen="solo-result"].active', { timeout: 3000 });
  await page.click("#solo-continue-btn");
  await page.waitForFunction(
    (ids) => ids.some((id) => {
      const el = document.querySelector(`[data-screen="${id}"]`);
      return el && el.classList.contains("active");
    }),
    ALL_MG,
    { timeout: 3000 }
  );
}

async function currentMinigame() {
  for (const id of ALL_MG) {
    const active = await page.locator(`[data-screen="${id}"].active`).count();
    if (active > 0) return id;
  }
  return null;
}

async function skipNonMemory(which) {
  if (which === "solo-minigame") {
    // O Olho de Lince deixou de ter a bola #solo-mg-circle; o caminho
    // partilhado trata de sair de qualquer mini-jogo.
  } else if (which === "solo-minigame-word") {
    await page.waitForTimeout(50);
  } else if (which === "solo-minigame-bug") {
    await page.waitForTimeout(50);
  } else if (which === "solo-minigame-monkey") {
    await page.waitForTimeout(50);
  }
  await backToLetterpick(page);
}

await page.click("#solo-menu-btn"); await page.click("#solo-classic-btn"); await page.click("#solo-setup-start-btn");

let found = false;
for (let attempt = 0; attempt < 20 && !found; attempt++) {
  await playRoundToMinigame();
  const which = await currentMinigame();
  console.log(`Tentativa ${attempt + 1}: calhou ${which}`);
  if (which === "solo-minigame-memory") {
    found = true;
  } else {
    await skipNonMemory(which);
  }
}

if (!found) {
  console.log("AVISO: não calhou Memória em 20 tentativas.");
  process.exitCode = 1;
} else {
  console.log("Fase de memorização: a ler as categorias mostradas...");
  const shownCards = await page.locator("#mem-grid .mem-card.shown-preview").allTextContents();
  console.log(`   Categorias mostradas: ${shownCards.join(", ")}`);
  // A Memória calha numa ronda qualquer da run, e o número de cartas sobe com
  // a ronda (base 5, +1 a cada 3 rondas, teto 8). Fixar 5 fazia o teste
  // falhar consoante a sorte de quando o mini-jogo calhava.
  if (shownCards.length < 5 || shownCards.length > 8) {
    console.log(`   FALHOU: ${shownCards.length} cartas fora do intervalo esperado (5 a 8)`);
    process.exitCode = 1;
  }

  console.log("A aguardar fase de seleção...");
  await page.waitForSelector("#mem-confirm-btn:not(.hidden)", { timeout: 5000 });
  const allCards = await page.locator("#mem-grid .mem-card").allTextContents();
  console.log(`   ${allCards.length} categorias na grelha de escolha (esperado ${shownCards.length + 5})`);
  if (allCards.length !== shownCards.length + 5) {
    console.log(`   FALHOU: grelha devia ter mostradas + 5 distratoras`);
    process.exitCode = 1;
  }

  console.log("A selecionar exatamente as categorias corretas...");
  for (const text of shownCards) {
    await page.locator("#mem-grid .mem-card", { hasText: text }).first().click();
  }
  const selectedCount = await page.locator("#mem-grid .mem-card.selected").count();
  console.log(`   ${selectedCount} cartas selecionadas (esperado ${shownCards.length})`);
  if (selectedCount !== shownCards.length) {
    console.log("   FALHOU: devia ter selecionado exatamente as mostradas");
    process.exitCode = 1;
  }

  await page.click("#mem-confirm-btn");
  // O resultado deixou de ser escrito no #mem-status (que hoje só é limpo) e
  // passou para o ecrã de fim partilhado por todos os mini-jogos.
  await page.waitForSelector("#minigame-end-overlay:not(.hidden)", { timeout: 10000 });
  const status = await page.locator("#mge-points").textContent();
  const expectedPts = shownCards.length * 4;
  console.log(`   OK: ${status} (esperado ${shownCards.length} certas, 0 erradas, +${expectedPts} pts)`);
  if (!status.includes(`${shownCards.length} certa`) || !status.includes("0 errada") || !status.includes(`+${expectedPts} pts`)) {
    console.log("   FALHOU: pontuação não bate certo com todas corretas");
    process.exitCode = 1;
  }

  await backToLetterpick(page);
  console.log("   OK: avançou para a ronda seguinte");
}

await browser.close();

console.log("\n--- Erros ---");
// CONNECTION_RESET vem do proxy do sandbox a cortar pedidos externos
// (fontes Google), não do jogo — os outros testes já o ignoravam.
const realErrors = errors.filter((e) => !e.includes("gstatic") && !e.includes("googleapis") && !e.includes("TUNNEL") && !e.includes("Fingerprinting") && !e.includes("CONNECTION_RESET"));
errors.forEach((e) => console.log("(ignorado/esperado ou real):", e));
if (realErrors.length > 0) process.exitCode = 1;
console.log(realErrors.length === 0 ? "\nSem erros reais." : "\nHÁ ERROS REAIS.");
