// Onde é que a app está: em que sala, com que nome, em que ecrã.
// É um objeto único e partilhado de propósito — quem escreve nele é o app.js
// (que fala com o Firebase); o quadro só lê. Vive fora do app.js para o
// quadro lhe chegar sem ter de importar o ficheiro inteiro de volta (o que
// daria uma dependência circular entre os dois).

export const screens = {};
document.querySelectorAll("[data-screen]").forEach((el) => {
  screens[el.dataset.screen] = el;
});

export const state = {
  uid: null,
  name: "",
  code: null,
  room: null,
  unsubscribe: null,
  answerTimers: {},
};

export function isHost(room) {
  return room?.hostId === state.uid;
}
