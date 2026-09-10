// Dois ajudantes de texto que o quadro e o resto da app partilham.
// Ficaram aqui, e não no app.js, para o quadro poder sair para módulo próprio
// sem ficar preso ao ficheiro de onde saiu.

// Nomes de jogadores são escritos por eles próprios — sempre escapar antes
// de meter em innerHTML (textContent já é seguro por si só).
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

export function avatarImgHtml(avatarDataUrl, size, name) {
  // avatarDataUrl vem de outro jogador (via Firebase) — valida que é mesmo
  // um data URI de imagem antes de o meter num atributo src, e escapa na
  // mesma por defesa extra (um jogador tecnicamente curioso podia escrever
  // lá o que quisesse diretamente na base de dados, tal como o resto deste
  // jogo "por confiança").
  const isValidDataUrl = typeof avatarDataUrl === "string" && /^data:image\/(png|gif|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarDataUrl);
  const cls = size === "sm" ? "avatar-thumb-sm" : "avatar-thumb";
  // Sem avatar, um quadrado vazio com moldura lia-se como uma checkbox por
  // marcar em todas as classificações. A inicial do nome ocupa o mesmo
  // espaço, parece intencional, e ainda ajuda a distinguir jogadores.
  if (!isValidDataUrl) {
    const initial = (typeof name === "string" ? name.trim() : "").slice(0, 1).toUpperCase();
    return `<span class="${cls} avatar-thumb-initial">${escapeHtml(initial || "?")}</span>`;
  }
  return `<img class="${cls}" src="${escapeHtml(avatarDataUrl)}" alt="" />`;
}

// O RELÓGIO DAS FASES CRONOMETRADAS.
//
// Era um número a descer e mais nada. Numa ronda de 60 segundos escrita em
// dez telemóveis, o ecrã trocava a meio de uma palavra e ninguém tinha visto
// vir — os jogos deste género marcam sempre os últimos segundos. É a mesma
// etiqueta em quatro sítios (a letra, a folha e a votação na sala, e a folha
// do modo sozinho), por isso o aviso é escrito uma vez e não quatro.
//
// O aviso é DUPLO de propósito. A cor e o contorno ficam para quem tem o
// movimento reduzido, que perde o pulsar (a regra global do style.css apaga
// as animações todas) e continuaria sem saber de nada. E o som toca nos
// ÚLTIMOS TRÊS segundos, não nos dez: um apito por segundo durante dez, em
// dez telemóveis desencontrados, é barulho e não aviso.
export const RELOGIO_URGENTE_S = 10;
export const RELOGIO_SOM_S = 3;

export function formatarSegundos(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

// `estado` é um objeto qualquer que o chamador guarde entre quadros: isto é
// chamado a cada requestAnimationFrame e o som só pode tocar quando o SEGUNDO
// muda, não sessenta vezes dentro do mesmo segundo.
export function pintarRelogio(el, segundos, estado, tocar) {
  if (!el) return;
  el.textContent = formatarSegundos(segundos);
  el.classList.toggle("relogio-urgente", segundos > 0 && segundos <= RELOGIO_URGENTE_S);
  if (tocar && estado && estado.ultimo !== segundos && segundos > 0 && segundos <= RELOGIO_SOM_S) {
    tocar();
  }
  if (estado) estado.ultimo = segundos;
}

// Sair da fase: a etiqueta esvazia-se (o :empty do CSS esconde-a) e a
// urgência tem de sair com ela, senão a próxima fase começa a vermelho.
export function limparRelogio(el, estado) {
  if (!el) return;
  el.textContent = "";
  el.classList.remove("relogio-urgente");
  if (estado) estado.ultimo = null;
}
