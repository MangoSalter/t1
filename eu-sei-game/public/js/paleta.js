// A PALETA GRANDE, partilhada pelos dois quadros.
//
// Os quadros tinham dez cores. Dez chegam para escrever, não chegam para
// desenhar: quem quer um céu quer três azuis, e quem desenha uma cara quer
// tons de pele que ali não existem. O seletor de cor do sistema resolvia isso
// no papel — mas é uma janela do sistema operativo, diferente em cada
// máquina, e no telemóvel é um ecrã inteiro por cima do jogo.
//
// Isto é o meio-termo: uma grelha de cores à vista, escolhida com um toque,
// com o seletor do sistema à mão para quem quiser uma cor exata.
//
// As cores são geradas e não escritas à mão, para os tons serem regulares —
// doze famílias em cinco claridades — e para se poder mexer na densidade sem
// reescrever uma lista de setenta valores.

const FAMILIAS = [
  { nome: "Vermelho", h: 4 },
  { nome: "Laranja", h: 26 },
  { nome: "Âmbar", h: 44 },
  { nome: "Amarelo", h: 56 },
  { nome: "Lima", h: 80 },
  { nome: "Verde", h: 140 },
  { nome: "Turquesa", h: 172 },
  { nome: "Ciano", h: 192 },
  { nome: "Azul", h: 214 },
  { nome: "Índigo", h: 250 },
  { nome: "Roxo", h: 280 },
  { nome: "Rosa", h: 328 },
];
// Claridade e saturação de cada degrau. O mais claro serve para preencher sem
// tapar; o mais escuro serve para contornar.
const DEGRAUS = [
  { s: 62, l: 82 },
  { s: 68, l: 66 },
  { s: 66, l: 50 },
  { s: 62, l: 38 },
  { s: 58, l: 26 },
];

function hslParaHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const cor = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * cor).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Os cinzentos entram por fora das famílias: um cinzento com saturação zero
// não pertence a nenhuma delas, e são as cores que mais se usam a desenhar.
const NEUTROS = ["#ffffff", "#e8e3d8", "#c9c2b4", "#a49c8c", "#7b7364", "#544d41", "#3a3126", "#1c1813"];

export function coresDaPaleta() {
  const linhas = FAMILIAS.map((f) => ({
    nome: f.nome,
    cores: DEGRAUS.map((d) => hslParaHex(f.h, d.s, d.l)),
  }));
  linhas.push({ nome: "Neutros", cores: NEUTROS });
  return linhas;
}

const els = {
  overlay: document.getElementById("paleta-overlay"),
  grelha: document.getElementById("paleta-grelha"),
  exata: document.getElementById("paleta-exata"),
  fecharBtn: document.getElementById("paleta-fechar-btn"),
};

let aoEscolher = null;

function fechar() {
  els.overlay?.classList.add("hidden");
  aoEscolher = null;
}

// Abre a paleta. `atual` fica marcada, e `callback` recebe a cor escolhida.
export function abrirPaleta(atual, callback) {
  if (!els.overlay) return;
  aoEscolher = callback;
  els.grelha.innerHTML = "";
  coresDaPaleta().forEach((linha) => {
    const div = document.createElement("div");
    div.className = "paleta-linha";
    div.setAttribute("aria-label", linha.nome);
    linha.cores.forEach((cor) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "paleta-cor";
      b.style.background = cor;
      b.dataset.cor = cor;
      b.title = cor;
      b.setAttribute("aria-label", `${linha.nome} ${cor}`);
      if (cor.toLowerCase() === String(atual).toLowerCase()) b.classList.add("escolhida");
      b.addEventListener("click", () => {
        const escolha = aoEscolher;
        fechar();
        escolha?.(cor);
      });
      div.appendChild(b);
    });
    els.grelha.appendChild(div);
  });
  if (els.exata && /^#[0-9a-f]{6}$/i.test(String(atual))) els.exata.value = atual;
  els.overlay.classList.remove("hidden");
}

els.exata?.addEventListener("input", (e) => {
  // A cor exata não fecha a paleta: quem está a afinar um tom quer ver o
  // resultado e continuar a mexer.
  aoEscolher?.(e.target.value);
});
els.fecharBtn?.addEventListener("click", fechar);
els.overlay?.addEventListener("click", (e) => { if (e.target === els.overlay) fechar(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.overlay?.classList.contains("hidden")) fechar();
});
