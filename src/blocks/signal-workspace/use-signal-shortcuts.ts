import { useEffect, useRef } from 'react';

import {
  isEditableTarget,
  matchesShortcut,
  runtimeShortcutPlatform,
  shortcutById,
} from './signal-shortcuts';
import type { useSignalWorkspace } from './use-signal-workspace';

type Workspace = ReturnType<typeof useSignalWorkspace>;

export type ActiveCursor = 'main' | 'diff';

const CURSOR_STEP = 0.01;

export function useSignalShortcuts({
  ws,
  onOpenHelp,
  onAddSignal,
  shortcutsOpen,
  pickerOpen,
  groupDialogOpen,
}: {
  ws: Workspace;
  onOpenHelp: () => void;
  onAddSignal: () => void;
  shortcutsOpen: boolean;
  pickerOpen: boolean;
  groupDialogOpen?: boolean;
}) {
  const activeCursorRef = useRef<ActiveCursor>('main');

  useEffect(() => {
    const platform = runtimeShortcutPlatform();

    const nudgeCursor = (direction: -1 | 1) => {
      const target = activeCursorRef.current;
      if (target === 'diff' && ws.diffOn) {
        ws.nudgeDiffCursor(direction, CURSOR_STEP);
        return;
      }
      ws.nudgeMainCursor(direction, CURSOR_STEP);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const mainCursor = shortcutById('main-cursor');
      const diffCursor = shortcutById('diff-cursor');
      const fitAll = shortcutById('fit-all');
      const resetDiff = shortcutById('reset-diff');
      const moveLeft = shortcutById('move-left');
      const moveRight = shortcutById('move-right');
      const zoomIn = shortcutById('zoom-in');
      const zoomOut = shortcutById('zoom-out');
      const zoomReset = shortcutById('zoom-reset');
      const viewOverlay = shortcutById('view-overlay');
      const viewStacked = shortcutById('view-stacked');
      const zoomModeCursor = shortcutById('zoom-mode-cursor');
      const zoomModeBox = shortcutById('zoom-mode-box');
      const zoomModeX = shortcutById('zoom-mode-x');
      const zoomModeY = shortcutById('zoom-mode-y');
      const addSignal = shortcutById('add-signal');
      const toggleDiff = shortcutById('toggle-diff');
      const showHelp = shortcutById('show-help');
      const cancel = shortcutById('cancel');

      if (mainCursor && matchesShortcut(event, mainCursor, platform)) {
        event.preventDefault();
        const turningOn = !ws.mainCursorActive;
        activeCursorRef.current = turningOn ? 'main' : activeCursorRef.current;
        ws.activateMainCursor();
        return;
      }

      if (diffCursor && matchesShortcut(event, diffCursor, platform)) {
        event.preventDefault();
        const turningOn = !ws.diffCursorActive;
        activeCursorRef.current = turningOn ? 'diff' : 'main';
        ws.activateDiffCursor();
        return;
      }

      if (fitAll && matchesShortcut(event, fitAll, platform)) {
        event.preventDefault();
        ws.resetZoom();
        return;
      }

      if (resetDiff && matchesShortcut(event, resetDiff, platform)) {
        event.preventDefault();
        // Force-on + re-place both cursors (main t0 + diff t1).
        activeCursorRef.current = 'diff';
        ws.resetDiffCursor();
        return;
      }

      if (moveLeft && matchesShortcut(event, moveLeft, platform)) {
        event.preventDefault();
        nudgeCursor(-1);
        return;
      }

      if (moveRight && matchesShortcut(event, moveRight, platform)) {
        event.preventDefault();
        nudgeCursor(1);
        return;
      }

      if (zoomIn && matchesShortcut(event, zoomIn, platform)) {
        event.preventDefault();
        ws.zoomTimeAt(0.5, 0.8);
        return;
      }

      if (zoomOut && matchesShortcut(event, zoomOut, platform)) {
        event.preventDefault();
        ws.zoomTimeAt(0.5, 1.25);
        return;
      }

      if (zoomReset && matchesShortcut(event, zoomReset, platform)) {
        event.preventDefault();
        ws.resetZoom();
        return;
      }

      if (viewOverlay && matchesShortcut(event, viewOverlay, platform)) {
        event.preventDefault();
        ws.setViewMode('overlay');
        return;
      }

      if (viewStacked && matchesShortcut(event, viewStacked, platform)) {
        event.preventDefault();
        ws.setViewMode('stacked');
        return;
      }

      if (zoomModeCursor && matchesShortcut(event, zoomModeCursor, platform)) {
        event.preventDefault();
        ws.resetZoom();
        return;
      }

      if (zoomModeBox && matchesShortcut(event, zoomModeBox, platform)) {
        event.preventDefault();
        ws.setZoomMode('box');
        return;
      }

      if (zoomModeX && matchesShortcut(event, zoomModeX, platform)) {
        event.preventDefault();
        ws.setZoomMode('x');
        return;
      }

      if (zoomModeY && matchesShortcut(event, zoomModeY, platform)) {
        event.preventDefault();
        ws.setZoomMode('y');
        return;
      }

      if (addSignal && matchesShortcut(event, addSignal, platform)) {
        event.preventDefault();
        onAddSignal();
        return;
      }

      if (toggleDiff && matchesShortcut(event, toggleDiff, platform)) {
        event.preventDefault();
        const turningOn = !ws.diffCursorActive;
        activeCursorRef.current = turningOn ? 'diff' : 'main';
        ws.activateDiffCursor();
        return;
      }

      if (showHelp && matchesShortcut(event, showHelp, platform)) {
        event.preventDefault();
        onOpenHelp();
        return;
      }

      if (cancel && matchesShortcut(event, cancel, platform)) {
        if (shortcutsOpen || pickerOpen || groupDialogOpen) return;
        if (ws.groupPickMode) {
          event.preventDefault();
          ws.clearGroupPick();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ws, onOpenHelp, onAddSignal, shortcutsOpen, pickerOpen, groupDialogOpen]);
}
