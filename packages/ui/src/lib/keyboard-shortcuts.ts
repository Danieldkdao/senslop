export const hasOpenKeyboardOverlay = () =>
  !!document.querySelector(
    '[role="dialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"]',
  );

export const isPlainKeyboardShortcutBlocked = (event: KeyboardEvent) =>
  event.defaultPrevented ||
  event.isComposing ||
  event.metaKey ||
  event.ctrlKey ||
  event.altKey ||
  event.shiftKey ||
  hasOpenKeyboardOverlay() ||
  // Diff annotation inputs can live inside a shadow root.
  event
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          !!target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="separator"]',
          )),
    );
