import { j as jsxRuntimeExports, r as reactExports, R as ReactDOM, a as React } from "./client-Bg2hQ5uk.js";
import { m as messageTextSegments } from "./segments-CBPICGMn.js";
const NOTIFICATION_BAND = { card: 0, title: 1, body: 2 };
const TO_DARK = 112;
const TO_LIGHT = 148;
function bandLuma(band) {
  return 0.2126 * band.r + 0.7152 * band.g + 0.0722 * band.b;
}
function mode(band, previous) {
  if (!band) return previous;
  const luma = bandLuma(band);
  if (previous === "light") return luma < TO_DARK ? "dark" : "light";
  return luma > TO_LIGHT ? "light" : "dark";
}
function spread(band) {
  if (!band) return 0;
  return Math.max(0, Math.min(1, (band.lightTail - band.darkTail - 40) / 140));
}
function valid(band) {
  if (!band || typeof band !== "object") return false;
  const value = band;
  return ["r", "g", "b", "darkTail", "lightTail"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}
function nextGlassTone(previous, luma) {
  const pick = (id) => {
    const band = luma[String(id)];
    return valid(band) ? band : void 0;
  };
  const card = pick(NOTIFICATION_BAND.card);
  const title = pick(NOTIFICATION_BAND.title) ?? card;
  const body = pick(NOTIFICATION_BAND.body) ?? card;
  const cardMode = mode(card, previous.card);
  return {
    card: cardMode,
    title: mode(title, previous.title),
    body: mode(body, previous.body),
    busy: card ? spread(card) : previous.busy,
    titleHalo: title ? spread(title) : previous.titleHalo,
    bodyHalo: body ? spread(body) : previous.bodyHalo
  };
}
function initialGlassTone(theme) {
  return { card: theme, title: theme, body: theme, busy: 0, titleHalo: 0, bodyHalo: 0 };
}
const INK = { light: "24, 26, 30", dark: "247, 248, 250" };
function glassToneStyle(tone) {
  const tintAlpha = (tone.card === "light" ? 0.16 : 0.2) + tone.busy * 0.16;
  const tint = tone.card === "light" ? `rgba(255, 255, 255, ${tintAlpha.toFixed(3)})` : `rgba(16, 18, 22, ${tintAlpha.toFixed(3)})`;
  const halo = (target, strength) => strength < 0.05 ? "none" : `0 0 ${(4 + strength * 6).toFixed(1)}px rgba(${INK[target === "light" ? "dark" : "light"]}, ${(0.35 + strength * 0.4).toFixed(2)})`;
  return {
    "--toast-tint": tint,
    "--toast-rim": tone.card === "light" ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.22)",
    "--toast-title": `rgb(${INK[tone.title]})`,
    "--toast-body": `rgba(${INK[tone.body]}, 0.86)`,
    "--toast-meta": `rgba(${INK[tone.title]}, 0.58)`,
    "--toast-title-halo": halo(tone.title, tone.titleHalo),
    "--toast-body-halo": halo(tone.body, tone.bodyHalo),
    "--toast-hover": tone.card === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.14)"
  };
}
function initial(name) {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "?";
}
function Avatar({ card }) {
  const [failed, setFailed] = reactExports.useState(false);
  if (card.kind === "job") return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toast-avatar is-job", "data-tone": card.tone ?? "success", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("i", {}) });
  if (card.avatar && !failed) return /* @__PURE__ */ jsxRuntimeExports.jsx("img", { className: "toast-avatar", src: card.avatar, alt: "", draggable: false, onError: () => setFailed(true) });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toast-avatar is-initial", "aria-hidden": "true", children: initial(card.title) });
}
function ToastCard({ card, onOpen, onClose, onHover }) {
  const label = card.kind === "message" ? `${card.title}：${card.body}，点击打开会话` : `${card.title}：${card.body}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "toast-card",
      role: "button",
      tabIndex: -1,
      "aria-label": label,
      onClick: onOpen,
      onMouseEnter: () => onHover?.(true),
      onMouseLeave: () => onHover?.(false),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { card }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "toast-text", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "toast-head", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "toast-title", children: card.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("time", { className: "toast-time", children: card.time })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "toast-body", children: messageTextSegments(card.body).map((part) => part.kind === "text" ? /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, { children: part.text }, part.offset) : /* @__PURE__ */ jsxRuntimeExports.jsx("img", { className: "toast-emoji", src: part.src, alt: part.text, draggable: false }, part.offset)) }),
          card.more > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "toast-more", children: [
            "另有 ",
            card.more,
            " 个会话有新消息"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "toast-close", "aria-label": "关闭通知", onClick: (event) => {
          event.stopPropagation();
          onClose?.();
        }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 4l8 8M12 4l-8 8", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) }) })
      ]
    }
  );
}
const EXIT_MS = 260;
function layoutRect(element, root) {
  let x = 0;
  let y = 0;
  let node = element;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}
function localRect(element, card, root, id) {
  if (!(element instanceof HTMLElement)) return null;
  const rect = layoutRect(element, root);
  return { id, x: rect.x - card.x, y: rect.y - card.y, width: rect.width, height: rect.height };
}
function NotificationWindow() {
  const bridge = window.alphaNotification;
  const [card, setCard] = reactExports.useState(null);
  const [phase, setPhase] = reactExports.useState("measure");
  const [leaving, setLeaving] = reactExports.useState(null);
  const [tone, setTone] = reactExports.useState(() => initialGlassTone("light"));
  const [hovered, setHovered] = reactExports.useState(false);
  const root = reactExports.useRef(null);
  const current = reactExports.useRef({ card: null, phase: "measure" });
  current.current = { card, phase };
  reactExports.useEffect(() => {
    if (!bridge) return;
    const offShow = bridge.onShow((next) => {
      const shown = current.current;
      if (shown.card && shown.card.id !== next.id && shown.phase === "in") setLeaving(shown.card);
      setTone((previous) => next.surface === "liquid" && shown.card?.surface === "liquid" ? previous : initialGlassTone(next.theme));
      setCard(next);
      setPhase("measure");
      setHovered(false);
    });
    const offReveal = bridge.onReveal((id) => {
      if (current.current.card?.id === id) setPhase("in");
    });
    const offLuma = bridge.onLuma((luma) => setTone((previous) => nextGlassTone(previous, luma)));
    bridge.ready();
    return () => {
      offShow();
      offReveal();
      offLuma();
    };
  }, [bridge]);
  reactExports.useLayoutEffect(() => {
    if (!bridge || !card || phase !== "measure") return;
    {
      const element = root.current?.querySelector("[data-toast-current] .toast-card");
      if (!element || !root.current) return;
      const box = layoutRect(element, root.current);
      const bands = [
        { id: NOTIFICATION_BAND.card, x: 0, y: 0, width: box.width, height: box.height },
        localRect(element.querySelector(".toast-head"), box, root.current, NOTIFICATION_BAND.title),
        localRect(element.querySelector(".toast-body"), box, root.current, NOTIFICATION_BAND.body)
      ].filter((band) => band !== null && band.width > 0 && band.height > 0);
      const layout = { id: card.id, card: box, bands, height: root.current.scrollHeight };
      bridge.layout(layout);
    }
  }, [bridge, card, phase]);
  const leave = reactExports.useCallback(() => {
    const shown = current.current.card;
    if (!bridge || !shown || current.current.phase === "out") return;
    setPhase("out");
    bridge.hiding(shown.id);
    window.setTimeout(() => {
      if (current.current.card?.id !== shown.id) return;
      bridge.closed(shown.id);
      setCard(null);
    }, EXIT_MS);
  }, [bridge]);
  reactExports.useEffect(() => {
    if (!card || phase !== "in" || hovered) return;
    const timer = window.setTimeout(() => leave(), card.durationMs);
    return () => window.clearTimeout(timer);
  }, [card, phase, hovered, leave]);
  reactExports.useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), EXIT_MS + 60);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  if (!bridge) return null;
  const style = (card?.surface ?? "liquid") === "liquid" ? glassToneStyle(tone) : void 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: root,
      className: "toast-root",
      "data-position": card?.position ?? "top-right",
      "data-surface": card?.surface ?? "liquid",
      "data-theme": card?.theme ?? "light",
      style,
      children: [
        leaving && leaving.id !== card?.id && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "toast-slot is-leaving", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ToastCard, { card: leaving }) }),
        card && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "toast-slot", "data-toast-current": "", "data-phase": phase, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          ToastCard,
          {
            card,
            onHover: setHovered,
            onOpen: () => {
              bridge.activate(card.id);
              setCard(null);
            },
            onClose: () => leave()
          }
        ) })
      ]
    }
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(NotificationWindow, {}) })
);
