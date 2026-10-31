"use strict";
const electron = require("electron");
const IMAGE_VIEWER_CHANNEL = "alpha:image-viewer:view";
const IMAGE_VIEWER_ACTION_CHANNEL = "alpha:image-viewer:action";
const WINDOW_CHROME_CHANNELS = {
  control: "alpha:window-chrome:control",
  state: "alpha:window-chrome:state",
  changed: "alpha:window-chrome:changed"
};
const WINDOW_PLATFORM = typeof process === "object" && (process.platform === "darwin" || process.platform === "linux") ? process.platform : "win32";
let latest;
const listeners = /* @__PURE__ */ new Set();
electron.ipcRenderer.on(IMAGE_VIEWER_CHANNEL, (_event, payload) => {
  const same = latest?.session === payload.session;
  const gallery = payload.gallery ?? (same ? latest?.gallery : void 0);
  latest = { ...payload, image: payload.image ?? (same ? latest?.image : void 0), ...gallery ? { gallery } : {} };
  for (const listener of listeners) listener(payload);
});
electron.contextBridge.exposeInMainWorld("alphaImageViewer", Object.freeze({
  // A push can arrive before React subscribes; replay a complete snapshot of this session.
  subscribe(listener) {
    listeners.add(listener);
    if (latest) listener(latest);
    return () => {
      listeners.delete(listener);
    };
  },
  act: (request) => electron.ipcRenderer.invoke(IMAGE_VIEWER_ACTION_CHANNEL, request),
  windowChrome: Object.freeze({
    platform: WINDOW_PLATFORM,
    control: (action) => electron.ipcRenderer.invoke(WINDOW_CHROME_CHANNELS.control, action),
    state: () => electron.ipcRenderer.invoke(WINDOW_CHROME_CHANNELS.state),
    onChange: (listener) => {
      const handler = (_event, change) => listener(change);
      electron.ipcRenderer.on(WINDOW_CHROME_CHANNELS.changed, handler);
      return () => {
        electron.ipcRenderer.removeListener(WINDOW_CHROME_CHANNELS.changed, handler);
      };
    }
  })
}));
