import { onBeforeUnmount, nextTick, ref, type Ref } from 'vue';

interface PopoverRefs {
  /** The container wrapping both trigger and panel (for the outside-click test). */
  root: Ref<HTMLElement | null>;
  /** The panel; focus moves here on open. Give it `tabindex="-1"`. */
  panel?: Ref<HTMLElement | null>;
  /** The trigger; focus returns here on Esc / explicit close. */
  trigger?: Ref<HTMLElement | null>;
}

/**
 * Dismissible popover wiring shared by the header's Settings and account menus.
 *
 * - Outside-pointer dismissal (a `focusout` approach mis-fires: clicking
 *   non-focusable text inside a panel blurs the trigger and closes it).
 * - Focus moves into the panel when it opens (keyboard users land on the
 *   content instead of tabbing the whole header) and returns to the trigger
 *   on Esc / explicit close. An outside click intentionally does not restore
 *   focus — it belongs wherever the user clicked.
 *
 * The caller owns the element refs (so they read as used and bind in its
 * template); this composable owns the open state and listeners.
 */
export function usePopover(refs: PopoverRefs) {
  const open = ref(false);

  function onDocumentPointerDown(event: PointerEvent): void {
    if (refs.root.value && !refs.root.value.contains(event.target as Node)) {
      setOpen(false);
    }
  }

  function setOpen(next: boolean): void {
    if (next === open.value) {
      return;
    }
    open.value = next;
    if (next) {
      document.addEventListener('pointerdown', onDocumentPointerDown, true);
      void nextTick(() => refs.panel?.value?.focus());
    } else {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    }
  }

  function toggle(): void {
    setOpen(!open.value);
  }

  /** Close and return focus to the trigger (for Esc / keyboard dismissal). */
  function closeAndRestoreFocus(): void {
    const trigger = refs.trigger?.value;
    setOpen(false);
    trigger?.focus();
  }

  onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));

  return { open, toggle, setOpen, closeAndRestoreFocus };
}
