// O seletor de língua na página de entrada.
//
// Fica à vista logo no princípio, e não escondido nas definições: quem chega e
// encontra tudo numa língua que não lê fecha a página antes de descobrir onde
// se muda.
import { LINGUAS, lingua, definirLingua, aoMudarLingua, t } from "./i18n.js";

const sel = document.getElementById("lingua-select");
const rotulo = document.getElementById("lingua-rotulo");

if (sel) {
  LINGUAS.forEach((l) => {
    const op = document.createElement("option");
    op.value = l.chave;
    op.textContent = l.nome;
    sel.appendChild(op);
  });
  sel.value = lingua();
  sel.addEventListener("change", () => definirLingua(sel.value));
}

function aplicar() {
  if (rotulo) rotulo.textContent = t("lingua");
  // Os textos que estão escritos no HTML e mudam com a língua marcam-se com
  // data-i18n. Assim não é preciso ir buscar cada um pelo id, e um botão novo
  // entra na tradução só por ter o atributo.
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const chave = el.dataset.i18n;
    const texto = t(chave);
    if (texto) el.textContent = texto;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const texto = t(el.dataset.i18nPlaceholder);
    if (texto) el.placeholder = texto;
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const texto = t(el.dataset.i18nTitle);
    if (texto) el.title = texto;
  });
}

aplicar();
aoMudarLingua(aplicar);
