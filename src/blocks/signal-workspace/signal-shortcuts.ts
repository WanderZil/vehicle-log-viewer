export type ShortcutPlatformHint = 'windows' | 'macos';

export type ShortcutBinding = {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  key: string;
  code?: string;
};

export type SignalShortcutDef = {
  id: string;
  labelKey: string;
  windows: ShortcutBinding[];
  macos: ShortcutBinding[];
  /** Keys shown in the help card (may differ from binding for clarity). */
  windowsDisplay: string[];
  macosDisplay: string[];
};

export function isMacOs() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function runtimeShortcutPlatform(): ShortcutPlatformHint {
  return isMacOs() ? 'macos' : 'windows';
}

function bindingMatches(event: KeyboardEvent, binding: ShortcutBinding) {
  const ctrl = binding.ctrl ?? false;
  const meta = binding.meta ?? false;
  const shift = binding.shift ?? false;
  const alt = binding.alt ?? false;

  if (event.ctrlKey !== ctrl) return false;
  if (event.metaKey !== meta) return false;
  if (event.shiftKey !== shift) return false;
  if (event.altKey !== alt) return false;

  if (binding.code) {
    return event.code === binding.code;
  }

  return event.key.toLowerCase() === binding.key.toLowerCase();
}

export function matchesShortcut(
  event: KeyboardEvent,
  def: SignalShortcutDef,
  platform: ShortcutPlatformHint = runtimeShortcutPlatform()
) {
  const bindings = platform === 'macos' ? def.macos : def.windows;
  return bindings.some((binding) => bindingMatches(event, binding));
}

export function formatShortcutDisplay(
  def: SignalShortcutDef,
  hintPlatform: ShortcutPlatformHint
) {
  return hintPlatform === 'macos' ? def.macosDisplay : def.windowsDisplay;
}

