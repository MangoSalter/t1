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

const TEXTOS = {
  pt: {
    lingua: "Língua",
    mapaAbrir: "🌍 Mapa-Múndi",
    mapaVoltar: "← Voltar",
    mapaEscrever: "Escrever",
    mapaPedirAjuda: "🐈‍⬛ Pedir ajuda",
    mapaHipoteses: "❓ Três hipóteses",
    mapaRecomecar: "Recomeçar",
    mapaVerMundo: "Ver o mundo todo",
    mapaCaixa: "Clica num país e escreve o nome",
    mapaCaixaLivre: "Escreve o nome de um país",
    mapaQualPais: "Que país é este?",
    mapaACarregar: "A carregar o mundo...",
    mapaComecar: "Clica num país e escreve o nome dele.",
    mapaOndeLabel: "Onde",
    mapaComoLabel: "Como",
    mapaOQueLabel: "O quê",
    mapaCamadaCapitais: (n) => `Capitais: ${n} territórios. Clica num e diz a capital.`,
    mapaQualCapital: (p) => `Qual é a capital de ${p}?`,
    mapaCaixaCapital: "Clica num território e diz a capital",
    mapaCaixaCapitalLivre: "Escreve uma capital",
    // As falas da casa. O mapa é dos poucos ecrãs que fala três línguas, por
    // isso as falas vivem aqui e não no data.js com as dos outros jogos — uma
    // gata a resmungar em português para quem escolheu inglês não é coesão, é
    // um descuido.
    mapaFalas: [
      ["Dona Manga", "O mundo todo? Eu conheço dois sítios: o sofá e a cozinha."],
      ["Dona Manga", "Se demorares, deito-me em cima da Europa. Fica combinado."],
      ["Dona Manga", "Sei onde ficam os países todos. Só não me apetece dizer."],
      ["Brasa", "Se ficares preso, chama por mim. Eu mostro a bandeira e finjo que não fui eu."],
      ["Brasa", "Comecei pela Ásia porque é a maior. Não foi boa ideia."],
      ["Brasa", "A Dona Manga diz que já fez o mapa todo. Nunca a vi a fazer nada."],
    ],
    mapaSemMapa: "Não consegui carregar o mapa. Tenta recarregar a página.",
    mapaEMar: "Isso é mar. Clica em terra.",
    mapaETerra: "Isso é terra. Clica na água.",
    mapaJaEsta: (n) => `${n} já está conquistado.`,
    mapaForaDoModo: "Esse país não entra nesta partida. Troca de modo se o quiseres.",
    mapaEscreveNome: "Escreve o nome deste país.",
    mapaEscolhePrimeiro: "Aponta primeiro um território no mapa.",
    mapaNaoFalta: (t) => `"${t}" não é nenhum que ainda falte.`,
    mapaErrado: (t) => `"${t}" não é este país. Tenta outra vez.`,
    mapaCerto: (n, f) => `${n}, certo. Faltam ${f}.`,
    mapaAcabou: "Acabou — está tudo conquistado!",
    mapaLimpo: "Mapa limpo. Outra vez do princípio.",
    mapaFimTitulo: "Mapa completo!",
    mapaFimVer: "Ver o mapa",
    mapaFimOutra: "Outra vez",
    mapaFimPaises: "países conquistados",
    mapaFimTempo: "de jogo",
    mapaFimPontos: "pontos",
    mapaFimRitmo: "países por minuto",
    mapaFimCadeia: "melhor sequência",
    mapaFimPrecisao: "de acerto",
    mapaFimMedia: "por país, em média",
    mapaFimRapido: "o mais rápido",
    mapaFimForte: "onde és mais forte",
    mapaFimDeCabeca: "de cabeça, sem pista",
    mapaFimSegundos: (n) => `${n}s`,
    mapaMangaRoubou: (n) => `🐈 A Dona Manga passou por cima do mapa e ${n} ficou outra vez por conquistar!`,
    mapaRoubado: (n, p) => `Roubaste ${n} a quem falhou! +${p} pontos.`,
    mapaTarde: (n) => `${n} já era de outro — chegaste tarde por pouco.`,
    mapaMarcador: (p, c, r) => `⭐ ${p} · 🔥 ${c} · ${r}/min`,
    mapaCadeia: (n, b) => `${n} seguidos! +${b} de bónus.`,
    mapaRetrato: (r) => `${r.certos} países em ${r.segundos}s · ⭐ ${r.pontos} pontos · ${r.porMinuto}/min · melhor sequência ${r.melhorCadeia}${r.precisao === null ? "" : ` · ${r.precisao}% de acerto`}${r.favorito ? ` · mais forte em ${r.favorito.cont}` : ""}${r.maisRapido ? ` · o mais rápido foi ${r.maisRapido.nome} (${r.maisRapido.segundos}s)` : ""}`,
    mapaEscolheOutro: "Escolhe outro país.",
    mapaBandeira: (b) => `O Brasa pousou uma bandeira${b ? ` ${b}` : ""} num país que ainda falta.`,
    mapaBandeiraPedida: (b) => `O Brasa pousou uma bandeira${b ? ` ${b}` : ""} — vê se a reconheces.`,
    mapaSemPistas: "Já não há mais nada para revelar.",
    mapaEspera: (s) => `Ainda não — espera ${s}s.`,
    mapaTresEscolhe: "Três hipóteses. Escolhe uma.",
    mapaModoPronto: (nome, n) => `${nome}: ${n} países. Clica num e escreve o nome.`,
  },
  en: {
    lingua: "Language",
    mapaAbrir: "🌍 World Map",
    mapaVoltar: "← Back",
    mapaEscrever: "Enter",
    mapaPedirAjuda: "🐈‍⬛ Ask for help",
    mapaHipoteses: "❓ Three options",
    mapaRecomecar: "Restart",
    mapaVerMundo: "See the whole world",
    mapaCaixa: "Click a country and type its name",
    mapaCaixaLivre: "Type a country's name",
    mapaQualPais: "Which country is this?",
    mapaACarregar: "Loading the world...",
    mapaComecar: "Click a country and type its name.",
    mapaOndeLabel: "Where",
    mapaComoLabel: "How",
    mapaOQueLabel: "What",
    mapaCamadaCapitais: (n) => `Capitals: ${n} territories. Click one and name its capital.`,
    mapaQualCapital: (p) => `What is the capital of ${p}?`,
    mapaCaixaCapital: "Click a territory and name its capital",
    mapaCaixaCapitalLivre: "Type a capital",
    mapaFalas: [
      ["Dona Manga", "The whole world? I know two places: the sofa and the kitchen."],
      ["Dona Manga", "Take too long and I'm lying down on Europe. Fair warning."],
      ["Dona Manga", "I know where every country is. I just don't feel like saying."],
      ["Brasa", "If you get stuck, call me. I'll show the flag and pretend it wasn't me."],
      ["Brasa", "I started with Asia because it's the biggest. That was a mistake."],
      ["Brasa", "Dona Manga says she's finished the whole map. I've never seen her do anything."],
    ],
    mapaSemMapa: "Could not load the map. Try reloading the page.",
    mapaEMar: "That's sea. Click on land.",
    mapaETerra: "That's land. Click on water.",
    mapaJaEsta: (n) => `${n} is already taken.`,
    mapaForaDoModo: "That country isn't in this round. Change mode if you want it.",
    mapaEscreveNome: "Type this country's name.",
    mapaEscolhePrimeiro: "Point at a territory on the map first.",
    mapaNaoFalta: (t) => `"${t}" isn't one of the ones still missing.`,
    mapaErrado: (t) => `"${t}" isn't this country. Try again.`,
    mapaCerto: (n, f) => `${n}, correct. ${f} to go.`,
    mapaAcabou: "Done — everything is taken!",
    mapaLimpo: "Map cleared. From the top.",
    mapaFimTitulo: "Map complete!",
    mapaFimVer: "See the map",
    mapaFimOutra: "Again",
    mapaFimPaises: "countries taken",
    mapaFimTempo: "of play",
    mapaFimPontos: "points",
    mapaFimRitmo: "countries per minute",
    mapaFimCadeia: "best streak",
    mapaFimPrecisao: "accuracy",
    mapaFimMedia: "per country, on average",
    mapaFimRapido: "fastest",
    mapaFimForte: "where you are strongest",
    mapaFimDeCabeca: "from memory, no hint",
    mapaFimSegundos: (n) => `${n}s`,
    mapaMangaRoubou: (n) => `🐈 Dona Manga walked over the map and ${n} is up for grabs again!`,
    mapaRoubado: (n, p) => `You stole ${n} from whoever missed it! +${p} points.`,
    mapaTarde: (n) => `${n} was already someone else's — you missed it by a hair.`,
    mapaMarcador: (p, c, r) => `⭐ ${p} · 🔥 ${c} · ${r}/min`,
    mapaCadeia: (n, b) => `${n} in a row! +${b} bonus.`,
    mapaRetrato: (r) => `${r.certos} countries in ${r.segundos}s · ⭐ ${r.pontos} points · ${r.porMinuto}/min · best streak ${r.melhorCadeia}${r.precisao === null ? "" : ` · ${r.precisao}% accuracy`}${r.favorito ? ` · strongest in ${r.favorito.cont}` : ""}${r.maisRapido ? ` · fastest was ${r.maisRapido.nome} (${r.maisRapido.segundos}s)` : ""}`,
    mapaEscolheOutro: "Pick another country.",
    mapaBandeira: (b) => `Brasa dropped a flag${b ? ` ${b}` : ""} on a country still missing.`,
    mapaBandeiraPedida: (b) => `Brasa dropped a flag${b ? ` ${b}` : ""} — see if you recognise it.`,
    mapaSemPistas: "Nothing left to reveal.",
    mapaEspera: (s) => `Not yet — wait ${s}s.`,
    mapaTresEscolhe: "Three options. Pick one.",
    mapaModoPronto: (nome, n) => `${nome}: ${n} countries. Click one and type its name.`,
  },
  es: {
    lingua: "Idioma",
    mapaAbrir: "🌍 Mapamundi",
    mapaVoltar: "← Volver",
    mapaEscrever: "Escribir",
    mapaPedirAjuda: "🐈‍⬛ Pedir ayuda",
    mapaHipoteses: "❓ Tres opciones",
    mapaRecomecar: "Reiniciar",
    mapaVerMundo: "Ver el mundo entero",
    mapaCaixa: "Haz clic en un país y escribe su nombre",
    mapaCaixaLivre: "Escribe el nombre de un país",
    mapaQualPais: "¿Qué país es este?",
    mapaACarregar: "Cargando el mundo...",
    mapaComecar: "Haz clic en un país y escribe su nombre.",
    mapaOndeLabel: "Dónde",
    mapaComoLabel: "Cómo",
    mapaOQueLabel: "Qué",
    mapaCamadaCapitais: (n) => `Capitales: ${n} territorios. Haz clic en uno y di la capital.`,
    mapaQualCapital: (p) => `¿Cuál es la capital de ${p}?`,
    mapaCaixaCapital: "Haz clic en un territorio y di la capital",
    mapaCaixaCapitalLivre: "Escribe una capital",
    mapaFalas: [
      ["Doña Manga", "¿El mundo entero? Yo conozco dos sitios: el sofá y la cocina."],
      ["Doña Manga", "Si tardas, me acuesto encima de Europa. Queda dicho."],
      ["Doña Manga", "Sé dónde están todos los países. Solo que no me apetece decirlo."],
      ["Brasa", "Si te atascas, llámame. Enseño la bandera y finjo que no fui yo."],
      ["Brasa", "Empecé por Asia porque es la más grande. No fue buena idea."],
      ["Brasa", "Doña Manga dice que ya hizo el mapa entero. Nunca la vi hacer nada."],
    ],
    mapaSemMapa: "No pude cargar el mapa. Prueba a recargar la página.",
    mapaEMar: "Eso es mar. Haz clic en tierra.",
    mapaETerra: "Eso es tierra. Haz clic en el agua.",
    mapaJaEsta: (n) => `${n} ya está conquistado.`,
    mapaForaDoModo: "Ese país no entra en esta partida. Cambia de modo si lo quieres.",
    mapaEscreveNome: "Escribe el nombre de este país.",
    mapaEscolhePrimeiro: "Señala primero un territorio en el mapa.",
    mapaNaoFalta: (t) => `"${t}" no es ninguno de los que faltan.`,
    mapaErrado: (t) => `"${t}" no es este país. Inténtalo otra vez.`,
    mapaCerto: (n, f) => `${n}, correcto. Faltan ${f}.`,
    mapaAcabou: "¡Se acabó — está todo conquistado!",
    mapaLimpo: "Mapa limpio. Otra vez desde el principio.",
    mapaFimTitulo: "¡Mapa completo!",
    mapaFimVer: "Ver el mapa",
    mapaFimOutra: "Otra vez",
    mapaFimPaises: "países conquistados",
    mapaFimTempo: "de juego",
    mapaFimPontos: "puntos",
    mapaFimRitmo: "países por minuto",
    mapaFimCadeia: "mejor racha",
    mapaFimPrecisao: "de acierto",
    mapaFimMedia: "por país, de media",
    mapaFimRapido: "el más rápido",
    mapaFimForte: "donde eres más fuerte",
    mapaFimDeCabeca: "de memoria, sin pista",
    mapaFimSegundos: (n) => `${n}s`,
    mapaMangaRoubou: (n) => `🐈 ¡Doña Manga pasó por encima del mapa y ${n} volvió a quedar libre!`,
    mapaRoubado: (n, p) => `¡Le robaste ${n} a quien falló! +${p} puntos.`,
    mapaTarde: (n) => `${n} ya era de otro — llegaste tarde por poco.`,
    mapaMarcador: (p, c, r) => `⭐ ${p} · 🔥 ${c} · ${r}/min`,
    mapaCadeia: (n, b) => `¡${n} seguidos! +${b} de bonus.`,
    mapaRetrato: (r) => `${r.certos} países en ${r.segundos}s · ⭐ ${r.pontos} puntos · ${r.porMinuto}/min · mejor racha ${r.melhorCadeia}${r.precisao === null ? "" : ` · ${r.precisao}% de acierto`}${r.favorito ? ` · más fuerte en ${r.favorito.cont}` : ""}${r.maisRapido ? ` · el más rápido fue ${r.maisRapido.nome} (${r.maisRapido.segundos}s)` : ""}`,
    mapaEscolheOutro: "Elige otro país.",
    mapaBandeira: (b) => `Brasa dejó una bandera${b ? ` ${b}` : ""} en un país que falta.`,
    mapaBandeiraPedida: (b) => `Brasa dejó una bandera${b ? ` ${b}` : ""} — a ver si la reconoces.`,
    mapaSemPistas: "Ya no queda nada por revelar.",
    mapaEspera: (s) => `Todavía no — espera ${s}s.`,
    mapaTresEscolhe: "Tres opciones. Elige una.",
    mapaModoPronto: (nome, n) => `${nome}: ${n} países. Haz clic en uno y escribe su nombre.`,
  },
};

let atual = "pt";
try {
  const guardada = localStorage.getItem(CHAVE);
  if (guardada && TEXTOS[guardada]) atual = guardada;
  else if (typeof navigator !== "undefined") {
    // Sem escolha feita, arranca-se na língua do browser. Quem chega de fora e
    // encontra tudo em português fecha a página antes de descobrir o seletor.
    const nav = String(navigator.language || "").slice(0, 2).toLowerCase();
    if (TEXTOS[nav]) atual = nav;
  }
} catch { /* sem armazenamento: fica em português */ }

export function lingua() {
  return atual;
}

export function definirLingua(chave) {
  if (!TEXTOS[chave]) return false;
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

// O texto, na língua de quem lê. Sem tradução, cai no português — nunca numa
// chave crua no ecrã, que é a maneira mais feia de falhar uma tradução.
export function t(chave, ...args) {
  const v = TEXTOS[atual]?.[chave] ?? TEXTOS.pt[chave];
  if (v === undefined) return "";
  return typeof v === "function" ? v(...args) : v;
}
