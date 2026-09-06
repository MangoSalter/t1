// QUEM SOU EU, e porque é que isto não é o uid da conta.
//
// A conta anónima do Firebase serve para ter acesso à base de dados (as regras
// pedem auth != null) e é a MESMA em todos os separadores do mesmo browser.
// Enquanto ela servia de identidade de jogador, duas pessoas a jogar no mesmo
// computador em dois separadores eram contadas como uma só, e a segunda a
// entrar escrevia por cima da primeira.
//
// A identidade de JOGADOR passou a ser por separador. Mas por separador a seco
// perde outra coisa: fechar a janela e voltar a abri-la entrava como jogador
// novo, deixando o antigo na lista como desligado — e a meio de um jogo isso é
// mau de outra maneira.
//
// Portanto: a identidade vive no sessionStorage (é do separador, sobrevive a um
// F5) e a ÚLTIMA usada fica guardada no localStorage. Um separador novo
// pergunta em voz alta, pelo BroadcastChannel, se mais alguém está a usar essa
// identidade; se ninguém responder num quarto de segundo, é porque a janela
// anterior fechou e ele fica com ela. Se alguém responder, é porque ainda lá
// está — e então cria-se uma nova.
//
// Este ficheiro é partilhado pelo firebase-init.js verdadeiro e pelo duplo dos
// testes, de propósito: é a mesma decisão nos dois. Foi por terem
// implementações diferentes que o defeito original passou despercebido a
// TODOS os testes multi-cliente.

export const UID_KEY = "euSei_jogadorNestaAba";
export const ULTIMO_KEY = "euSei_ultimoJogador";
export const CANAL = "euSei_identidade";
// Um quarto de segundo é o tempo que um separador vivo leva a responder a uma
// mensagem que já está na fila dele. Mais do que isto atrasa o arranque; menos
// arrisca dar a identidade a alguém que ainda a está a usar.
export const ESPERA_MS = 250;

// A decisão, sem nada à volta. Separada de propósito: é a única parte que os
// testes puros conseguem ver, porque o resto precisa de um browser.
export function escolherIdentidade({ daAba, doBrowser, emUso, criar }) {
  // Já tenho a minha: um F5 não muda quem eu sou.
  if (daAba) return { id: daAba, herdada: false };
  // Ninguém a está a usar: a janela anterior fechou, o lugar é meu.
  if (doBrowser && !emUso) return { id: doBrowser, herdada: true };
  // Está ocupada (ou não há nenhuma): sou gente nova.
  return { id: criar(), herdada: false };
}

function ler(store, chave) {
  try {
    return store.getItem(chave) || null;
  } catch {
    return null; // sem armazenamento (janela privada, definições do browser)
  }
}

function escrever(store, chave, valor) {
  try {
    store.setItem(chave, valor);
  } catch { /* ver ler() */ }
}

// Pergunta aos outros separadores se algum está a usar esta identidade.
// Sem BroadcastChannel (browser antigo), responde-se "está a ser usada": o
// pior que acontece é entrar como jogador novo, que é o que acontecia antes.
function alguemEstaAUsar(id) {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    let canal;
    try {
      canal = new BroadcastChannel(CANAL);
    } catch {
      resolve(true);
      return;
    }
    let respondido = false;
    const acabar = (resposta) => {
      if (respondido) return;
      respondido = true;
      try { canal.close(); } catch { /* já fechado */ }
      resolve(resposta);
    };
    canal.onmessage = (e) => {
      if (e.data?.tipo === "uso" && e.data.id === id) acabar(true);
    };
    canal.postMessage({ tipo: "quem-usa", id });
    setTimeout(() => acabar(false), ESPERA_MS);
  });
}

// Fica à escuta para responder a quem perguntar por MIM. Sem isto, a pergunta
// de cima nunca teria resposta e dois separadores abertos ao mesmo tempo
// acabariam com a mesma identidade — que é exatamente o defeito que isto veio
// resolver.
function responderPorMim(id) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const canal = new BroadcastChannel(CANAL);
    canal.onmessage = (e) => {
      if (e.data?.tipo === "quem-usa" && e.data.id === id) {
        canal.postMessage({ tipo: "uso", id });
      }
    };
  } catch { /* sem canal: ver alguemEstaAUsar */ }
}

export async function identidadeDestaAba(contaUid) {
  const daAba = ler(sessionStorage, UID_KEY);
  if (daAba) {
    responderPorMim(daAba);
    return daAba;
  }
  const doBrowser = ler(localStorage, ULTIMO_KEY);
  const emUso = doBrowser ? await alguemEstaAUsar(doBrowser) : false;
  // A conta vai no id para dois browsers diferentes nunca colidirem; o sufixo
  // ao acaso separa os separadores do mesmo browser.
  const criar = () => `${contaUid}_${Math.random().toString(36).slice(2, 8)}`;
  const { id } = escolherIdentidade({ daAba, doBrowser, emUso, criar });
  escrever(sessionStorage, UID_KEY, id);
  escrever(localStorage, ULTIMO_KEY, id);
  responderPorMim(id);
  return id;
}