export const SIGNAL_SHORTCUTS: SignalShortcutDef[] = [
  {
    id: 'main-cursor',
    labelKey: 'analyses.shortcuts.main_cursor',
    windows: [{ ctrl: true, key: '.' }],
    macos: [{ ctrl: true, key: '.' }],
    windowsDisplay: ['Ctrl', '.'],
    macosDisplay: ['⌃', '.'],
  },
  {
    id: 'diff-cursor',
    labelKey: 'analyses.shortcuts.diff_cursor',
    windows: [{ ctrl: true, key: ',' }],
    macos: [{ ctrl: true, key: ',' }],
    windowsDisplay: ['Ctrl', ','],
    macosDisplay: ['⌃', ','],
  },
  {
    id: 'fit-all',
    labelKey: 'analyses.shortcuts.fit_all',
    windows: [{ ctrl: true, key: 'w' }],
    macos: [{ ctrl: true, shift: true, key: 'w' }],
    windowsDisplay: ['Ctrl', 'W'],
    macosDisplay: ['⌃', '⇧', 'W'],
  },
  {
    id: 'reset-diff',
    labelKey: 'analyses.shortcuts.reset_diff',
    windows: [{ ctrl: true, shift: true, key: ',' }],
    macos: [{ ctrl: true, shift: true, key: ',' }],
    windowsDisplay: ['Ctrl', 'Shift', ','],
    macosDisplay: ['⌃', '⇧', ','],
  },
  {
    id: 'move-left',
    labelKey: 'analyses.shortcuts.move_cursor_left',
    windows: [{ key: 'ArrowLeft' }],
    macos: [{ key: 'ArrowLeft' }],
    windowsDisplay: ['←'],
    macosDisplay: ['←'],
  },
  {
    id: 'move-right',
    labelKey: 'analyses.shortcuts.move_cursor_right',
    windows: [{ key: 'ArrowRight' }],
    macos: [{ key: 'ArrowRight' }],
    windowsDisplay: ['→'],
    macosDisplay: ['→'],
  },
  {
    id: 'zoom-in',
    labelKey: 'analyses.shortcuts.zoom_in',
    windows: [
      { ctrl: true, key: '=' },
      { ctrl: true, key: '+' },
    ],
    macos: [
      { ctrl: true, key: '=' },
      { ctrl: true, key: '+' },
    ],
    windowsDisplay: ['Ctrl', '+'],
    macosDisplay: ['⌃', '+'],
  },
  {
    id: 'zoom-out',
    labelKey: 'analyses.shortcuts.zoom_out',
    windows: [{ ctrl: true, key: '-' }],
    macos: [{ ctrl: true, key: '-' }],
    windowsDisplay: ['Ctrl', '-'],
    macosDisplay: ['⌃', '-'],
  },
  {
    id: 'zoom-reset',
    labelKey: 'analyses.shortcuts.zoom_reset',
    windows: [{ ctrl: true, key: '0' }],
    macos: [{ ctrl: true, key: '0' }],
    windowsDisplay: ['Ctrl', '0'],
    macosDisplay: ['⌃', '0'],
  },
  {
    id: 'view-overlay',
    labelKey: 'analyses.shortcuts.view_overlay',
    windows: [{ ctrl: true, shift: true, key: 'o' }],
    macos: [{ ctrl: true, shift: true, key: 'o' }],
    windowsDisplay: ['Ctrl', 'Shift', 'O'],
    macosDisplay: ['⌃', '⇧', 'O'],
  },
  {
    id: 'view-stacked',
    labelKey: 'analyses.shortcuts.view_stacked',
    windows: [{ ctrl: true, shift: true, key: 's' }],
    macos: [{ ctrl: true, shift: true, key: 's' }],
    windowsDisplay: ['Ctrl', 'Shift', 'S'],
    macosDisplay: ['⌃', '⇧', 'S'],
  },
  {
    id: 'zoom-mode-cursor',
    labelKey: 'analyses.shortcuts.zoom_reset',
    windows: [{ ctrl: true, key: '1' }],
    macos: [{ ctrl: true, key: '1' }],
    windowsDisplay: ['Ctrl', '1'],
    macosDisplay: ['⌃', '1'],
  },
  {
    id: 'zoom-mode-box',
    labelKey: 'analyses.shortcuts.zoom_mode_box',
    windows: [{ ctrl: true, key: '2' }],
    macos: [{ ctrl: true, key: '2' }],
    windowsDisplay: ['Ctrl', '2'],
    macosDisplay: ['⌃', '2'],
  },
  {
    id: 'zoom-mode-x',
    labelKey: 'analyses.shortcuts.zoom_mode_x',
    windows: [{ ctrl: true, key: '3' }],
    macos: [{ ctrl: true, key: '3' }],
    windowsDisplay: ['Ctrl', '3'],
    macosDisplay: ['⌃', '3'],
  },
  {
    id: 'zoom-mode-y',
    labelKey: 'analyses.shortcuts.zoom_mode_y',
    windows: [{ ctrl: true, key: '4' }],
    macos: [{ ctrl: true, key: '4' }],
    windowsDisplay: ['Ctrl', '4'],
    macosDisplay: ['⌃', '4'],
  },
  {
    id: 'add-signal',
    labelKey: 'analyses.shortcuts.add_signal',
    windows: [{ ctrl: true, shift: true, key: 'a' }],
    macos: [{ meta: true, shift: true, key: 'a' }],
    windowsDisplay: ['Ctrl', 'Shift', 'A'],
    macosDisplay: ['⌘', '⇧', 'A'],
  },
  {
    id: 'toggle-diff',
    labelKey: 'analyses.shortcuts.diff_cursor',
    windows: [{ ctrl: true, key: 'd' }],
    macos: [{ ctrl: true, key: 'd' }],
    windowsDisplay: ['Ctrl', 'D'],
    macosDisplay: ['⌃', 'D'],
  },
  {
    id: 'show-help',
    labelKey: 'analyses.shortcuts.show_help',
    windows: [{ key: '?' }, { shift: true, key: '/' }],
    macos: [{ key: '?' }, { shift: true, key: '/' }],
    windowsDisplay: ['?'],
    macosDisplay: ['?'],
  },
  {
    id: 'cancel',
    labelKey: 'analyses.shortcuts.cancel',
    windows: [{ key: 'Escape' }],
    macos: [{ key: 'Escape' }],
    windowsDisplay: ['Esc'],
    macosDisplay: ['Esc'],
  },
];

export const SHORTCUT_CATEGORIES: { id: string; labelKey: string; shortcutIds: string[] }[] = [
  {
    id: 'cursor',
    labelKey: 'analyses.shortcuts.category_cursor',
    shortcutIds: [
      'main-cursor',
      'diff-cursor',
      'toggle-diff',
      'reset-diff',
      'move-left',
      'move-right',
    ],
  },
  {
    id: 'view',
    labelKey: 'analyses.shortcuts.category_view',
    shortcutIds: [
      'fit-all',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'view-overlay',
      'view-stacked',
      'zoom-mode-cursor',
      'zoom-mode-box',
      'zoom-mode-x',
      'zoom-mode-y',
    ],
  },
  {
    id: 'signals',
    labelKey: 'analyses.shortcuts.category_signals',
    shortcutIds: ['add-signal'],
  },
  {
    id: 'general',
    labelKey: 'analyses.shortcuts.category_general',
    shortcutIds: ['show-help', 'cancel'],
  },
];

export function shortcutById(id: string) {
  return SIGNAL_SHORTCUTS.find((item) => item.id === id);
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.closest('[contenteditable="true"], [role="textbox"]'));
}
