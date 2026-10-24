# TanStack Hotkeys input handling

Checked October 24, 2026 against current official documentation and the installed packages. The UI uses `@tanstack/react-hotkeys` 0.16.0, which depends on `@tanstack/hotkeys` 0.17.0. [Installed React adapter manifest](../packages/ui/node_modules/@tanstack/react-hotkeys/package.json).

## Native input protection

TanStack provides `ignoreInputs`; a second application-level input detector is unnecessary for ordinary text fields. Its default, `"auto"`, skips text-producing shortcuts such as `K` while typing, but allows Control/Meta combinations and Escape. Explicit `true` applies input protection to those shortcuts too; `false` permits shortcuts in inputs. Sequences use their first step to choose the automatic behavior. [Sensible defaults](https://tanstack.com/hotkeys/latest/docs/guides/sensible-defaults#typing-in-inputs-does-not-trigger-shortcuts).

Text inputs, textareas, selects, and contenteditable elements are recognized, including inside shadow DOM. Button-type inputs are excluded. A hotkey targeted at the input itself still receives its events. The installed implementation checks both focus and `event.composedPath()`, confirming that the existing shadow-root comment does not justify a duplicate detector. [Sensible defaults](https://tanstack.com/hotkeys/latest/docs/guides/sensible-defaults#typing-in-inputs-does-not-trigger-shortcuts), [installed event-target implementation](../node_modules/.pnpm/@tanstack+hotkeys@0.17.0/node_modules/@tanstack/hotkeys/dist/_event-target.js).

When input protection applies, focused controls also keep the keys they own: button activation, menu/listbox typeahead, and widget navigation. This is key-specific rather than treating every widget as a text field. [Focused controls](https://tanstack.com/hotkeys/latest/docs/guides/sensible-defaults#focused-controls-keep-their-own-keys).

Installed-source limits: `role="separator"` and `role="textbox"` alone are not listed as protected controls. A slider owns navigation keys, but not arbitrary letters. Actual text inputs and contenteditable elements remain protected regardless of their ARIA role. These differences do not establish a need for another broad input detector. [Installed event-target implementation](../node_modules/.pnpm/@tanstack+hotkeys@0.17.0/node_modules/@tanstack/hotkeys/dist/_event-target.js).

## Shared hook configuration

Keep `ignoreInputs: true` as the shared hook's default to preserve its existing policy, including suppressing `Mod+B` in text fields. Remove `isKeyboardShortcutInput` and its callback check. Continue forwarding per-shortcut options so callers can deliberately opt into input handling. TanStack's `useHotkeys` supports common options and individual overrides. [React hotkey options](https://tanstack.com/hotkeys/latest/docs/framework/react/guides/hotkeys#hotkey-options), [shared options](https://tanstack.com/hotkeys/latest/docs/framework/react/guides/hotkeys#share-options).

Overlay suppression is a separate application rule: the current helper suspends background shortcuts whenever a matching overlay is open. `ignoreInputs` examines focus/event targets; it does not express that global open-overlay condition. Retain the overlay rule during this cleanup. [Current overlay helper](../packages/ui/src/lib/keyboard-shortcuts.ts), [installed manager filtering](../node_modules/.pnpm/@tanstack+hotkeys@0.17.0/node_modules/@tanstack/hotkeys/dist/hotkey-manager.js).
