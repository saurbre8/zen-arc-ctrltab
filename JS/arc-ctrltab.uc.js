// ==UserScript==
// @name           Arc Ctrl+Tab
// @description    Visual Ctrl+Tab switcher built on Zen's own panel: most recently used first, three layouts, hold or sticky mode.
// @include        main
// ==/UserScript==

(() => {
  if (window.__zenArcCtrlTab) return;
  window.__zenArcCtrlTab = true;

  const HTML = 'http://www.w3.org/1999/xhtml';
  const P = 'zen-arc-ctrltab.';
  const prefs = Services.prefs;
  const pref = (name, def) => {
    const key = P + name;
    switch (prefs.getPrefType(key)) {
      case prefs.PREF_BOOL: return prefs.getBoolPref(key);
      case prefs.PREF_INT: return prefs.getIntPref(key);
      case prefs.PREF_STRING: return prefs.getStringPref(key);
    }
    return def;
  };

  // The switcher's shortcut: modifiers (Ctrl, Alt, Cmd) plus one key, e.g. "Alt+Tab". Firefox only knows
  // Ctrl+Tab, so any other shortcut is matched here, by physical key (event.code) so Option+letter on a Mac
  // still works. Shift is not part of it: it runs the switcher backwards.
  const MODIFIERS = { ctrl: 'ctrl', control: 'ctrl', alt: 'alt', option: 'alt', opt: 'alt', cmd: 'meta', command: 'meta', meta: 'meta', super: 'meta', win: 'meta' };
  const HOLD_KEY = { ctrl: 'Control', alt: 'Alt', meta: 'Meta' };
  const KEY_CODES = {
    tab: 'Tab', space: 'Space', '`': 'Backquote', backquote: 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft',
    ']': 'BracketRight', ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', '\\': 'Backslash',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', pageup: 'PageUp', pagedown: 'PageDown',
    home: 'Home', end: 'End', enter: 'Enter', escape: 'Escape', esc: 'Escape', backspace: 'Backspace', delete: 'Delete',
  };
  const keyCode = (k) => {
    if (/^[a-z]$/.test(k)) return 'Key' + k.toUpperCase();
    if (/^[0-9]$/.test(k)) return 'Digit' + k;
    if (/^f(?:[1-9]|1[0-2])$/.test(k)) return k.toUpperCase();
    return KEY_CODES[k];
  };
  const parseShortcut = (text) => {
    const mods = new Set();
    let code;
    for (const part of String(text).split('+').map((s) => s.trim().toLowerCase())) {
      if (MODIFIERS[part]) mods.add(MODIFIERS[part]);
      else if (!code && keyCode(part)) code = keyCode(part);
      else return null;
    }
    if (!code || !mods.size) return null;
    if (code === 'Tab' && mods.size === 1 && mods.has('ctrl')) return null; // Firefox's own shortcut
    return { mods, code, hold: [...mods].map((m) => HOLD_KEY[m]) };
  };
  // null means Ctrl+Tab: the default, or a setting that could not be read.
  let parsed = {};
  const shortcut = () => {
    const text = String(pref('shortcut', 'Ctrl+Tab'));
    if (parsed.text !== text) parsed = { text, value: parseShortcut(text) };
    return parsed.value;
  };
  const matches = (s, e) => e.code === s.code && e.ctrlKey === s.mods.has('ctrl') && e.altKey === s.mods.has('alt') && e.metaKey === s.mods.has('meta');

  // Touching ctrlTab loads Firefox's browser-ctrlTab.js, which also defines tabPreviews and tabPreviewPanelHelper.
  const native = ctrlTab;
  const { tabPreviews, tabPreviewPanelHelper } = window;
  const panel = document.getElementById('ctrlTab-panel');
  const list = document.getElementById('ctrlTab-previews');
  const el = (tag, cls) => {
    const e = document.createElementNS(HTML, tag);
    if (cls) e.className = cls;
    return e;
  };
  const layout = () => panel.getAttribute('zac-layout');
  const scale = () => Math.min(3, Math.max(0.5, pref('size', 100) / 100));

  // Firefox's switcher takes over Ctrl+Tab from the tab bar. With a shortcut of our own, give Ctrl+Tab back to it,
  // and make the switcher ignore Ctrl+Tab.
  const syncCtrlTab = () => { gBrowser.tabbox.handleCtrlTab = !native._recentlyUsedTabs || !!shortcut(); };
  const init = native._init;
  native._init = function (enable) {
    init.call(this, enable);
    syncCtrlTab();
  };
  const onKeyDown = native.onKeyDown;
  native.onKeyDown = function (event) {
    if (!shortcut()) return onKeyDown.call(this, event);
    return undefined;
  };

  // Firefox's switcher has these as its only switches; the mod's settings drive them.
  const apply = () => {
    prefs.setBoolPref('browser.ctrlTab.sortByRecentlyUsed', pref('enabled', true));
    prefs.setBoolPref('zen.ctrlTab.show-pending-tabs', pref('show-unloaded', true));
    prefs.setIntPref('browser.ctrlTab.maxPreviews', pref('max-tabs', 10));

    panel.setAttribute('zac-layout', ['grid', 'list', 'split'][pref('layout', 0)] ?? 'grid');
    panel.toggleAttribute('zac-no-showall', !pref('show-all-button', true));
    native.previewsPerRow = layout() === 'grid' ? pref('tiles-per-row', 5) : 1;
    panel.style.setProperty('--zac-scale', scale());
    // Every preview box, loaded or not, gets the thumbnail shape, so tiles never change size.
    panel.style.setProperty('--zac-ratio', 1 / tabPreviews.aspectRatio);
    const accent = String(pref('accent', '')).trim();
    if (accent) panel.style.setProperty('--ctrltab-accent', accent);
    else panel.style.removeProperty('--ctrltab-accent');
    syncCtrlTab();
  };

  // The popup is a transparent window as big as the browser window ("stage"); the visible panel ("card") is
  // an ordinary element centred inside it. Centring and click-outside then follow what is drawn, not OS
  // window geometry. The split layout's big preview sits beside the list inside one body.
  const stage = el('div');
  stage.id = 'zac-stage';
  const card = el('div');
  card.id = 'zac-card';
  const body = el('div');
  body.id = 'zac-body';
  const pane = el('div');
  pane.id = 'zac-pane';
  body.append(list, pane);
  card.append(body, document.getElementById('ctrlTab-showAll-container'));
  stage.append(card);
  panel.append(stage);
  stage.addEventListener('mousedown', (e) => {
    if (e.target === stage) panel.hidePopup();
  });

  // Only the grid layout wants thumbnails in its tiles; the split pane asks for its own.
  const getThumb = tabPreviews.get.bind(tabPreviews);
  tabPreviews.get = (tab) => (layout() === 'grid' ? getThumb(tab) : Promise.resolve(null));

  // Unloaded tabs get a flag so the CSS can mute them.
  const updatePreview = native.updatePreview;
  native.updatePreview = function (preview, tab) {
    updatePreview.call(this, preview, tab);
    preview.toggleAttribute('zac-unloaded', !!tab?.hasAttribute('pending'));
  };

  // Optionally leave out pinned tabs that are not loaded, so pinned ones only appear while in use.
  const tabList = Object.getOwnPropertyDescriptor(native, 'tabList').get;
  Object.defineProperty(native, 'tabList', {
    configurable: true,
    get() {
      const tabs = tabList.call(this);
      return pref('hide-unloaded-pinned', false) ? tabs.filter((t) => !(t.pinned && t.hasAttribute('pending'))) : tabs;
    },
  });

  // Firefox waits 200 ms before showing the panel, so a quick Ctrl+Tab just flips back; make that wait adjustable.
  const open = native.open;
  native.open = function () {
    const before = this._timer;
    open.call(this);
    const delay = pref('open-delay', 200);
    if (!this._timer || this._timer === before || delay === 200) return;
    clearTimeout(this._timer);
    this._timer = null;
    if (delay === 0) this._openPanel();
    else this._timer = setTimeout(() => { this._timer = null; this._openPanel(); }, delay);
  };

  let shown = 0;
  const showInPane = async (tab) => {
    const mine = ++shown;
    const shot = el('div', 'zac-shot');
    const meta = el('div', 'zac-meta');
    const icon = el('img', 'zac-icon');
    if (tab.image) icon.src = tab.image;
    const title = el('div', 'zac-title');
    title.textContent = tab.label;
    const host = el('div', 'zac-host');
    try { host.textContent = tab.linkedBrowser.currentURI.host; } catch {}
    const text = el('div');
    text.append(title, host);
    meta.append(icon, text);
    pane.toggleAttribute('zac-unloaded', tab.hasAttribute('pending'));
    pane.replaceChildren(shot, meta);
    // Title and icon appear at once; the thumbnail waits until the highlight stops moving.
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (mine !== shown) return;
    const img = await getThumb(tab).catch(() => null);
    if (img && mine === shown) shot.append(img);
  };
  list.addEventListener('focusin', (e) => {
    if (layout() === 'split' && e.target._tab) showInPane(e.target._tab);
  });

  // Releasing the shortcut's modifier picks the highlighted tab; Firefox only knows that for Ctrl. In sticky mode
  // releasing it no longer picks: the panel waits for Enter, a click or Esc.
  const handleEvent = native.handleEvent;
  native.handleEvent = function (event) {
    const custom = shortcut();
    const released = event.type === 'keyup' && (custom ? custom.hold.includes(event.key) : event.keyCode === event.DOM_VK_CONTROL);
    if (!released || !(custom || (pref('open-mode', 0) === 1 && this.isOpen))) return handleEvent.call(this, event);
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener('keyup', this, { mozSystemGroup: true });
    if (this.isOpen && pref('open-mode', 0) !== 1) this.pick();
    return undefined;
  };

  // Firefox's onKeyDown for a shortcut of our own: open the panel, or step the highlight if it is open.
  const cycle = (e) => {
    if (e.defaultPrevented || native.KeyboardLockUtils?.mustWaitForKeyboardLockRequestedReply(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (native.isOpen) {
      native.advanceFocus(!e.shiftKey);
      return;
    }
    if (e.shiftKey) {
      native.showAllTabs('shift-tab');
      return;
    }
    document.addEventListener('keyup', native, { mozSystemGroup: true });
    const tabs = gBrowser.visibleTabs;
    if (tabs.length > 2) native.open();
    else if (tabs.length === 2) {
      const { TabMetrics } = gBrowser;
      gBrowser.setSelectedTab(tabs[tabs[0].selected ? 1 : 0], TabMetrics.userTriggeredContext(TabMetrics.METRIC_SOURCE.CTRL_TAB));
    }
  };

  // Arrow keys move the highlight; Enter and Esc are the panel's own.
  const move = (step, wrap) => {
    const items = native.previews.filter((p) => !p.hidden);
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    const to = wrap ? (at + step + items.length) % items.length : Math.min(items.length - 1, Math.max(0, at + step));
    items[to].focus();
    if (items[to]._tab) gBrowser.warmupTab(items[to]._tab);
  };
  panel.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey) return;
    const grid = layout() === 'grid';
    const cols = native.previewColumnCount;
    const moves = {
      ArrowRight: grid && [1, true],
      ArrowLeft: grid && [-1, true],
      ArrowDown: grid ? [cols, false] : [1, true],
      ArrowUp: grid ? [-cols, false] : [-1, true],
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    move(...moves[e.key]);
  });

  // A popup with focus (the translate offer, a permission prompt) takes Tab for itself and marks the event
  // handled, so Firefox's own Ctrl+Tab listener skips it. Catch the shortcut first, on the way down.
  // The same listener slows the key's auto-repeat, so holding Tab steps at a pace the eye can follow.
  // A shortcut of our own is handled here completely, since Firefox does not know it.
  let lastStep = 0;
  window.addEventListener('keydown', (e) => {
    if (!prefs.getBoolPref('browser.ctrlTab.sortByRecentlyUsed', false)) return;
    const custom = shortcut();
    if (custom ? !matches(custom, e) : ShortcutUtils.getSystemActionForEvent(e) !== ShortcutUtils.CYCLE_TABS) return;
    const rate = pref('repeat-speed', 8);
    if (e.repeat && rate && e.timeStamp - lastStep < 1000 / rate) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastStep = e.timeStamp;
    if (custom) {
      cycle(e);
      return;
    }
    const popup = e.target.closest?.('panel, menupopup, [popover]');
    if (popup && popup !== panel) native.onKeyDown(e);
  }, true);

  // The card is sized per layout. By default the popup covers the window; compact makes it only as big as the card.
  const root = document.documentElement;
  native._openPanel = function () {
    tabPreviewPanelHelper.opening(this);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = scale();
    const compact = pref('compact', false);
    const width = {
      grid: Math.min(w * 0.96, this.canvasWidth * 1.25 * this.previewColumnCount * s),
      list: Math.min(w * 0.96, 640 * s),
      split: Math.min(w * 0.96, 1180 * s),
    }[layout()];
    card.style.width = width + 'px';
    panel.toggleAttribute('zac-compact', compact);
    panel.style.width = (compact ? width : w) + 'px';
    panel.style.height = compact ? '' : h + 'px';
    panel.style.setProperty('--zac-max-h', Math.floor(h * 0.7) + 'px');
    // Compact: placed by a guess first, then re-centred with the real height once shown.
    panel.openPopup(root, 'overlap', compact ? (w - width) / 2 : 0, compact ? h * 0.2 : 0);
  };
  panel.addEventListener('popupshown', (e) => {
    if (e.target !== panel || !panel.hasAttribute('zac-compact')) return;
    const r = panel.getBoundingClientRect();
    panel.moveToAnchor(root, 'overlap', (window.innerWidth - r.width) / 2, (window.innerHeight - r.height) / 2);
  });

  const observer = { observe: apply };
  apply();
  prefs.addObserver(P, observer);
  window.addEventListener('unload', () => prefs.removeObserver(P, observer), { once: true });
})();
