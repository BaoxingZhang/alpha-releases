"use strict";
const electron = require("electron");
const NOTIFICATION_WINDOW_CHANNELS = {
  show: "alpha:notification-window:show",
  reveal: "alpha:notification-window:reveal",
  luma: "alpha:notification-window:luma",
  ready: "alpha:notification-window:ready",
  layout: "alpha:notification-window:layout",
  hiding: "alpha:notification-window:hiding",
  closed: "alpha:notification-window:closed",
  activate: "alpha:notification-window:activate"
};
let latest;
const showListeners = /* @__PURE__ */ new Set();
electron.ipcRenderer.on(NOTIFICATION_WINDOW_CHANNELS.show, (_event, card) => {
  latest = card;
  for (const listener of showListeners) listener(card);
});
function on(channel, listener) {
  const handler = (_event, value) => listener(value);
  electron.ipcRenderer.on(channel, handler);
  return () => {
    electron.ipcRenderer.removeListener(channel, handler);
  };
}
const bridge = {
  // A push can arrive before React subscribes; replay the newest card.
  onShow(listener) {
    showListeners.add(listener);
    if (latest) listener(latest);
    return () => {
      showListeners.delete(listener);
    };
  },
  onReveal: (listener) => on(NOTIFICATION_WINDOW_CHANNELS.reveal, listener),
  onLuma: (listener) => on(NOTIFICATION_WINDOW_CHANNELS.luma, listener),
  ready: () => electron.ipcRenderer.send(NOTIFICATION_WINDOW_CHANNELS.ready),
  layout: (layout) => electron.ipcRenderer.send(NOTIFICATION_WINDOW_CHANNELS.layout, layout),
  hiding: (id) => electron.ipcRenderer.send(NOTIFICATION_WINDOW_CHANNELS.hiding, id),
  closed: (id) => electron.ipcRenderer.send(NOTIFICATION_WINDOW_CHANNELS.closed, id),
  activate: (id) => electron.ipcRenderer.send(NOTIFICATION_WINDOW_CHANNELS.activate, id)
};
electron.contextBridge.exposeInMainWorld("alphaNotification", Object.freeze(bridge));
