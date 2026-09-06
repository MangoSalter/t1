// A OFICINA: os jogos que existem mas ainda não estão para se mostrar.
//
// São jogos que funcionam, têm testes e não estão bons o suficiente para
// aparecerem no site. Em vez de os apagar — e perder o trabalho e os testes —
// ficam aqui atrás de um interruptor: fora do site para quem entra, à mão para
// quem os está a melhorar (e para os testes, que continuam a correr sobre
// eles como se nada fosse).
//
// Voltar a expor um jogo é tirá-lo desta lista e do data-oficina no HTML.
export const JOGOS_NA_OFICINA = [
  "reflex",    // Olho de Lince
  "bug",       // Mata o Inseto
  "monkey",    // Cada Macaco no Seu Galho
  "map",       // Mapa-Múndi antigo (substituído pelo mapa a sério)
  "mapTrivia", // o mesmo, na sala
  "pacman",    // Kota Corre!
  "cards",     // Descartando Juntos
  "car",       // Estrada Maluca (solo)
  "race",      // Estrada Maluca (sala)
  "landmark",  // Onde Fica Isto?
];

const CHAVE = "euSei_oficina";

// A oficina abre-se de duas maneiras: com ?oficina=1 no endereço (dá um link
// para mandar a quem está a ajudar a testar) ou com localStorage.euSei_oficina
// = "1". A primeira guarda a segunda, para o link só ser preciso uma vez. É de
// propósito que não há botão nenhum: quem precisa disto sabe onde está, e quem
// não precisa não tem de tropeçar nela.
export function naOficina() {
  try {
    if (new URLSearchParams(location.search).get("oficina") === "1") {
      localStorage.setItem(CHAVE, "1");
      return true;
    }
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

export function estaNaOficina(chave) {
  return JOGOS_NA_OFICINA.includes(chave) && !naOficina();
}

// Esconde do ecrã tudo o que está marcado como de oficina. Corre uma vez, ao
// carregar a página.
export function esconderAOficina() {
  if (naOficina()) return;
  document.querySelectorAll("[data-oficina]").forEach((el) => {
    el.hidden = true;
    // Esconder uma caixa de seleção não a desmarca, e a maratona vai buscar
    // as marcadas — ficava a contar jogos que ninguém podia ver nem escolher.
    el.querySelectorAll?.("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    if (el.matches?.("input[type=checkbox]")) el.checked = false;
  });
}
