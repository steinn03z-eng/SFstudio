(() => {
  const socket = typeof io === "function" ? io() : null;
  const $ = (id) => document.getElementById(id);

  const FONT_OPTIONS = [
    ["Inter, Arial, sans-serif", "Inter"],
    ["Arial, sans-serif", "Arial"],
    ["Trebuchet MS, sans-serif", "Trebuchet MS"],
    ["Verdana, sans-serif", "Verdana"],
    ["Tahoma, sans-serif", "Tahoma"],
    ["Segoe UI, sans-serif", "Segoe UI"],
    ["system-ui, sans-serif", "System UI"],
    ["Georgia, serif", "Georgia"],
    ["Times New Roman, serif", "Times New Roman"],
    ["Palatino Linotype, serif", "Palatino"],
    ["Impact, sans-serif", "Impact"],
    ["Franklin Gothic Medium, sans-serif", "Franklin Gothic"],
    ["Oswald, sans-serif", "Oswald"],
    ["Montserrat, sans-serif", "Montserrat"],
    ["Poppins, sans-serif", "Poppins"],
    ["Bebas Neue, sans-serif", "Bebas Neue"],
    ["Comic Sans MS, cursive", "Comic Sans"],
    ["Courier New, monospace", "Courier New"],
    ["Lucida Sans Unicode, sans-serif", "Lucida Sans"],
    ["Brush Script MT, cursive", "Brush Script"],
    ["Anton, sans-serif", "Anton"],
    ["Roboto Condensed, sans-serif", "Roboto Condensed"],
    ["Roboto Slab, serif", "Roboto Slab"],
    ["Playfair Display, serif", "Playfair Display"],
    ["Merriweather, serif", "Merriweather"],
    ["Noto Sans, sans-serif", "Noto Sans"],
    ["Lobster, cursive", "Lobster"],
    ["Raleway, sans-serif", "Raleway"],
    ["Space Grotesk, sans-serif", "Space Grotesk"],
    ["Orbitron, sans-serif", "Orbitron"],
    ["Kanit, sans-serif", "Kanit"],
    ["Copperplate, fantasy", "Copperplate"],
    ["Book Antiqua, serif", "Book Antiqua"],
    ["Garamond, serif", "Garamond"],
    ["Century Gothic, sans-serif", "Century Gothic"],
    ["Candara, sans-serif", "Candara"],
    ["Helvetica, sans-serif", "Helvetica"],
  ];

  const DEFAULT_ROULETTE = {
    enabled: false,
    title: "¿Quieres una voz?",
    subtitle: "Para participar, comenta lo que se indique en el sorteo!",
    winnerText: "Si ganas, solo comenta una de las siguientes voces:",
    imageUrl: "",
    imageAlt: "",
    titleImageUrl: "",
    titleImageAlt: "",
    titleImagePosition: "top",
    titleImageFit: "contain",
    titleImageWidth: 260,
    titleImageHeight: 260,
    titleImageOpacity: 1,
    subtitleImageUrl: "",
    subtitleImageAlt: "",
    subtitleImagePosition: "top",
    subtitleImageFit: "contain",
    subtitleImageWidth: 260,
    subtitleImageHeight: 260,
    subtitleImageOpacity: 1,
    winnerImageUrl: "",
    winnerImageAlt: "",
    winnerImagePosition: "top",
    winnerImageFit: "contain",
    winnerImageWidth: 260,
    winnerImageHeight: 260,
    winnerImageOpacity: 1,
    imagePosition: "top",
    imageFit: "contain",
    imageWidth: 260,
    imageHeight: 260,
    imageOpacity: 1,
    cardOpacity: 0.12,
    titleSeconds: 3,
    subtitleSeconds: 3,
    winnerSeconds: 3,
    introMotion: "fade",
    showListAfterIntro: true,
  };

  const DEFAULTS = {
    enabled: true,
    transparent: true,
    backgroundOpacity: 0,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    fontStyle: "normal",
    textColor: "#000000",
    textShadow: "none",
    shadowColor: "#000000",
    outlineWidth: 0,
    outlineColor: "#000000",
    textTransform: "none",
    letterSpacing: 0,
    lineHeight: 1.2,
    itemGap: 10,
    align: "left",
    listPosition: "left",
    horizontalPosition: "center",
    autoShowEnabled: false,
    autoShowEvery: 30,
    autoShowFor: 6,
    hideAfterShow: false,
    direction: "vertical",
    axis: "vertical",
    movementDirection: "forward",
    motion: "static",
    motionSpeed: 24,
    showIndex: false,
    showId: false,
    selectedVoice: "",
    overrides: {},
    roulette: { ...DEFAULT_ROULETTE },
  };

  const modal = $("voiceListModal");
  if (!modal) return;

  const els = {
    open: $("openVoiceListBtn"), close: $("closeVoiceListBtn"), closeBottom: $("closeVoiceListBtnBottom"),
    search: $("voiceListSearch"), count: $("voiceListCount"), preview: $("voiceListPreview"),
    enabled: $("voiceListEnabled"), transparent: $("voiceListTransparent"), bgOpacity: $("voiceListBgOpacity"),
    fontFamily: $("voiceListFontFamily"), fontSize: $("voiceListFontSize"), fontWeight: $("voiceListFontWeight"),
    fontStyle: $("voiceListFontStyle"), color: $("voiceListColor"), shadow: $("voiceListShadow"), shadowColor: $("voiceListShadowColor"),
    outlineWidth: $("voiceListOutlineWidth"), outlineColor: $("voiceListOutlineColor"),
    transform: $("voiceListTransform"), letterSpacing: $("voiceListLetterSpacing"), lineHeight: $("voiceListLineHeight"),
    itemGap: $("voiceListItemGap"), align: $("voiceListAlign"), listPosition: $("voiceListListPosition"), horizontalPosition: $("voiceListHorizontalPosition"), axis: $("voiceListDirection"), movementDirection: $("voiceListMovementDirection"), motion: $("voiceListMotion"), motionSpeed: $("voiceListMotionSpeed"), autoShowEnabled: $("voiceListAutoShowEnabled"), autoShowEvery: $("voiceListAutoShowEvery"), autoShowFor: $("voiceListAutoShowFor"), hideAfterShow: $("voiceListHideAfterShow"),
    showIndex: $("voiceListShowIndex"), showId: $("voiceListShowId"),
    rouletteEnabled: $("voiceListRouletteEnabled"), rouletteText1: $("voiceListRouletteText1"), rouletteText2: $("voiceListRouletteText2"), rouletteText3: $("voiceListRouletteText3"),
    rouletteTime1: $("voiceListRouletteTime1"), rouletteTime2: $("voiceListRouletteTime2"), rouletteTime3: $("voiceListRouletteTime3"),
    rouletteImageUrl: $("voiceListRouletteImageUrl"), rouletteImageAlt: $("voiceListRouletteImageAlt"), rouletteTitleImageUrl: $("voiceListRouletteTitleImageUrl"), rouletteTitleImageAlt: $("voiceListRouletteTitleImageAlt"),
    rouletteTitleImagePosition: $("voiceListRouletteTitleImagePosition"), rouletteTitleImageFit: $("voiceListRouletteTitleImageFit"), rouletteTitleImageWidth: $("voiceListRouletteTitleImageWidth"), rouletteTitleImageHeight: $("voiceListRouletteTitleImageHeight"), rouletteTitleImageOpacity: $("voiceListRouletteTitleImageOpacity"),
    rouletteSubtitleImageUrl: $("voiceListRouletteSubtitleImageUrl"), rouletteSubtitleImageAlt: $("voiceListRouletteSubtitleImageAlt"),
    rouletteSubtitleImagePosition: $("voiceListRouletteSubtitleImagePosition"), rouletteSubtitleImageFit: $("voiceListRouletteSubtitleImageFit"), rouletteSubtitleImageWidth: $("voiceListRouletteSubtitleImageWidth"), rouletteSubtitleImageHeight: $("voiceListRouletteSubtitleImageHeight"), rouletteSubtitleImageOpacity: $("voiceListRouletteSubtitleImageOpacity"),
    rouletteWinnerImageUrl: $("voiceListRouletteWinnerImageUrl"), rouletteWinnerImageAlt: $("voiceListRouletteWinnerImageAlt"),
    rouletteWinnerImagePosition: $("voiceListRouletteWinnerImagePosition"), rouletteWinnerImageFit: $("voiceListRouletteWinnerImageFit"), rouletteWinnerImageWidth: $("voiceListRouletteWinnerImageWidth"), rouletteWinnerImageHeight: $("voiceListRouletteWinnerImageHeight"), rouletteWinnerImageOpacity: $("voiceListRouletteWinnerImageOpacity"),
    rouletteImagePosition: $("voiceListRouletteImagePosition"), rouletteImageFit: $("voiceListRouletteImageFit"),
    rouletteImageWidth: $("voiceListRouletteImageWidth"), rouletteImageHeight: $("voiceListRouletteImageHeight"), rouletteImageOpacity: $("voiceListRouletteImageOpacity"), rouletteCardOpacity: $("voiceListRouletteCardOpacity"),
    rouletteMotion: $("voiceListRouletteMotion"), rouletteShowListAfterIntro: $("voiceListRouletteShowListAfterIntro"),
    selected: $("voiceListSelectedVoice"), overrideFont: $("voiceListOverrideFont"), overrideSize: $("voiceListOverrideSize"),
    overrideWeight: $("voiceListOverrideWeight"), overrideStyle: $("voiceListOverrideStyle"), overrideColor: $("voiceListOverrideColor"),
    overrideShadow: $("voiceListOverrideShadow"), overrideShadowColor: $("voiceListOverrideShadowColor"),
    overrideOutlineWidth: $("voiceListOverrideOutlineWidth"), overrideOutlineColor: $("voiceListOverrideOutlineColor"),
    overrideTransform: $("voiceListOverrideTransform"),
    applyOverride: $("voiceListApplyOverride"), resetOverride: $("voiceListResetOverride"),
    save: $("saveVoiceListBtn"), reset: $("resetVoiceListBtn"),
  };

  let catalog = [];
  let settings = structuredClone(DEFAULTS);
  let draft = structuredClone(DEFAULTS);
  let filter = "";
  let previewStartAt = Date.now();
  let previewTicker = null;
  let lastPreviewKey = "";
  let previewRouletteStep = null;
  let previewVisibilityPhase = "visible";
  let previewVisibilityPhaseStartedAt = Date.now();

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(n)) ? Number(n) : min));
  const shadowValue = (v, color = "#000000") => {
    const c = String(color || "#000000");
    if (v === "soft") return `0 2px 8px ${c}`;
    if (v === "strong") return `0 4px 16px ${c}`;
    return "none";
  };
  const outlineValue = (width = 0, color = "#000000") => `${Math.max(0, Number(width || 0))}px ${String(color || "#000000")}`;
  const rouletteDefaults = () => ({ ...DEFAULT_ROULETTE });
  const merge = (base, incoming) => {
    const out = { ...base, ...(incoming || {}) };
    out.overrides = { ...(base.overrides || {}), ...(incoming?.overrides || {}) };
    out.roulette = { ...rouletteDefaults(), ...(base.roulette || {}), ...(incoming?.roulette || {}) };
    return out;
  };

  function setSelectOptions(select, items, current) {
    if (!select) return;
    select.innerHTML = items.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
    if (current != null) select.value = current;
  }

  function open() {
    previewStartAt = Date.now();
    previewVisibilityPhase = "visible";
    previewVisibilityPhaseStartedAt = Date.now();
    previewRouletteStep = null;
    lastPreviewKey = "";
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    renderAll();
    startPreviewTicker();
  }
  function close() {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    if (previewTicker) { clearInterval(previewTicker); previewTicker = null; }
  }

  function startPreviewTicker() {
    if (previewTicker) return;
    previewTicker = setInterval(() => {
      if (!modal.classList.contains("show")) return;
      if (draft.roulette?.enabled) renderPreview();
      else syncPreviewVisibility();
    }, 100);
  }

  function setInputs() {
    const s = draft;
    const r = { ...rouletteDefaults(), ...(s.roulette || {}) };
    els.enabled.checked = s.enabled !== false;
    els.transparent.checked = s.transparent !== false;
    els.bgOpacity.value = String(Math.round(Number(s.backgroundOpacity || 0) * 100));
    els.fontFamily.value = s.fontFamily || DEFAULTS.fontFamily;
    els.fontSize.value = String(s.fontSize ?? DEFAULTS.fontSize);
    els.fontWeight.value = String(s.fontWeight ?? DEFAULTS.fontWeight);
    els.fontStyle.value = s.fontStyle || "normal";
    els.color.value = s.textColor || "#000000";
    els.shadow.value = s.textShadow || "none";
    els.shadowColor.value = s.shadowColor || "#000000";
    els.outlineWidth.value = String(s.outlineWidth ?? 0);
    els.outlineColor.value = s.outlineColor || "#000000";
    els.transform.value = s.textTransform || "none";
    els.letterSpacing.value = String(s.letterSpacing ?? 0);
    els.lineHeight.value = String(s.lineHeight ?? 1.2);
    els.itemGap.value = String(s.itemGap ?? 10);
    els.align.value = s.align || "left";
    els.axis.value = s.axis || s.direction || "vertical"; if(els.movementDirection) els.movementDirection.value = s.movementDirection || "forward";
    els.motion.value = s.motion || "static";
    els.motionSpeed.value = String(s.motionSpeed ?? 24);
    els.autoShowEnabled.checked = s.autoShowEnabled === true;
    els.autoShowEvery.value = String(s.autoShowEvery ?? 30);
    els.autoShowFor.value = String(s.autoShowFor ?? 6);
    if (els.hideAfterShow) els.hideAfterShow.checked = s.hideAfterShow === true;
    els.showIndex.checked = s.showIndex === true;
    els.showId.checked = s.showId === true;

    els.rouletteEnabled.checked = r.enabled === true;
    els.rouletteText1.value = r.title || DEFAULT_ROULETTE.title;
    els.rouletteText2.value = r.subtitle || DEFAULT_ROULETTE.subtitle;
    els.rouletteText3.value = r.winnerText || DEFAULT_ROULETTE.winnerText;
    els.rouletteTime1.value = String(r.titleSeconds ?? DEFAULT_ROULETTE.titleSeconds);
    els.rouletteTime2.value = String(r.subtitleSeconds ?? DEFAULT_ROULETTE.subtitleSeconds);
    els.rouletteTime3.value = String(r.winnerSeconds ?? DEFAULT_ROULETTE.winnerSeconds);
    els.rouletteImageUrl.value = r.imageUrl || "";
    els.rouletteImageAlt.value = r.imageAlt || "";
    els.rouletteTitleImageUrl.value = r.titleImageUrl || "";
    els.rouletteTitleImageAlt.value = r.titleImageAlt || "";
    els.rouletteTitleImagePosition.value = r.titleImagePosition || r.imagePosition || "top";
    els.rouletteTitleImageFit.value = r.titleImageFit || r.imageFit || "contain";
    els.rouletteTitleImageWidth.value = String(r.titleImageWidth ?? r.imageWidth ?? 260);
    els.rouletteTitleImageHeight.value = String(r.titleImageHeight ?? r.imageHeight ?? 260);
    els.rouletteTitleImageOpacity.value = String(Math.round((r.titleImageOpacity ?? r.imageOpacity ?? 1) * 100));
    els.rouletteSubtitleImageUrl.value = r.subtitleImageUrl || "";
    els.rouletteSubtitleImageAlt.value = r.subtitleImageAlt || "";
    els.rouletteSubtitleImagePosition.value = r.subtitleImagePosition || r.imagePosition || "top";
    els.rouletteSubtitleImageFit.value = r.subtitleImageFit || r.imageFit || "contain";
    els.rouletteSubtitleImageWidth.value = String(r.subtitleImageWidth ?? r.imageWidth ?? 260);
    els.rouletteSubtitleImageHeight.value = String(r.subtitleImageHeight ?? r.imageHeight ?? 260);
    els.rouletteSubtitleImageOpacity.value = String(Math.round((r.subtitleImageOpacity ?? r.imageOpacity ?? 1) * 100));
    els.rouletteWinnerImageUrl.value = r.winnerImageUrl || "";
    els.rouletteWinnerImageAlt.value = r.winnerImageAlt || "";
    els.rouletteWinnerImagePosition.value = r.winnerImagePosition || r.imagePosition || "top";
    els.rouletteWinnerImageFit.value = r.winnerImageFit || r.imageFit || "contain";
    els.rouletteWinnerImageWidth.value = String(r.winnerImageWidth ?? r.imageWidth ?? 260);
    els.rouletteWinnerImageHeight.value = String(r.winnerImageHeight ?? r.imageHeight ?? 260);
    els.rouletteWinnerImageOpacity.value = String(Math.round((r.winnerImageOpacity ?? r.imageOpacity ?? 1) * 100));
    els.rouletteImagePosition.value = r.imagePosition || DEFAULT_ROULETTE.imagePosition;
    els.rouletteImageFit.value = r.imageFit || DEFAULT_ROULETTE.imageFit;
    els.rouletteImageWidth.value = String(r.imageWidth ?? DEFAULT_ROULETTE.imageWidth);
    els.rouletteImageHeight.value = String(r.imageHeight ?? DEFAULT_ROULETTE.imageHeight);
    els.rouletteImageOpacity.value = String(Math.round(clamp(r.imageOpacity ?? 1, 0, 1) * 100));
    els.rouletteCardOpacity.value = String(Math.round(clamp(r.cardOpacity ?? 0.12, 0, 1) * 100));
    els.rouletteMotion.value = r.introMotion || DEFAULT_ROULETTE.introMotion;
    els.rouletteShowListAfterIntro.checked = r.showListAfterIntro !== false;

    updateOverrideInputs();
  }

  function readInputs() {
    draft.enabled = els.enabled.checked;
    draft.transparent = els.transparent.checked;
    draft.backgroundOpacity = clamp(Number(els.bgOpacity.value || 0) / 100, 0, 1);
    draft.fontFamily = els.fontFamily.value;
    draft.fontSize = clamp(Number(els.fontSize.value || 28), 8, 120);
    draft.fontWeight = Number(els.fontWeight.value || 700);
    draft.fontStyle = els.fontStyle.value;
    draft.textColor = els.color.value || "#000000";
    draft.textShadow = els.shadow.value;
    draft.shadowColor = els.shadowColor.value || "#000000";
    draft.outlineWidth = clamp(Number(els.outlineWidth.value || 0), 0, 12);
    draft.outlineColor = els.outlineColor.value || "#000000";
    draft.textTransform = els.transform.value;
    draft.letterSpacing = Number(els.letterSpacing.value || 0);
    draft.lineHeight = clamp(Number(els.lineHeight.value || 1.2), 0.8, 3);
    draft.itemGap = clamp(Number(els.itemGap.value || 10), 0, 80);
    draft.align = els.align.value;
    draft.axis = els.axis.value || "vertical"; draft.direction = draft.axis; draft.movementDirection = els.movementDirection?.value || "forward";
    draft.motion = els.motion.value || "static";
    draft.motionSpeed = clamp(Number(els.motionSpeed.value || 24), 6, 120);
    draft.listPosition = els.listPosition.value || "left";
    if (els.horizontalPosition) draft.horizontalPosition = els.horizontalPosition.value || "center";
    draft.autoShowEnabled = els.autoShowEnabled.checked;
    draft.autoShowEvery = clamp(Number(els.autoShowEvery.value || 30), 5, 3600);
    draft.autoShowFor = clamp(Number(els.autoShowFor.value || 6), 1, 120);
    draft.hideAfterShow = els.hideAfterShow?.checked === true;
    draft.showIndex = els.showIndex.checked;
    draft.showId = els.showId.checked;

    draft.roulette = {
      ...rouletteDefaults(),
      enabled: els.rouletteEnabled.checked,
      title: els.rouletteText1.value || DEFAULT_ROULETTE.title,
      subtitle: els.rouletteText2.value || DEFAULT_ROULETTE.subtitle,
      winnerText: els.rouletteText3.value || DEFAULT_ROULETTE.winnerText,
      titleSeconds: clamp(Number(els.rouletteTime1.value || 3), 0.5, 30),
      subtitleSeconds: clamp(Number(els.rouletteTime2.value || 3), 0.5, 30),
      winnerSeconds: clamp(Number(els.rouletteTime3.value || 3), 0.5, 30),
      imageUrl: els.rouletteImageUrl.value.trim(),
      imageAlt: els.rouletteImageAlt.value.trim(),
      titleImageUrl: els.rouletteTitleImageUrl.value.trim(),
      titleImageAlt: els.rouletteTitleImageAlt.value.trim(),
      titleImagePosition: els.rouletteTitleImagePosition.value,
      titleImageFit: els.rouletteTitleImageFit.value,
      titleImageWidth: clamp(Number(els.rouletteTitleImageWidth.value || 260), 80, 1200),
      titleImageHeight: clamp(Number(els.rouletteTitleImageHeight.value || 260), 80, 1200),
      titleImageOpacity: clamp(Number(els.rouletteTitleImageOpacity.value || 100) / 100, 0, 1),
      subtitleImageUrl: els.rouletteSubtitleImageUrl.value.trim(),
      subtitleImageAlt: els.rouletteSubtitleImageAlt.value.trim(),
      subtitleImagePosition: els.rouletteSubtitleImagePosition.value,
      subtitleImageFit: els.rouletteSubtitleImageFit.value,
      subtitleImageWidth: clamp(Number(els.rouletteSubtitleImageWidth.value || 260), 80, 1200),
      subtitleImageHeight: clamp(Number(els.rouletteSubtitleImageHeight.value || 260), 80, 1200),
      subtitleImageOpacity: clamp(Number(els.rouletteSubtitleImageOpacity.value || 100) / 100, 0, 1),
      winnerImageUrl: els.rouletteWinnerImageUrl.value.trim(),
      winnerImageAlt: els.rouletteWinnerImageAlt.value.trim(),
      winnerImagePosition: els.rouletteWinnerImagePosition.value,
      winnerImageFit: els.rouletteWinnerImageFit.value,
      winnerImageWidth: clamp(Number(els.rouletteWinnerImageWidth.value || 260), 80, 1200),
      winnerImageHeight: clamp(Number(els.rouletteWinnerImageHeight.value || 260), 80, 1200),
      winnerImageOpacity: clamp(Number(els.rouletteWinnerImageOpacity.value || 100) / 100, 0, 1),
      imagePosition: els.rouletteImagePosition.value,
      imageFit: els.rouletteImageFit.value,
      imageWidth: clamp(Number(els.rouletteImageWidth.value || 260), 80, 1200),
      imageHeight: clamp(Number(els.rouletteImageHeight.value || 260), 80, 1200),
      imageOpacity: clamp(Number(els.rouletteImageOpacity.value || 100) / 100, 0, 1),
      cardOpacity: clamp(Number(els.rouletteCardOpacity.value || 12) / 100, 0, 1),
      introMotion: els.rouletteMotion.value || DEFAULT_ROULETTE.introMotion,
      showListAfterIntro: els.rouletteShowListAfterIntro.checked,
    };
  }

  function filteredCatalog() {
    const q = filter.trim().toLowerCase();
    return catalog.filter((v) => !q || `${v.label} ${v.key} ${(v.aliases || []).join(" ")}`.toLowerCase().includes(q));
  }

  function populateSelected() {
    const current = draft.selectedVoice || "";
    const list = filteredCatalog();
    els.selected.innerHTML = `<option value="">— Sin estilo individual —</option>` + list.map((v) => `<option value="${esc(v.key)}">${esc(v.label)}</option>`).join("");
    els.selected.value = current && list.some((v) => v.key === current) ? current : "";
    updateOverrideInputs();
  }

  function overrideFor(key) { return key && draft.overrides?.[key] ? draft.overrides[key] : {}; }

  function updateOverrideInputs() {
    const key = els.selected.value;
    const o = overrideFor(key);
    els.overrideFont.value = o.fontFamily || draft.fontFamily;
    els.overrideSize.value = String(o.fontSize ?? draft.fontSize);
    els.overrideWeight.value = String(o.fontWeight ?? draft.fontWeight);
    els.overrideStyle.value = o.fontStyle || draft.fontStyle;
    els.overrideColor.value = o.color || draft.textColor;
    els.overrideShadow.value = o.textShadow || draft.textShadow;
    els.overrideShadowColor.value = o.shadowColor || draft.shadowColor || "#000000";
    els.overrideOutlineWidth.value = String(o.outlineWidth ?? draft.outlineWidth ?? 0);
    els.overrideOutlineColor.value = o.outlineColor || draft.outlineColor || "#000000";
    els.overrideTransform.value = o.textTransform || draft.textTransform;
  }

  function renderItem(v, i, s) {
    const o = overrideFor(v.key);
    const shadowType = o.textShadow || s.textShadow;
    const shadowColor = o.shadowColor || s.shadowColor || "#000000";
    const outlineWidth = Number(o.outlineWidth ?? s.outlineWidth ?? 0);
    const outlineColor = o.outlineColor || s.outlineColor || "#000000";
    const style = `font-family:${esc(o.fontFamily || s.fontFamily)};font-size:${Number(o.fontSize ?? s.fontSize)}px;font-weight:${Number(o.fontWeight ?? s.fontWeight)};font-style:${esc(o.fontStyle || s.fontStyle)};color:${esc(o.color || s.textColor)};text-shadow:${shadowValue(shadowType, shadowColor)};-webkit-text-stroke:${outlineValue(outlineWidth, outlineColor)};paint-order:stroke fill;text-transform:${esc(o.textTransform || s.textTransform)};`;
    return `<div class="voiceListItem" style="${style}"><span class="voiceListIndex">${s.showIndex ? `${i + 1}. ` : ""}</span>${esc(v.label)}${s.showId ? `<small>${esc(v.id)}</small>` : ""}</div>`;
  }

  function renderList(list, s) {
    if (!list.length) return '<div class="voiceListEmpty">No se encontraron voces.</div>';
    const repeated = (s.motion === "static") ? list.map((v, i) => renderItem(v, i, s)).join("") : list.map((v, i) => renderItem(v, i, s)).join("") + list.map((v, i) => renderItem(v, i, s)).join("");
    return `<div class="voiceListStage"><div class="voiceListViewport"><div class="voiceListTrack">${repeated}</div></div></div>`;
  }

  function syncPreviewVisibilityClock(s, now = Date.now()) {
    const enabled = s.autoShowEnabled === true && s.hideAfterShow === true;
    if (!enabled) {
      previewVisibilityPhase = "visible";
      previewVisibilityPhaseStartedAt = now;
      return;
    }
    const visibleFor = clamp(Number(s.autoShowFor || 6), 1, 120);
    const hiddenFor = clamp(Number(s.autoShowEvery || 30), 5, 3600);
    const elapsed = (now - previewVisibilityPhaseStartedAt) / 1000;
    if (previewVisibilityPhase === "visible" && elapsed >= visibleFor) {
      previewVisibilityPhase = "hidden";
      previewVisibilityPhaseStartedAt = now;
    } else if (previewVisibilityPhase === "hidden" && elapsed >= hiddenFor) {
      previewVisibilityPhase = "visible";
      previewVisibilityPhaseStartedAt = now;
    }
  }

  function isListVisible(s, now = Date.now()) {
    syncPreviewVisibilityClock(s, now);
    return previewVisibilityPhase !== "hidden";
  }

  function rouletteScene(s, now = Date.now()) {
    const r = { ...rouletteDefaults(), ...(s.roulette || {}) };
    if (!r.enabled) return { mode: "list", step: -1, text: "" };
    const elapsed = Math.max(0, (now - previewStartAt) / 1000);
    const d1 = clamp(r.titleSeconds, 0.5, 30);
    const d2 = clamp(r.subtitleSeconds, 0.5, 30);
    const d3 = clamp(r.winnerSeconds, 0.5, 30);
    if (elapsed < d1) return { mode: "intro", step: 0, text: r.title };
    if (elapsed < d1 + d2) return { mode: "intro", step: 1, text: r.subtitle };
    if (elapsed < d1 + d2 + d3) return { mode: "intro", step: 2, text: r.winnerText };
    if (r.showListAfterIntro === false) return { mode: "intro", step: 2, text: r.winnerText };
    return { mode: "list", step: 3, text: "" };
  }

  function manualRouletteScene(s, step) {
    const r = { ...rouletteDefaults(), ...(s.roulette || {}) };
    const texts = [r.title, r.subtitle, r.winnerText];
    const idx = Math.max(0, Math.min(2, Number(step || 0)));
    return { mode: "intro", step: idx, text: texts[idx] || texts[0] || "" };
  }

  function imageConfigForStep(r, step) {
    const idx = Math.max(0, Math.min(2, Number(step || 0)));
    const base = [
      { url: r.titleImageUrl || r.imageUrl, alt: r.titleImageAlt || r.imageAlt || "Imagen de ruleta", position: r.titleImagePosition || r.imagePosition || "top", fit: r.titleImageFit || r.imageFit || "contain", width: r.titleImageWidth ?? r.imageWidth ?? 260, height: r.titleImageHeight ?? r.imageHeight ?? 260, opacity: r.titleImageOpacity ?? r.imageOpacity ?? 1 },
      { url: r.subtitleImageUrl || r.imageUrl, alt: r.subtitleImageAlt || r.imageAlt || "Imagen de ruleta", position: r.subtitleImagePosition || r.imagePosition || "top", fit: r.subtitleImageFit || r.imageFit || "contain", width: r.subtitleImageWidth ?? r.imageWidth ?? 260, height: r.subtitleImageHeight ?? r.imageHeight ?? 260, opacity: r.subtitleImageOpacity ?? r.imageOpacity ?? 1 },
      { url: r.winnerImageUrl || r.imageUrl, alt: r.winnerImageAlt || r.imageAlt || "Imagen de ruleta", position: r.winnerImagePosition || r.imagePosition || "top", fit: r.winnerImageFit || r.imageFit || "contain", width: r.winnerImageWidth ?? r.imageWidth ?? 260, height: r.winnerImageHeight ?? r.imageHeight ?? 260, opacity: r.winnerImageOpacity ?? r.imageOpacity ?? 1 },
    ];
    return base[idx] || base[0];
  }

  function renderRoulette(s, list, scene) {
    const r = { ...rouletteDefaults(), ...(s.roulette || {}) };
    const motionClass = `motion-${r.introMotion || "fade"}`;
    const imageCfg = imageConfigForStep(r, scene.step);
    const imagePos = `image-${imageCfg.position || "top"}`;
    const image = imageCfg?.url ? `<div class="voiceListRouletteImageWrap"><img src="${esc(imageCfg.url)}" alt="${esc(imageCfg.alt)}" style="width:${clamp(imageCfg.width, 80, 1200)}px;height:${clamp(imageCfg.height, 80, 1200)}px;object-fit:${esc(imageCfg.fit || "contain")};opacity:${clamp(imageCfg.opacity ?? 1, 0, 1)}" /></div>` : "";
    const intro = `<div class="voiceListRouletteShell ${motionClass} ${imagePos}"><div class="voiceListRouletteCard" style="--vl-roulette-card-bg:rgba(255,255,255,${clamp(r.cardOpacity ?? 0.12, 0, 1)});">${image}<div class="voiceListRouletteCopy"><div class="voiceListRouletteText">${esc(scene.text || r.title)}</div></div></div></div>`;
    const listBlock = `<div class="voiceListRouletteListWrap">${renderList(list, s)}</div>`;
    return scene.mode === "intro" ? intro : listBlock;
  }

  function getAnimationProgress(track) {
    if (!track) return 0;
    const animation = track.getAnimations?.().find((a) => a && a.animationName);
    if (!animation) return 0;
    const timing = animation.effect?.getComputedTiming?.();
    const duration = Number(timing?.duration);
    const current = Number(animation.currentTime);
    if (!Number.isFinite(current) || !Number.isFinite(duration) || duration <= 0) return 0;
    return ((current % duration) + duration) % duration / duration;
  }

  function applyPreviewStyles(shell, s, list, hidden) {
    const direction = s.axis || s.direction || "vertical";
    const nextClassName = `voiceListShell direction-${direction} travel-${s.movementDirection || "forward"} motion-${s.motion || "static"} align-${s.align || "left"} list-position-${s.listPosition || "left"} horizontal-position-${s.horizontalPosition || "center"}${hidden ? " is-hidden" : ""}`;
    if (shell.className !== nextClassName) shell.className = nextClassName;
    shell.style.setProperty("--vl-font", s.fontFamily);
    shell.style.setProperty("--vl-size", `${s.fontSize}px`);
    shell.style.setProperty("--vl-weight", s.fontWeight);
    shell.style.setProperty("--vl-style", s.fontStyle);
    shell.style.setProperty("--vl-color", s.textColor);
    shell.style.setProperty("--vl-shadow", shadowValue(s.textShadow, s.shadowColor));
    shell.style.setProperty("--vl-outline-width", `${Math.max(0, Number(s.outlineWidth ?? 0))}px`);
    shell.style.setProperty("--vl-outline-color", s.outlineColor || "#000000");
    shell.style.setProperty("--vl-transform", s.textTransform);
    shell.style.setProperty("--vl-spacing", `${s.letterSpacing}px`);
    shell.style.setProperty("--vl-line", s.lineHeight);
    shell.style.setProperty("--vl-gap", `${s.itemGap}px`);
    shell.style.setProperty("--vl-bg", s.transparent ? `rgba(255,255,255,${s.backgroundOpacity})` : `rgba(255,255,255,${Math.max(.05, s.backgroundOpacity)})`);
    shell.style.setProperty("--vl-speed", `${s.motionSpeed || 24}s`);
    shell.style.setProperty("--vl-align", s.align);

    const ordered = s.movementDirection === "reverse" ? [...list].reverse() : list;
    const items = shell.querySelectorAll(".voiceListItem");
    items.forEach((item, i) => {
      const v = ordered[i % Math.max(1, ordered.length)];
      const o = overrideFor(v?.key) || {};
      item.style.cssText = `font-family:${esc(o.fontFamily || s.fontFamily)};font-size:${Number(o.fontSize ?? s.fontSize)}px;font-weight:${Number(o.fontWeight ?? s.fontWeight)};font-style:${esc(o.fontStyle || s.fontStyle)};color:${esc(o.color || s.textColor)};text-shadow:${shadowValue(o.textShadow || s.textShadow, o.shadowColor || s.shadowColor)};-webkit-text-stroke:${outlineValue(Number(o.outlineWidth ?? s.outlineWidth ?? 0), o.outlineColor || s.outlineColor)};paint-order:stroke fill;text-transform:${esc(o.textTransform || s.textTransform)};letter-spacing:${Number(s.letterSpacing || 0)}px;line-height:${Number(s.lineHeight || 1.2)};`;
      const idx = item.querySelector(".voiceListIndex"); if (idx) idx.textContent = s.showIndex ? `${(i % ordered.length) + 1}. ` : "";
      const small = item.querySelector("small"); if (small) small.textContent = s.showId ? String(v?.id || "") : "";
    });
  }

  function preservePreviewAnimation(track, mutate, newDurationSeconds) {
    const progress = getAnimationProgress(track);
    mutate?.();
    if (!track) return;
    requestAnimationFrame(() => {
      track.style.animationDelay = (progress > 0 && newDurationSeconds) ? `${-(progress * Number(newDurationSeconds))}s` : "";
    });
  }

  function ensurePreviewShell(list, s) {
    const structure = JSON.stringify({ axis: s.axis || s.direction || "vertical", motion: s.motion || "static", moveDir: s.movementDirection || "forward", items: list.map(v => String(v.key || v.id || v.fishId || v.label || "")) });
    let shell = els.preview.querySelector(".voiceListShell");
    if (!shell || shell.dataset.structure !== structure) {
      const wrap = document.createElement("div");
      wrap.innerHTML = renderList(list, s);
      shell = wrap.firstElementChild;
      if (!shell) return null;
      els.preview.replaceChildren(shell);
      shell.dataset.structure = structure;
    }
    return shell;
  }

  function syncPreviewVisibility() {
    const shell = els.preview.querySelector(".voiceListShell");
    if (!shell || draft.roulette?.enabled) return;
    shell.classList.toggle("is-hidden", !isListVisible(draft));
  }

  function renderPreview() {
    readInputs();
    const list = filteredCatalog();
    const s = draft;
    els.count.textContent = `${list.length} de ${catalog.length} voces`;

    if (s.roulette?.enabled) {
      const scene = previewRouletteStep != null ? manualRouletteScene(s, previewRouletteStep) : rouletteScene(s);
      const previewKey = JSON.stringify({scene, roulette:s.roulette, list:list.map(v=>v.key)});
      if (previewKey !== lastPreviewKey) {
        lastPreviewKey = previewKey;
        els.preview.className = "voiceListPreview";
        els.preview.innerHTML = renderRoulette(s, list, scene);
      }
      return;
    }

    if (!list.length) {
      els.preview.className = "voiceListPreview";
      if (!els.preview.querySelector(".voiceListEmpty")) els.preview.innerHTML = '<div class="voiceListEmpty">No se encontraron voces.</div>';
      return;
    }

    const shell = ensurePreviewShell(list, s);
    if (!shell) return;
    const hidden = !isListVisible(s);
    const track = shell.querySelector(".voiceListTrack");
    const progressBefore = getAnimationProgress(track);
    applyPreviewStyles(shell, s, list, hidden);
    if (track) requestAnimationFrame(() => { track.style.animationDelay = progressBefore > 0 ? `${-(progressBefore * Math.max(4, Number(s.motionSpeed || 24)))}s` : ""; });
    lastPreviewKey = JSON.stringify({filter, list:list.map(v=>v.key), axis:s.axis||s.direction, motion:s.motion, movementDirection:s.movementDirection, fontFamily:s.fontFamily, fontSize:s.fontSize, fontWeight:s.fontWeight, fontStyle:s.fontStyle, textColor:s.textColor, textShadow:s.textShadow, shadowColor:s.shadowColor, outlineWidth:s.outlineWidth, outlineColor:s.outlineColor, textTransform:s.textTransform, letterSpacing:s.letterSpacing, lineHeight:s.lineHeight, itemGap:s.itemGap, align:s.align, listPosition:s.listPosition, horizontalPosition:s.horizontalPosition, motionSpeed:s.motionSpeed, showIndex:s.showIndex, showId:s.showId, overrides:s.overrides});
  }

  function renderAll() { populateSelected(); setInputs(); renderPreview(); }

  modal.querySelectorAll?.(".voiceListRouletteStepBox").forEach((box, idx) => {
    box.addEventListener("focusin", () => {
      previewRouletteStep = idx;
      renderPreview();
    });
  });

  async function load() {
    try {
      const [catalogRes, settingsRes] = await Promise.all([fetch("/data/voice-catalog.json"), fetch("/api/voice-list/settings")]);
      const cat = await catalogRes.json();
      catalog = Array.isArray(cat?.voices) ? cat.voices : [];
      const remote = await settingsRes.json();
      settings = merge(DEFAULTS, remote?.voiceList || remote || {}); settings.axis = settings.axis || settings.direction || "vertical"; settings.direction = settings.axis; settings.movementDirection = settings.movementDirection || "forward";
      draft = structuredClone(settings);
      previewStartAt = Date.now();
      previewVisibilityPhase = "visible";
      previewVisibilityPhaseStartedAt = Date.now();
      previewRouletteStep = null;
      lastPreviewKey = "";
      renderAll();
    } catch (err) {
      console.error("No se pudo cargar la lista de voces", err);
    }
  }

  async function save() {
    readInputs();
    draft.overrides = draft.overrides || {};
    try {
      const res = await fetch("/api/voice-list/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
      const data = await res.json();
      settings = merge(DEFAULTS, data.voiceList || draft);
      draft = structuredClone(settings);
      previewStartAt = Date.now();
      previewVisibilityPhase = "visible";
      previewVisibilityPhaseStartedAt = Date.now();
      previewRouletteStep = null;
      lastPreviewKey = "";
      renderAll();
      close();
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar la configuración de la lista de voces.");
    }
  }

  function applyOverride() {
    readInputs();
    const key = els.selected.value;
    if (!key) return;
    draft.overrides[key] = {
      fontFamily: els.overrideFont.value,
      fontSize: Number(els.overrideSize.value || draft.fontSize),
      fontWeight: Number(els.overrideWeight.value || draft.fontWeight),
      fontStyle: els.overrideStyle.value,
      color: els.overrideColor.value,
      textShadow: els.overrideShadow.value,
      shadowColor: els.overrideShadowColor.value || draft.shadowColor || "#000000",
      outlineWidth: Number(els.overrideOutlineWidth.value || draft.outlineWidth || 0),
      outlineColor: els.overrideOutlineColor.value || draft.outlineColor || "#000000",
      textTransform: els.overrideTransform.value,
    };
    renderPreview();
  }

  function resetOverride() {
    const key = els.selected.value;
    if (!key) return;
    delete draft.overrides[key];
    updateOverrideInputs();
    renderPreview();
  }

  ["Inter, Arial, sans-serif","Arial, sans-serif","Trebuchet MS, sans-serif","Verdana, sans-serif","Tahoma, sans-serif","Segoe UI, sans-serif","system-ui, sans-serif","Georgia, serif","Times New Roman, serif","Palatino Linotype, serif","Impact, sans-serif","Franklin Gothic Medium, sans-serif","Oswald, sans-serif","Montserrat, sans-serif","Poppins, sans-serif","Bebas Neue, sans-serif","Comic Sans MS, cursive","Courier New, monospace","Lucida Sans Unicode, sans-serif","Brush Script MT, cursive","Anton, sans-serif","Roboto Condensed, sans-serif","Roboto Slab, serif","Playfair Display, serif","Merriweather, serif","Noto Sans, sans-serif","Lobster, cursive","Raleway, sans-serif"].forEach(() => {});

  els.open?.addEventListener("click", open);
  els.close?.addEventListener("click", close);
  els.closeBottom?.addEventListener("click", close);
  els.search?.addEventListener("input", () => { filter = els.search.value; populateSelected(); renderPreview(); });
  els.selected?.addEventListener("change", () => { draft.selectedVoice = els.selected.value; updateOverrideInputs(); renderPreview(); });
  els.applyOverride?.addEventListener("click", applyOverride);
  els.resetOverride?.addEventListener("click", resetOverride);
[els.enabled, els.transparent, els.bgOpacity, els.fontFamily, els.fontSize, els.fontWeight, els.fontStyle, els.color, els.shadow, els.shadowColor, els.outlineWidth, els.outlineColor, els.transform, els.letterSpacing, els.lineHeight, els.itemGap, els.align, els.listPosition, els.axis, els.movementDirection, els.motion, els.motionSpeed, els.autoShowEnabled, els.autoShowEvery, els.autoShowFor, els.hideAfterShow, els.showIndex, els.showId, els.rouletteEnabled, els.rouletteText1, els.rouletteText2, els.rouletteText3, els.rouletteTime1, els.rouletteTime2, els.rouletteTime3, els.rouletteImageUrl, els.rouletteImageAlt, els.rouletteTitleImageUrl, els.rouletteTitleImageAlt, els.rouletteTitleImagePosition, els.rouletteTitleImageFit, els.rouletteTitleImageWidth, els.rouletteTitleImageHeight, els.rouletteTitleImageOpacity, els.rouletteSubtitleImageUrl, els.rouletteSubtitleImageAlt, els.rouletteSubtitleImagePosition, els.rouletteSubtitleImageFit, els.rouletteSubtitleImageWidth, els.rouletteSubtitleImageHeight, els.rouletteSubtitleImageOpacity, els.rouletteWinnerImageUrl, els.rouletteWinnerImageAlt, els.rouletteWinnerImagePosition, els.rouletteWinnerImageFit, els.rouletteWinnerImageWidth, els.rouletteWinnerImageHeight, els.rouletteWinnerImageOpacity, els.rouletteImagePosition, els.rouletteImageFit, els.rouletteImageWidth, els.rouletteImageHeight, els.rouletteImageOpacity, els.rouletteCardOpacity, els.rouletteMotion, els.rouletteShowListAfterIntro].forEach((el) => el?.addEventListener("input", () => { if (el === els.rouletteEnabled) { previewStartAt = Date.now(); previewRouletteStep = null; } if (el === els.autoShowEnabled || el === els.hideAfterShow) { previewVisibilityPhase = "visible"; previewVisibilityPhaseStartedAt = Date.now(); } lastPreviewKey = ""; renderPreview(); }));
  els.save?.addEventListener("click", save);
  els.reset?.addEventListener("click", () => { previewStartAt = Date.now(); draft = structuredClone(DEFAULTS); renderAll(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  socket?.on("voiceListSettings", (remote) => {
    settings = merge(DEFAULTS, remote || {});
    if (!modal.classList.contains("show")) draft = structuredClone(settings);
    previewStartAt = Date.now();
    renderAll();
  });

  load();
})();
