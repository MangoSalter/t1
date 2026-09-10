// O seletor de língua na página de entrada.
//
// Fica à vista logo no princípio, e não escondido nas definições: quem chega e
// encontra tudo numa língua que não lê fecha a página antes de descobrir onde
// se muda.
import { LINGUAS, lingua, definirLingua, aoMudarLingua, t } from "./i18n.js";

const sel = document.getElementById("lingua-select");

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
  // O nome que o leitor de ecrã anuncia também muda de língua. Sem isto, quem
  // joga em inglês com leitor de ecrã ouvia os campos em português — e o
  // aria-label ganha sempre ao texto visível, por isso seria pior do que não
  // ter nada.
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const texto = t(el.dataset.i18nAria);
    if (texto) el.setAttribute("aria-label", texto);
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    const texto = t(el.dataset.i18nAlt);
    if (texto) el.alt = texto;
  });
  // A linha dos atalhos do quadro leva <b> pelo meio ("Ctrl+Z anular · B
  // caneta · ..."), e o textContent apagava-os. As frases vêm todas da tabela
  // aqui do lado — nunca de quem joga —, por isso o innerHTML é seguro; se
  // algum dia alguma vier de fora, isto passa a ser a porta.
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const texto = t(el.dataset.i18nHtml);
    if (texto) el.innerHTML = texto;
  });
}

aplicar();
aoMudarLingua(aplicar);
