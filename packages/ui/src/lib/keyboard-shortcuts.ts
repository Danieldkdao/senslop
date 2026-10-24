export const hasOpenKeyboardOverlay = () =>
  !!document.querySelector(
    '[role="dialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"]',
  );
