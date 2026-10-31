import { r as reactExports, j as jsxRuntimeExports, R as ReactDOM, a as React } from "./client-Bg2hQ5uk.js";
import { c as createLucideIcon, v as viewerMediaLocator, I as ImageOff, P as Play, L as LivePhotoIcon, T as Tooltip, a as PopoverLayer, b as TitleBar, o as onRovingKeyDown, u as useWindowChromeState, A as ArrowLeft, d as ArrowRight, e as LayoutGrid, R as RotateCw, D as Download, f as Pin, C as ChevronLeft, g as ChevronRight, h as CloudDownload, i as imageDataUrl, V as VIEWER_IMAGE_BASE64_LIMIT, j as IMAGE_VIEWER_FETCH_KINDS, M as MOMENT_VIEWER_MAX_ITEMS } from "./message-images-Dl-McHRQ.js";
const __iconNode$5 = [
  ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
  ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
  ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }]
];
const Ellipsis = createLucideIcon("ellipsis", __iconNode$5);
const __iconNode$4 = [
  ["path", { d: "M12 17v5", key: "bb1du9" }],
  ["path", { d: "M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89", key: "znwnzq" }],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }],
  [
    "path",
    {
      d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",
      key: "c9qhm2"
    }
  ]
];
const PinOff = createLucideIcon("pin-off", __iconNode$4);
const __iconNode$3 = [
  ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2", key: "aa7l1z" }],
  ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2", key: "4qcy5o" }],
  ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2", key: "6vwrx8" }],
  ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2", key: "ioqczr" }]
];
const Scan = createLucideIcon("scan", __iconNode$3);
const __iconNode$2 = [
  [
    "path",
    { d: "M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196", key: "w8jjjt" }
  ],
  ["path", { d: "M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2", key: "1xawa7" }],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }]
];
const VideoOff = createLucideIcon("video-off", __iconNode$2);
const __iconNode$1 = [
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
  ["line", { x1: "21", x2: "16.65", y1: "21", y2: "16.65", key: "13gj7c" }],
  ["line", { x1: "11", x2: "11", y1: "8", y2: "14", key: "1vmskp" }],
  ["line", { x1: "8", x2: "14", y1: "11", y2: "11", key: "durymu" }]
];
const ZoomIn = createLucideIcon("zoom-in", __iconNode$1);
const __iconNode = [
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
  ["line", { x1: "21", x2: "16.65", y1: "21", y2: "16.65", key: "13gj7c" }],
  ["line", { x1: "8", x2: "14", y1: "11", y2: "11", key: "durymu" }]
];
const ZoomOut = createLucideIcon("zoom-out", __iconNode);
function GalleryGrid({ session, items, index, onSelect, onClose }) {
  const panel = reactExports.useRef(null);
  reactExports.useEffect(() => {
    panel.current?.querySelector('[aria-current="true"]')?.focus({ preventScroll: false });
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: panel, className: "viewer-grid", role: "dialog", "aria-label": "全部图片", onKeyDown: (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "viewer-grid-items", children: items.map((item, position) => {
    const rendition = item.hasThumb ? "thumb" : item.kind === "image" && item.hasFull ? "full" : void 0;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        className: "viewer-grid-item",
        "aria-current": position === index,
        "aria-label": `第 ${position + 1} 个，共 ${items.length} 个${item.kind === "video" ? "（视频）" : item.hasLive ? "（实况）" : ""}`,
        onClick: () => onSelect(position),
        children: [
          rendition ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: viewerMediaLocator(session, position, rendition), alt: "", loading: "lazy", decoding: "async", draggable: false }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ImageOff, { size: 20, "aria-hidden": "true" }),
          item.kind === "video" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "viewer-grid-badge", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 12, fill: "currentColor" }) }),
          item.hasLive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "viewer-grid-badge", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LivePhotoIcon, { size: 14 }) })
        ]
      },
      position
    );
  }) }) });
}
function ZoomHud({ zooms, percent }) {
  return zooms ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "viewer-hud", "aria-hidden": "true", children: [
    percent,
    "%"
  ] }, zooms) : null;
}
const FEEDBACK_MS = 2600;
function ViewerToast({ notice, feedback }) {
  const [current, setCurrent] = reactExports.useState();
  reactExports.useEffect(() => {
    if (!feedback) return;
    setCurrent(feedback);
    const timer = window.setTimeout(() => setCurrent((value) => value?.key === feedback.key ? void 0 : value), FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const message = current ?? (notice ? { text: notice, tone: "info", key: 0 } : void 0);
  return message ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "viewer-toast", "data-tone": message.tone, role: "status", children: message.text }, `${message.key}:${message.text}`) : null;
}
function ViewerStatus({ loading, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "viewer-status", role: "status", children: [
    loading && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "viewer-spinner", "aria-hidden": "true" }),
    children
  ] });
}
function GalleryVideo({ src, poster, label, videoRef, entry, onRetry }) {
  const [status, setStatus] = reactExports.useState("loading");
  if (!src) return /* @__PURE__ */ jsxRuntimeExports.jsxs(ViewerStatus, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(VideoOff, { size: 28, "aria-hidden": "true" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "视频暂不可用" })
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "video",
      {
        ref: videoRef,
        className: "viewer-video",
        controls: true,
        autoPlay: true,
        playsInline: true,
        src,
        poster,
        "aria-label": label,
        "data-enter": entry,
        onLoadedData: () => setStatus("ready"),
        onError: () => setStatus("failed"),
        hidden: status === "failed"
      }
    ),
    status === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "viewer-video-loading", role: "status", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "viewer-spinner", "aria-hidden": "true" }),
      "视频加载中…"
    ] }),
    status === "failed" && /* @__PURE__ */ jsxRuntimeExports.jsxs(ViewerStatus, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(VideoOff, { size: 28, "aria-hidden": "true" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "视频暂时无法播放" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onRetry, children: "重试" })
    ] })
  ] });
}
const LIVE_FADE_MS = 300;
function useLivePhoto(key, live) {
  const [playing, setPlaying] = reactExports.useState();
  const [visible, setVisible] = reactExports.useState();
  const [failed, setFailed] = reactExports.useState();
  const fading = reactExports.useRef(void 0);
  reactExports.useEffect(() => {
    setPlaying(void 0);
    setVisible(void 0);
    setFailed(void 0);
  }, [key]);
  reactExports.useEffect(() => () => window.clearTimeout(fading.current), []);
  const ready = live === "ready" && key !== void 0;
  const active = ready && playing === key;
  const stop = () => {
    setVisible(void 0);
    window.clearTimeout(fading.current);
    fading.current = window.setTimeout(() => setPlaying((current) => current === key ? void 0 : current), LIVE_FADE_MS);
  };
  return {
    live,
    playing: active,
    visible: active && visible === key,
    failed: failed !== void 0 && failed === key,
    toggle: () => {
      if (!ready) return;
      if (active) {
        stop();
        return;
      }
      window.clearTimeout(fading.current);
      setFailed(void 0);
      setPlaying(key);
    },
    shown: () => {
      if (active) setVisible(key);
    },
    stop,
    fail: () => {
      window.clearTimeout(fading.current);
      setPlaying(void 0);
      setVisible(void 0);
      setFailed(key);
    }
  };
}
function LivePhotoButton({ control }) {
  if (!control.live) return null;
  const missing = control.live === "missing";
  const waiting = control.playing && !control.visible;
  const tip = missing ? "本机没有保存这张实况照片的视频" : control.playing ? "显示照片（空格）" : "播放实况（空格）";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: tip, describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      className: "viewer-live",
      "aria-pressed": control.playing,
      "aria-busy": waiting || void 0,
      "aria-disabled": missing || void 0,
      "data-missing": missing || void 0,
      "aria-label": missing ? "实况视频不在本机" : control.playing ? "显示照片" : "播放实况",
      onClick: missing ? void 0 : control.toggle,
      children: [
        waiting ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "viewer-spinner", "aria-hidden": "true" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(LivePhotoIcon, { size: 16 }),
        "实况"
      ]
    }
  ) });
}
function LivePhotoLayer({ src, size, transform, animate, label, control }) {
  const video = reactExports.useRef(null);
  const { playing, shown, stop, fail } = control;
  reactExports.useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!playing) {
      element.pause();
      return;
    }
    element.currentTime = 0;
    void element.play().catch(() => {
      if (!element.error) return;
      fail();
    });
  }, [playing]);
  const style = { width: size.width, height: size.height, transform: `translate(-50%, -50%) ${transform}` };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "video",
    {
      ref: video,
      className: "viewer-live-video",
      src,
      preload: "auto",
      playsInline: true,
      disablePictureInPicture: true,
      "aria-label": `${label}（实况）`,
      "aria-hidden": !control.visible,
      "data-visible": control.visible || void 0,
      "data-animate": animate || void 0,
      style,
      onPlaying: shown,
      onEnded: stop,
      onError: () => {
        if (playing) fail();
      }
    }
  );
}
const TOOL_SLOT = 40;
const GROUP_RULE = 17;
const DRAG_ROOM = 64;
function layoutTools(tools, width) {
  const room = width - DRAG_ROOM;
  let used = 0, count = 0;
  for (const [index, tool] of tools.entries()) {
    const rule = index > 0 && tool.group !== tools[index - 1].group ? GROUP_RULE : 0;
    if (used + rule + TOOL_SLOT > room) break;
    used += rule + TOOL_SLOT;
    count++;
  }
  return { inline: tools.slice(0, count), overflow: tools.slice(count) };
}
function moveFocus(event) {
  const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')];
  const index = items.indexOf(document.activeElement);
  const next = event.key === "ArrowDown" ? items[(index + 1) % items.length] : event.key === "ArrowUp" ? items[(index - 1 + items.length) % items.length] : event.key === "Home" ? items[0] : event.key === "End" ? items[items.length - 1] : void 0;
  if (!next) return;
  event.preventDefault();
  event.stopPropagation();
  next.focus();
}
function ViewerMenu({ sections }) {
  const [open, setOpen] = reactExports.useState(false);
  const anchor = reactExports.useRef(null);
  const list = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => list.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const close = (refocus) => {
    setOpen(false);
    if (refocus) anchor.current?.focus({ preventScroll: true });
  };
  const groups = sections.filter((section) => section.length);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: "更多", placement: "bottom", describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        ref: anchor,
        type: "button",
        className: "viewer-tool",
        "aria-label": "更多",
        "aria-haspopup": "menu",
        "aria-expanded": open,
        onClick: () => setOpen((value) => !value),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Ellipsis, { size: 18 })
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      PopoverLayer,
      {
        open,
        anchor,
        label: "更多操作",
        role: "presentation",
        className: "viewer-menu",
        onDismiss: (reason) => close(reason === "escape"),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: list, role: "menu", "aria-label": "更多操作", onKeyDown: moveFocus, children: groups.map((section, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, { children: [
          index > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "viewer-menu-rule", role: "separator" }),
          section.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              role: "menuitem",
              className: "viewer-menu-item",
              disabled: item.disabled,
              onClick: () => {
                close(true);
                item.onSelect();
              },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "viewer-menu-icon", "aria-hidden": "true", children: item.icon }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: item.label }),
                item.shortcut && /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: item.shortcut })
              ]
            },
            item.id
          ))
        ] }, section[0].id)) })
      }
    )
  ] });
}
function ViewerToolbar({ tools, menu }) {
  const frame = reactExports.useRef(null);
  const [width, setWidth] = reactExports.useState(Number.POSITIVE_INFINITY);
  reactExports.useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { inline, overflow } = layoutTools(tools, width);
  const sections = [overflow.map(({ id, label, icon, shortcut, disabled, onSelect }) => ({ id, label, icon, shortcut, disabled, onSelect })), ...menu];
  const metrics = { "--tool-slot": `${TOOL_SLOT}px`, "--group-rule": `${GROUP_RULE}px` };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(TitleBar, { bridge: window.alphaImageViewer?.windowChrome, className: "viewer-toolbar", leading: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: frame, className: "viewer-tools-frame", style: metrics, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "viewer-tools", role: "toolbar", "aria-label": "图片查看工具", onKeyDown: onRovingKeyDown, children: inline.map((tool, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, { children: [
    index > 0 && tool.group !== inline[index - 1].group && /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "viewer-tool-rule", "aria-hidden": "true" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: tool.shortcut ? `${tool.label}（${tool.shortcut}）` : tool.label, placement: "bottom", describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "viewer-tool", "aria-label": tool.label, "aria-pressed": tool.pressed, disabled: tool.disabled, onClick: tool.onSelect, children: tool.icon }) })
  ] }, tool.id)) }) }), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "viewer-tools-end", style: metrics, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerMenu, { sections }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "viewer-tool-rule viewer-controls-rule", "aria-hidden": "true" })
  ] }) });
}
function useDecodedImage(session, src) {
  const [decoded, setDecoded] = reactExports.useState();
  const [failedSource, setFailedSource] = reactExports.useState();
  reactExports.useEffect(() => {
    setFailedSource(void 0);
    if (!session || !src) {
      setDecoded(void 0);
      return;
    }
    setDecoded((current2) => current2?.session === session ? current2 : void 0);
    let live = true;
    const image = new Image();
    image.src = src;
    image.decode().then(
      () => {
        if (live) setDecoded({ session, src, size: { width: image.naturalWidth, height: image.naturalHeight } });
      },
      () => {
        if (live) setFailedSource({ session, src });
      }
    );
    return () => {
      live = false;
    };
  }, [session, src]);
  const current = src && decoded?.session === session ? decoded : void 0;
  return { src: current?.src, size: current?.size, failed: Boolean(failedSource && failedSource.session === session && failedSource.src === src) };
}
const ACTION_LABEL = { save: "保存", copy: "复制", open: "打开", locate: "定位", previous: "上一张", next: "下一张", fetch: "从微信下载" };
function viewerActionFeedback(action, result) {
  if (result.status === "cancelled") return void 0;
  if (result.status === "done") {
    switch (action) {
      case "save":
        return { text: result.fileName ? `已保存：${result.fileName}` : "已保存", tone: "done" };
      case "copy":
        return { text: "已复制图片", tone: "done" };
      case "open":
        return { text: "已用系统默认方式打开", tone: "done" };
      case "locate":
      case "previous":
      case "next":
      case "fetch":
        return void 0;
    }
  }
  return { text: viewerFailureText(action, result.code), tone: "error" };
}
function viewerFailureText(action, code) {
  if (code === "APP_LOCK_LOCKED") return "Alpha 已锁定，解锁后再试";
  if (code === "UPDATE_OPERATION_GATE") return "请先完成 Alpha 更新";
  if (code === "IMAGE_VIEWER_ACTION_BUSY") return "上一项操作还没有完成";
  if (code === "IMAGE_VIEWER_SAVE_EXISTS") return "已有同名文件，请换一个名字";
  if (code === "IMAGE_VIEWER_FORMAT_INVALID" || code === "IMAGE_VIEWER_CONTENT_INVALID") return `这张图片的格式无法${ACTION_LABEL[action]}`;
  if (code === "IMAGE_VIEWER_OPEN_FAILED") return "系统中没有能打开这张图片的程序";
  if (code === "IMAGE_VIEWER_LOCATE_UNAVAILABLE") return "Alpha 主窗口未打开，无法定位";
  if (code === "IMAGE_VIEWER_FETCH_UNAVAILABLE") return "Alpha 主窗口未打开，无法从微信下载";
  if (/^IMAGE_CACHE_|^IMAGE_VIEWER_ACTION_(UNAVAILABLE|INVALID)$/.test(code)) return "这张图片已失效，请回到聊天重新打开";
  return `${ACTION_LABEL[action]}失败，请重试`;
}
function visibleCentre(element, bounds) {
  if (!element || !bounds) return void 0;
  const box = element.getBoundingClientRect();
  const left = Math.max(box.left, bounds.left), right = Math.min(box.right, bounds.right);
  const top = Math.max(box.top, bounds.top), bottom = Math.min(box.bottom, bounds.bottom);
  if (right - left < 1 || bottom - top < 1) return void 0;
  return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
}
function useViewerActions(session, index, picture, stage) {
  const [busy, setBusy] = reactExports.useState(false);
  const [feedback, setFeedback] = reactExports.useState();
  const counter = reactExports.useRef(0);
  const current = reactExports.useRef(session);
  current.current = session;
  reactExports.useEffect(() => setFeedback(void 0), [session]);
  const run = async (action) => {
    const act = window.alphaImageViewer?.act;
    if (!act || !session) return;
    const point = action === "copy" ? visibleCentre(picture.current, stage.current?.getBoundingClientRect()) : void 0;
    if (action === "copy" && !point) return;
    const file = action === "save" || action === "open";
    if (file) setBusy(true);
    let said;
    try {
      said = viewerActionFeedback(action, await act({ session, action, ...index !== void 0 ? { index } : {}, ...point ? { point } : {} }));
    } catch {
      said = viewerActionFeedback(action, { status: "failed", code: "" });
    } finally {
      if (file) setBusy(false);
    }
    if (said && current.current === session) setFeedback({ ...said, key: ++counter.current });
  };
  return {
    busy,
    feedback,
    save: () => {
      void run("save");
    },
    copy: () => {
      void run("copy");
    },
    open: () => {
      void run("open");
    },
    locate: () => {
      void run("locate");
    },
    print: () => window.print()
  };
}
function useViewerPin() {
  const chrome = window.alphaImageViewer?.windowChrome;
  const { pinned } = useWindowChromeState(chrome);
  return { pinned, toggle: () => {
    void chrome?.control("toggle-pin").catch(() => void 0);
  } };
}
const INITIAL_TRANSFORM = { scale: 1, rotation: 0, x: 0, y: 0 };
const BUTTON_ZOOM = 1.25;
const WHEEL_ZOOM = 1.15;
const quarterTurned = (rotation) => Math.abs(rotation % 180) === 90;
function fitScale(image, viewport, rotation) {
  if (!(image.width > 0 && image.height > 0 && viewport.width > 0 && viewport.height > 0)) return 1;
  const [width, height] = quarterTurned(rotation) ? [image.height, image.width] : [image.width, image.height];
  return Math.min(viewport.width * 0.9 / width, viewport.height * 0.9 / height, 1);
}
function clampScale(scale, fit) {
  return Math.min(Math.max(scale, 0.1), Math.max(10, 8 / fit));
}
function zoomAt(transform, factor, fit, point = { x: 0, y: 0 }) {
  const scale = clampScale(transform.scale * factor, fit);
  const applied = scale / transform.scale;
  return { ...transform, scale, x: point.x - (point.x - transform.x) * applied, y: point.y - (point.y - transform.y) * applied };
}
function rotate(transform, quarterTurns) {
  return { ...transform, rotation: transform.rotation + quarterTurns * 90 };
}
function actualSize(transform, fit) {
  return { ...transform, scale: 1 / fit, x: 0, y: 0 };
}
function fitTransform(transform) {
  return { ...INITIAL_TRANSFORM, rotation: transform.rotation };
}
function isActualSize(transform, fit) {
  return Math.abs(transform.scale * fit - 1) < 1e-3;
}
function isFitted(transform) {
  return Math.abs(transform.scale - 1) < 1e-3 && transform.x === 0 && transform.y === 0;
}
function shownSize(transform, fit, image) {
  const [width, height] = quarterTurned(transform.rotation) ? [image.height, image.width] : [image.width, image.height];
  return { width: width * fit * transform.scale, height: height * fit * transform.scale };
}
function isPannable(transform, fit, image, viewport) {
  const shown = shownSize(transform, fit, image);
  return viewport.width > 0 && (shown.width > viewport.width + 1 || shown.height > viewport.height + 1);
}
function clampPan(transform, fit, image, viewport) {
  if (!(image.width > 0 && image.height > 0 && viewport.width > 0 && viewport.height > 0)) return transform;
  const shown = shownSize(transform, fit, image);
  const limitX = Math.max(0, (shown.width - viewport.width) / 2), limitY = Math.max(0, (shown.height - viewport.height) / 2);
  const x = Math.min(limitX, Math.max(-limitX, transform.x)) || 0, y = Math.min(limitY, Math.max(-limitY, transform.y)) || 0;
  return x === transform.x && y === transform.y ? transform : { ...transform, x, y };
}
function toggleZoom(transform, fit, point = { x: 0, y: 0 }) {
  if (!isFitted(transform)) return fitTransform(transform);
  return zoomAt(transform, fit < 1 ? 1 / fit : 2, fit, point);
}
function transformStyle({ scale, rotation, x, y }, fit) {
  return `translate(${x}px, ${y}px) scale(${scale * fit}) rotate(${rotation}deg)`;
}
function viewerKeyAction(event) {
  if (event.altKey) return void 0;
  if (event.ctrlKey || event.metaKey) {
    if (event.shiftKey) return void 0;
    switch (event.key.toLowerCase()) {
      case "c":
        return "copy";
      case "s":
        return "save";
      case "p":
        return "print";
      default:
        return void 0;
    }
  }
  switch (event.key) {
    case "Escape":
      return "close";
    case "+":
    case "=":
      return "zoom-in";
    case "-":
    case "_":
      return "zoom-out";
    case "r":
    case "R":
      return event.shiftKey ? "rotate-ccw" : "rotate-cw";
    case "0":
      return "fit";
    case "1":
      return "actual";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case "ArrowRight":
    case "PageDown":
      return "next";
    case " ":
      return "play";
    default:
      return void 0;
  }
}
function useViewerKeys(handle) {
  const latest = reactExports.useRef(handle);
  latest.current = handle;
  reactExports.useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="menu"], .viewer-grid, input, textarea')) return;
      const action = viewerKeyAction(event);
      if (action && latest.current(action, target) !== false) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
