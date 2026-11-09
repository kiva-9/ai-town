// Standalone editors run without React. Keep the preference compatible with the game.
export const LOCALE_KEY = 'ai-town.locale';
export const messages = {
  editors: ['小镇编辑工具', 'Town editors'],
  levelEditor: ['地图编辑器', 'Level editor'],
  spriteEditor: ['精灵编辑器', 'Sprite editor'],
  language: ['界面语言', 'Language'],
  edit: ['编辑', 'Edit'],
  map: ['地图预览', 'Map preview'],
  config: ['配置', 'Configuration'],
  compositePng: ['导出合成图（PNG）', 'Export composite (PNG)'],
  loadLevel: ['加载地图（.js）', 'Load level (.js)'],
  loadComposite: ['加载合成图（PNG）', 'Load composite (PNG)'],
  loadSprite: ['加载精灵', 'Load sprite'],
  saveComposite: ['保存合成图', 'Save composite'],
  loadTileset: ['加载图块集', 'Load tileset'],
  tileSize: ['图块大小（像素）', 'Tile size (pixels)'],
  background: ['背景图层', 'Background layer'],
  objects: ['物体图层', 'Object layer'],
  layerThree: ['第三图层', 'Third layer'],
  layerFour: ['第四图层', 'Fourth layer'],
  tileset: ['图块集', 'Tileset'],
  composite: ['合成预览', 'Composite preview'],
  fileError: ['读取文件失败，请检查文件后重试。', 'Unable to read the file. Check the file and try again.'],
  help: ['操作说明与快捷键', 'Controls and keyboard shortcuts'],
  controls: ['先在右上方选择图块，再点击左侧图层绘制。快捷键仍使用英文字母。', 'Select tiles in the upper-right pane, then click a layer on the left to paint. Shortcuts use the same letter keys in both languages.'],
  shortcuts: ['S：导出文件；Ctrl+Z：撤销；M：遮罩；按住 D 并点击：删除。', 'S: export; Ctrl+Z: undo; M: mask; hold D and click: delete.'],
  levelShortcuts: ['地图专用：F 填充背景图层；G 切换网格；P 切换图块大小。', 'Level editor: F fills the background; G toggles the grid; P switches tile size.'],
  formats: ['语言切换不会改变图块编号、文件路径或导出字段。仅加载你信任的地图 JavaScript 文件。', 'Changing language does not change tile IDs, file paths, or export fields. Only load JavaScript map files you trust.'],
};

export function readLocale() {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

let locale = readLocale();

export function t(key) {
  return messages[key]?.[locale === 'en' ? 1 : 0] ?? key;
}

export function applyLocale(nextLocale) {
  locale = nextLocale === 'en' ? 'en' : 'zh-CN';
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  });
  const selector = document.getElementById('editor-language');
  if (selector) selector.value = locale;
}

export function initEditorLocale() {
  const selector = document.getElementById('editor-language');
  selector?.addEventListener('change', (event) => {
    const value = event.target.value;
    try {
      localStorage.setItem(LOCALE_KEY, value);
    } catch {
      // Private browsing may disable storage; language switching still works.
    }
    applyLocale(value);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === LOCALE_KEY || event.key === null) applyLocale(readLocale());
  });
  applyLocale(locale);
}

if (typeof document !== 'undefined') initEditorLocale();
