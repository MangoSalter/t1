// A LÍNGUA DE QUEM JOGA.
//
// Cada pessoa escolhe a sua, e a escolha é dela e mais de ninguém: numa sala
// podem estar três pessoas a jogar em três línguas ao mesmo tempo, cada uma a
// ler o seu ecrã. Isto funciona porque o que viaja entre os jogadores são
// COISAS (um país conquistado, uma cor, uma pontuação) e não frases — as
// frases nascem sempre no ecrã de quem as lê.
//
// No jogo do mapa isso já era verdade antes desta escolha existir: as
// respostas são aceites em português, inglês e espanhol, por isso quem joga em
// espanhol escreve "Alemania" e quem joga em inglês escreve "Germany" para o
// mesmo país, na mesma partida, sem se atrapalharem.
//
// Fica no localStorage e não no sessionStorage, ao contrário da identidade de
// jogador: a língua é da PESSOA e do aparelho dela, e não faz sentido ter de a
// escolher outra vez em cada separador.

const CHAVE = "euSei_lingua";

export const LINGUAS = [
  { chave: "pt", nome: "Português" },
  { chave: "en", nome: "English" },
  { chave: "es", nome: "Español" },
];

// A LÍNGUA ESCOLHIDA, e SÓ ELA, é que viaja.
//
// As três tabelas vivem em textos-pt.js, textos-en.js e textos-es.js. Juntas
// são 140 KB e ninguém lê mais do que uma — num jogo de telemóvel isso é
// peso a mais no primeiro carregamento.
//
// O await no topo do módulo é de propósito: quem importa este ficheiro fica
// à espera da tabela, e por isso o t() continua a ser síncrono para toda a
// gente lá abaixo.
const TEXTOS = {};
const NOMES = new Set(LINGUAS.map((l) => l.chave));

let atual = "pt";
try {
  const guardada = localStorage.getItem(CHAVE);
  if (guardada && NOMES.has(guardada)) atual = guardada;
  else if (typeof navigator !== "undefined") {
    // Sem escolha feita, arranca-se na língua do browser. Quem chega de fora e
    // encontra tudo em português fecha a página antes de descobrir o seletor.
    const nav = String(navigator.language || "").slice(0, 2).toLowerCase();
    if (NOMES.has(nav)) atual = nav;
  }
} catch { /* sem armazenamento: fica em português */ }

async function carregar(chave) {
  if (TEXTOS[chave]) return TEXTOS[chave];
  // A chave já foi confrontada com a lista das línguas: o caminho não vem
  // de fora.
  const mod = await import(`./textos-${chave}.js`);
  TEXTOS[chave] = mod.default;
  return TEXTOS[chave];
}

await carregar(atual);

export function lingua() {
  return atual;
}

// Devolve uma promessa: trocar de língua pode ter de ir buscar a tabela. Quem
// carrega no seletor não precisa de esperar por ela — os ouvintes só são
// chamados quando o texto já cá está, que é o que interessa.
export async function definirLingua(chave) {
  if (!NOMES.has(chave)) return false;
  await carregar(chave);
  atual = chave;
  try {
    localStorage.setItem(CHAVE, chave);
  } catch { /* a escolha só não sobrevive à visita */ }
  ouvintes.forEach((f) => f(chave));
  return true;
}

const ouvintes = new Set();
export function aoMudarLingua(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

// O texto, na língua de quem lê. Já não há queda para português: com uma
// tabela só carregada, o português pode nem estar cá. O que garante que não
// falta nada é o test-linguas, que compara as três chave a chave.
export function t(chave, ...args) {
  const v = TEXTOS[atual]?.[chave];
  if (v === undefined) return "";
  return typeof v === "function" ? v(...args) : v;
}
