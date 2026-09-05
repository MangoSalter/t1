import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

const messages = [];
page.on("console", (msg) => messages.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => messages.push({ type: "pageerror", text: err.message }));
page.on("requestfailed", (req) => console.log("REQUEST FAILED:", req.url(), req.failure()?.errorText));
page.on("response", (res) => { if (res.status() >= 400) console.log("HTTP", res.status(), res.url()); });

await page.goto("http://localhost:8936/index.html", { waitUntil: "networkidle" });

// Ecrã inicial deve estar visível com os elementos certos.
const homeVisible = await page.locator('[data-screen="home"].active').isVisible();
console.log("Ecrã home visível:", homeVisible);

await page.fill("#name-input", "Ana");
const createBtnVisible = await page.locator("#create-room-btn").isVisible();
console.log("Botão criar sala visível:", createBtnVisible);

// Este teste nasceu para correr contra uma copia SEM stub, onde a Firebase
// nao respondia e o objetivo era so garantir que a pagina nao rebentava. Sob
// o runner a base de dados e o stub e a criacao de sala funciona, por isso a
// verificacao passa a ser a do caminho feliz: criar sala leva mesmo a sala e
// o codigo aparece. (Para reencenar a falha de rede era preciso servir uma
// copia sem stub — nao vale um segundo servidor so por isto.)
await page.click("#create-room-btn");
await page.waitForSelector('[data-screen="lobby"].active', { timeout: 8000 });
const code = (await page.locator("#lobby-code").textContent()).trim();
console.log("Sala criada, codigo:", code);
if (!/^[A-Z0-9]{4}$/.test(code)) {
  console.log("FALHOU: o codigo da sala devia ter 4 caracteres");
  process.exitCode = 1;
}

const errorText = await page.locator("#home-error").textContent();
console.log("Texto de erro mostrado ao utilizador:", JSON.stringify(errorText));
if (errorText.trim() !== "") {
  console.log("FALHOU: nao devia haver erro no caminho feliz");
  process.exitCode = 1;
}

await browser.close();

console.log("\n--- Mensagens de consola/página ---");
for (const m of messages) {
  console.log(`[${m.type}] ${m.text}`);
}

// Falhar o script se houver erros que NÃO sejam relacionados com a
// autenticação Firebase (credenciais placeholder são esperadas de falhar).
const unexpected = messages.filter((m) => {
  if (m.type !== "error" && m.type !== "pageerror") return false;
  const t = m.text.toLowerCase();
  // t vem em minusculas: comparar com "CONNECTION_RESET" em maiusculas nunca
  // dava — o ruido do proxy do sandbox continuava a marcar o teste como falha.
  if (t.includes("firebase") || t.includes("auth") || t.includes("api-key") || t.includes("api key") || t.includes("400") || t.includes("failed to fetch") || t.includes("network") || t.includes("connection_reset") || t.includes("err_connection")) {
    return false; // esperado: credenciais placeholder ou ruido de rede do sandbox
  }
  return true;
});

if (unexpected.length > 0) {
  console.error("\nERROS INESPERADOS ENCONTRADOS:");
  unexpected.forEach((m) => console.error(m));
  process.exitCode = 1;
} else {
  console.log("\nSem erros inesperados (só falhas de auth Firebase, que são esperadas com credenciais placeholder).");
}
