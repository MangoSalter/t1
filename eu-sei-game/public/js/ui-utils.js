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
