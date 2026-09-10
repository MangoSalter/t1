// O ESTADO DO DESAFIO DO DIA, sozinho num módulo.
//
// Isto não é aqui por arrumação: é para o solo.js poder chegar tarde. São
// 143 KB que só servem a quem joga sozinho, mas o ecrã de entrada mostra se
// já jogaste hoje e quantos dias seguidos levas — e é isso que faz voltar
// amanhã. Adiar o solo.js sem tirar esta parte apagava exatamente a coisa
// que o traz de volta.
//
// Aqui ficam só as duas coisas de que o ecrã de entrada precisa: ler o que
// está guardado, e a frase que se lê. Escrito UMA vez, para o menu do modo
// sozinho e a entrada não poderem discordar um do outro.
//
// Sem DOM ao carregar (ver "Module boundaries" no CLAUDE.md): quem pinta
// recebe os elementos.
import { diaDoDesafio } from "./data.js";

export const DESAFIO_KEY = "euSei_desafio";

export function lerDesafio() {
  try {
    const bruto = JSON.parse(localStorage.getItem(DESAFIO_KEY) || "{}");
    return {
      dia: typeof bruto.dia === "string" ? bruto.dia : null,
      pontos: Number(bruto.pontos) || 0,
      corretas: Number(bruto.corretas) || 0,
      total: Number(bruto.total) || 0,
      sequencia: Number(bruto.sequencia) || 0,
    };
  } catch {
    return { dia: null, pontos: 0, corretas: 0, total: 0, sequencia: 0 };
  }
}

export function guardarDesafio(dados) {
  try { localStorage.setItem(DESAFIO_KEY, JSON.stringify(dados)); } catch { /* sem drama */ }
}

// Ontem em relação a um dia dado, para saber se a sequência continua ou
// recomeça. Feito com Date para os fins de mês e os anos bissextos não serem
// um caso especial escrito à mão.
export function diaAnterior(diaISO) {
  const [a, m, d] = diaISO.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  data.setDate(data.getDate() - 1);
  return diaDoDesafio(data);
}

// A frase e o rótulo do botão, a partir do que está guardado.
export function textoDoDesafio(guardado = lerDesafio(), hoje = diaDoDesafio()) {
  const jogadoHoje = guardado.dia === hoje;
  const sequencia = guardado.sequencia > 0 ? ` · ${guardado.sequencia} dia(s) seguidos` : "";
  return {
    texto: jogadoHoje
      ? `Hoje já foi: ${guardado.pontos} pts (${guardado.corretas}/${guardado.total})${sequencia}`
      : `Uma ronda, igual para toda a gente${sequencia}`,
    rotulo: jogadoHoje ? "📅 Ver o desafio de hoje" : "📅 Desafio do dia",
  };
}

// Pinta onde lhe disserem. Aceita elementos em falta porque a entrada e o
// menu do modo sozinho não têm os mesmos.
export function pintarDesafio({ estado, botao } = {}) {
  const { texto, rotulo } = textoDoDesafio();
  if (estado) estado.textContent = texto;
  if (botao) botao.textContent = rotulo;
}