const NO_SIZE = { width: 0, height: 0 };
function useViewerTransform(session, image = NO_SIZE) {
  const viewport = reactExports.useRef(null);
  const drag = reactExports.useRef(void 0);
  const [view, setView] = reactExports.useState({ transform: INITIAL_TRANSFORM, animate: false, zooms: 0 });
  const [area, setArea] = reactExports.useState(NO_SIZE);
  reactExports.useEffect(() => setView({ transform: INITIAL_TRANSFORM, animate: false, zooms: 0 }), [session]);
  reactExports.useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setArea((current) => current.width === element.clientWidth && current.height === element.clientHeight ? current : { width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { transform, animate, zooms } = view;
  const fit = fitScale(image, area, transform.rotation);
  const settle = (next) => clampPan(next, fitScale(image, area, next.rotation), image, area);
  const change = (update, animated) => setView((current) => {
    const next = settle(update(current.transform));
    return { transform: next, animate: animated, zooms: next.scale === current.transform.scale ? current.zooms : current.zooms + 1 };
  });
  reactExports.useEffect(() => {
    setView((current) => ({ ...current, transform: settle(current.transform) }));
  }, [area.width, area.height, image.width, image.height]);
  const centreOffset = (event) => {
    const box = viewport.current.getBoundingClientRect();
    return { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
  };
  const zoomIn = () => change((current) => zoomAt(current, BUTTON_ZOOM, fit), true);
  const zoomOut = () => change((current) => zoomAt(current, 1 / BUTTON_ZOOM, fit), true);
  const rotateCw = () => change((current) => rotate(current, 1), true);
  const rotateCcw = () => change((current) => rotate(current, -1), true);
  const fitWindow = () => change(fitTransform, true);
  const actual = () => change((current) => actualSize(current, fit), true);
  const atActual = isActualSize(transform, fit);
  const toggleActual = () => atActual ? fitWindow() : actual();
  const actions = { "zoom-in": zoomIn, "zoom-out": zoomOut, "rotate-cw": rotateCw, "rotate-ccw": rotateCcw, fit: fitWindow, actual };
  const pannable = isPannable(transform, fit, image, area);
  return {
    viewport,
    transform,
    fit,
    animate,
    zooms,
    pannable,
    atActual,
    actions,
    zoomIn,
    zoomOut,
    rotateCw,
    rotateCcw,
    fitWindow,
    actual,
    toggleActual,
    /** The picture's scale against its own pixels, as a whole percentage. */
    percent: Math.round(transform.scale * fit * 100),
    onWheel: (event) => {
      if (!event.deltaY) return;
      const point = centreOffset(event);
      change((current) => zoomAt(current, event.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM, fit, point), false);
    },
    onDoubleClick: (event) => {
      const point = centreOffset(event);
      change((current) => toggleZoom(current, fit, point), true);
    },
    onPointerDown: (event) => {
      if (event.button !== 0 || !pannable) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: transform.x, startY: transform.y };
    },
    onPointerMove: (event) => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId) return;
      change((current) => ({ ...current, x: start.startX + event.clientX - start.x, y: start.startY + event.clientY - start.y }), false);
    },
    onPointerUp: (event) => {
      if (drag.current?.pointer === event.pointerId) drag.current = void 0;
    }
  };
}
function ActualSizeIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2.5" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 10v5M7 10.6l1-.6M15.5 10v5M14.5 10.6l1-.6" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11.75 11h.01M11.75 14h.01", strokeWidth: "2.2" })
  ] });
}
function viewerTools({ view, picture, pinned, onPin, gallery, actions, locatable }) {
  const tools = [
    { id: "pin", group: 0, label: pinned ? "取消置顶" : "置顶", icon: pinned ? /* @__PURE__ */ jsxRuntimeExports.jsx(PinOff, { size: 18 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Pin, { size: 18 }), pressed: pinned, onSelect: onPin }
  ];
  if (gallery) tools.push(
    { id: "prev", group: 1, label: "上一张", shortcut: "←", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { size: 18 }), disabled: gallery.index <= 0, onSelect: gallery.onPrev },
    { id: "next", group: 1, label: "下一张", shortcut: "→", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { size: 18 }), disabled: gallery.index >= gallery.count - 1, onSelect: gallery.onNext },
    { id: "grid", group: 1, label: "全部图片", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutGrid, { size: 18 }), pressed: gallery.gridOpen, onSelect: gallery.onGrid }
  );
  tools.push(
    { id: "zoom-in", group: 2, label: "放大", shortcut: "+", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ZoomIn, { size: 18 }), disabled: !picture, onSelect: view.zoomIn },
    { id: "zoom-out", group: 2, label: "缩小", shortcut: "-", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ZoomOut, { size: 18 }), disabled: !picture, onSelect: view.zoomOut },
    view.atActual ? { id: "actual", group: 2, label: "适应窗口", shortcut: "0", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Scan, { size: 18 }), disabled: !picture, onSelect: view.toggleActual } : { id: "actual", group: 2, label: "原始大小", shortcut: "1", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ActualSizeIcon, {}), disabled: !picture, onSelect: view.toggleActual },
    { id: "rotate", group: 3, label: "旋转", shortcut: "R", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCw, { size: 18 }), disabled: !picture, onSelect: view.rotateCw },
    { id: "save", group: 4, label: "保存", shortcut: "Ctrl+S", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { size: 18 }), disabled: !picture || actions.busy, onSelect: actions.save }
  );
  const menu = [[
    { id: "copy", label: "复制", shortcut: "Ctrl+C", disabled: !picture, onSelect: actions.copy },
    { id: "print", label: "打印", shortcut: "Ctrl+P", disabled: !picture, onSelect: actions.print }
  ]];
  if (locatable) menu.push([{ id: "locate", label: "定位到聊天位置", onSelect: actions.locate }]);
  menu.push([{ id: "open", label: "使用系统默认方式打开", disabled: !picture || actions.busy, onSelect: actions.open }]);
  return { tools, menu };
}
function GalleryViewer({ state, gallery, onStep, onJump }) {
  const { index, items } = gallery;
  const item = items[index];
  const isVideo = item.kind === "video";
  const [attempt, setAttempt] = reactExports.useState(0);
  const [gridOpen, setGridOpen] = reactExports.useState(false);
  const [entry, setEntry] = reactExports.useState();
  const itemKey = `${state.session}:${index}`;
  const decodeKey = isVideo ? void 0 : `${itemKey}:${attempt}`;
  const thumbSrc = item.hasThumb ? viewerMediaLocator(state.session, index, "thumb") : void 0;
  const fullSrc = item.hasFull ? viewerMediaLocator(state.session, index, "full") : void 0;
  const thumb = useDecodedImage(decodeKey, thumbSrc);
  const full = useDecodedImage(decodeKey, fullSrc);
  const shown = full.src ? full : thumb.src ? thumb : void 0;
  const view = useViewerTransform(itemKey, shown?.size);
  const video = reactExports.useRef(null);
  const picture = reactExports.useRef(null);
  const actions = useViewerActions(state.session, index, picture, view.viewport);
  const pin = useViewerPin();
  const live = useLivePhoto(itemKey, !isVideo && item.hasLive ? "ready" : void 0);
  const imageFailed = !isVideo && (!fullSrc || full.failed) && (!thumbSrc || thumb.failed);
  const fullFailed = !isVideo && Boolean(fullSrc && full.failed && thumb.src);
  const ready = !isVideo && Boolean(shown) && !gridOpen;
  const step = (delta) => {
    if (delta < 0 ? index <= 0 : index >= items.length - 1) return;
    setEntry(delta > 0 ? "next" : "prev");
    onStep(delta);
  };
  const jump = (target) => {
    setGridOpen(false);
    if (target === index) return;
    setEntry(target > index ? "next" : "prev");
    onJump(target);
  };
  useViewerKeys((action, target) => {
    if (action === "close") {
      if (gridOpen) setGridOpen(false);
      else window.close();
      return;
    }
    if (action === "prev" || action === "next") {
      if (target?.closest("video")) return false;
      step(action === "prev" ? -1 : 1);
      return;
    }
    if (action === "play") {
      if (!isVideo) {
        if (live.live !== "ready" || gridOpen || target?.closest("button")) return false;
        live.toggle();
        return;
      }
      if (!video.current || target?.closest("button, video")) return false;
      if (video.current.paused) void video.current.play().catch(() => void 0);
      else video.current.pause();
      return;
    }
    if (action === "copy" || action === "save" || action === "print") {
      if (ready) actions[action]();
      return;
    }
    const run = view.actions[action];
    if (!run || isVideo) return false;
    if (ready) run();
  });
  const retry = () => setAttempt((value) => value + 1);
  const { tools, menu } = viewerTools({
    view,
    picture: ready,
    pinned: pin.pinned,
    onPin: pin.toggle,
    actions,
    locatable: false,
    gallery: { index, count: items.length, onPrev: () => step(-1), onNext: () => step(1), onGrid: () => setGridOpen((value) => !value), gridOpen }
  });
  const notice = live.failed ? "实况视频暂时无法播放。" : fullFailed ? "原图暂时无法读取，当前显示预览图。" : state.notice;
  const gestures = isVideo || !shown ? {} : {
    onWheel: view.onWheel,
    onDoubleClick: view.onDoubleClick,
    onPointerDown: view.onPointerDown,
    onPointerMove: view.onPointerMove,
    onPointerUp: view.onPointerUp,
    onPointerCancel: view.onPointerUp
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerToolbar, { tools, menu }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "viewer-stage", "data-counter": items.length > 1 ? "true" : void 0, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { ref: view.viewport, className: isVideo ? "viewer-viewport is-video" : "viewer-viewport", "data-pannable": view.pannable && !isVideo ? "true" : void 0, ...gestures, children: [
        isVideo ? /* @__PURE__ */ jsxRuntimeExports.jsx(GalleryVideo, { src: fullSrc, poster: thumbSrc, label: state.label, videoRef: video, entry, onRetry: retry }, `${itemKey}:${attempt}`) : shown ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            ref: picture,
            className: "viewer-image",
            src: shown.src,
            alt: state.label,
            draggable: false,
            "data-enter": entry,
            "data-animate": view.animate ? "true" : void 0,
            style: { transform: transformStyle(view.transform, view.fit) }
          },
          itemKey
        ) : imageFailed ? /* @__PURE__ */ jsxRuntimeExports.jsxs(ViewerStatus, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ImageOff, { size: 28, "aria-hidden": "true" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "图片暂时无法读取" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: retry, children: "重试" })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerStatus, { loading: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "图片加载中…" }) }),
        !isVideo && item.hasLive && shown?.size && !gridOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
          LivePhotoLayer,
          {
            src: viewerMediaLocator(state.session, index, "live"),
            size: shown.size,
            transform: transformStyle(view.transform, view.fit),
            animate: view.animate,
            label: state.label,
            control: live
          },
          itemKey
        )
      ] }),
      index > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: "上一张（←）", describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "viewer-edge is-prev", onClick: () => step(-1), "aria-label": "上一张", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { size: 24 }) }) }),
      index < items.length - 1 && /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: "下一张（→）", describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "viewer-edge is-next", onClick: () => step(1), "aria-label": "下一张", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 24 }) }) }),
      items.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "viewer-counter", "aria-live": "polite", children: [
        index + 1,
        " / ",
        items.length
      ] }),
      shown && /* @__PURE__ */ jsxRuntimeExports.jsx(LivePhotoButton, { control: live }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ZoomHud, { zooms: view.zooms, percent: view.percent }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerToast, { notice, feedback: actions.feedback }),
      gridOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(GalleryGrid, { session: state.session, items, index, onSelect: jump, onClose: () => setGridOpen(false) })
    ] })
  ] });
}
function ViewerFetchButton({ session, fetch, live }) {
  const kind = live === "missing" && fetch.kinds.includes("live_clip") ? "live_clip" : fetch.kinds.includes("original_image") ? "original_image" : void 0;
  if (!kind) return null;
  const label = fetch.running ? "正在从微信下载…" : kind === "live_clip" ? "从微信下载实况视频" : "从微信下载原图";
  const tip = fetch.running ? "用这台电脑上登录的微信下载中" : "本机没有，用这台电脑上登录的微信下载（高级功能）";
  const request = () => {
    const act = window.alphaImageViewer?.act;
    if (!fetch.running && act) void act({ session, action: "fetch", fetch: kind }).catch(() => void 0);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: tip, describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "viewer-fetch", "aria-busy": fetch.running || void 0, "aria-disabled": fetch.running || void 0, onClick: request, children: [
    fetch.running ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "viewer-spinner", "aria-hidden": "true" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CloudDownload, { size: 15, "aria-hidden": "true" }),
    label
  ] }) });
}
function validGallery(gallery) {
  return Array.isArray(gallery.items) && gallery.items.length > 0 && gallery.items.length <= MOMENT_VIEWER_MAX_ITEMS && Number.isInteger(gallery.index) && gallery.index >= 0 && gallery.index < gallery.items.length && gallery.items.every((item) => (item.kind === "image" || item.kind === "video") && (item.hasThumb || item.hasFull));
}
function nextViewerState(current, payload) {
  let src = current?.session === payload.session ? current.src : void 0;
  let notice = payload.notice;
  if (payload.image) {
    try {
      src = imageDataUrl(payload.image, VIEWER_IMAGE_BASE64_LIMIT);
    } catch {
      notice = "图片返回格式无效，无法显示。";
    }
  }
  let gallery = current?.session === payload.session ? current.gallery : void 0;
  if (payload.gallery) {
    if (validGallery(payload.gallery)) gallery = { items: payload.gallery.items, index: payload.gallery.index };
    else notice = "媒体列表无效，无法显示。";
  }
  const theme = payload.theme ?? current?.theme;
  const locatable = payload.locatable === true || current?.session === payload.session && current.locatable === true;
  const steps = payload.steps ?? (current?.session === payload.session ? current.steps : void 0);
  const live = !gallery && (payload.live === "ready" || payload.live === "missing") ? payload.live : void 0;
  const fetch = !gallery && payload.fetch && typeof payload.fetch.running === "boolean" && Array.isArray(payload.fetch.kinds) && payload.fetch.kinds.length && payload.fetch.kinds.every((kind) => IMAGE_VIEWER_FETCH_KINDS.includes(kind)) ? payload.fetch : void 0;
  return {
    session: payload.session,
    label: payload.label,
    notice,
    src,
    ...theme ? { theme } : {},
    ...locatable ? { locatable: true } : {},
    ...steps && !gallery ? { steps } : {},
    ...gallery ? { gallery } : {},
    ...live ? { live } : {},
    ...fetch ? { fetch } : {}
  };
}
function stepGallery(state, delta) {
  const gallery = state.gallery;
  if (!gallery) return state;
  const index = Math.min(Math.max(gallery.index + delta, 0), gallery.items.length - 1);
  return index === gallery.index ? state : { ...state, gallery: { ...gallery, index } };
}
function jumpGallery(state, index) {
  const gallery = state.gallery;
  if (!gallery || !Number.isInteger(index) || index < 0 || index >= gallery.items.length || index === gallery.index) return state;
  return { ...state, gallery: { ...gallery, index } };
}
function ImageViewer() {
  const [state, setState] = reactExports.useState();
  reactExports.useEffect(() => window.alphaImageViewer?.subscribe((payload) => setState((current) => nextViewerState(current, payload))), []);
  reactExports.useEffect(() => {
    document.title = state ? `${state.label} - 图片查看` : "图片查看";
  }, [state?.label]);
  reactExports.useEffect(() => {
    const theme = state?.theme ?? "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [state?.theme]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "viewer", children: state?.gallery ? /* @__PURE__ */ jsxRuntimeExports.jsx(
    GalleryViewer,
    {
      state,
      gallery: state.gallery,
      onStep: (delta) => setState((current) => current && stepGallery(current, delta)),
      onJump: (index) => setState((current) => current && jumpGallery(current, index))
    }
  ) : /* @__PURE__ */ jsxRuntimeExports.jsx(SingleImageViewer, { state }) });
}
function SingleImageViewer({ state }) {
  const image = useDecodedImage(state?.session, state?.src);
  const view = useViewerTransform(state?.session, image.size);
  const picture = reactExports.useRef(null);
  const actions = useViewerActions(state?.session, void 0, picture, view.viewport);
  const pin = useViewerPin();
  const live = useLivePhoto(state?.session, state?.live);
  const shown = Boolean(image.src);
  const steps = state?.steps;
  const step = (direction) => {
    const act = window.alphaImageViewer?.act;
    if (act && state && steps?.[direction]) void act({ session: state.session, action: direction }).catch(() => void 0);
  };
  useViewerKeys((action, target) => {
    if (action === "close") {
      window.close();
      return;
    }
    if (action === "play") {
      if (live.live !== "ready" || !image.src || target?.closest("button")) return false;
      live.toggle();
      return;
    }
    if (action === "prev" || action === "next") {
      const direction = action === "prev" ? "previous" : "next";
      if (!steps?.[direction]) return false;
      step(direction);
      return;
    }
    if (action === "copy" || action === "save" || action === "print") {
      if (shown) actions[action]();
      return;
    }
    const run = view.actions[action];
    if (!run) return false;
    if (shown) run();
  });
  const { tools, menu } = viewerTools({ view, picture: shown, pinned: pin.pinned, onPin: pin.toggle, actions, locatable: state?.locatable === true });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerToolbar, { tools, menu }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "viewer-stage", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "main",
        {
          ref: view.viewport,
          className: "viewer-viewport",
          "data-pannable": view.pannable ? "true" : void 0,
          onWheel: view.onWheel,
          onDoubleClick: view.onDoubleClick,
          onPointerDown: view.onPointerDown,
          onPointerMove: view.onPointerMove,
          onPointerUp: view.onPointerUp,
          onPointerCancel: view.onPointerUp,
          children: [
            image.src ? /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                ref: picture,
                className: "viewer-image",
                src: image.src,
                alt: state?.label ?? "图片",
                draggable: false,
                "data-animate": view.animate ? "true" : void 0,
                style: { transform: transformStyle(view.transform, view.fit) }
              },
              state?.session
            ) : image.failed ? /* @__PURE__ */ jsxRuntimeExports.jsxs(ViewerStatus, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ImageOff, { size: 28, "aria-hidden": "true" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "此图片格式无法预览" })
            ] }) : state ? /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerStatus, { loading: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "图片加载中…" }) }) : null,
            state && live.live === "ready" && image.size && /* @__PURE__ */ jsxRuntimeExports.jsx(
              LivePhotoLayer,
              {
                src: viewerMediaLocator(state.session, 0, "live"),
                size: image.size,
                transform: transformStyle(view.transform, view.fit),
                animate: view.animate,
                label: state.label,
                control: live
              },
              state.session
            )
          ]
        }
      ),
      steps?.previous && /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: "上一张（←）", describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "viewer-edge is-prev", onClick: () => step("previous"), "aria-label": "上一张", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { size: 24 }) }) }),
      steps?.next && /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { content: "下一张（→）", describe: false, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "viewer-edge is-next", onClick: () => step("next"), "aria-label": "下一张", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 24 }) }) }),
      image.src && /* @__PURE__ */ jsxRuntimeExports.jsx(LivePhotoButton, { control: live }),
      image.src && state?.fetch && /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerFetchButton, { session: state.session, fetch: state.fetch, live: state.live }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ZoomHud, { zooms: view.zooms, percent: view.percent }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ViewerToast, { notice: live.failed ? "实况视频暂时无法播放。" : state?.notice, feedback: actions.feedback })
    ] })
  ] });
}
ReactDOM.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ImageViewer, {}) })
);
