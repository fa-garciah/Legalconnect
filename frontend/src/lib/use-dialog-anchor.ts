/**
 * T048 — what a modal dialog has to put back when it closes.
 *
 * Two things, and neither happens on its own in this composition.
 *
 * **Focus.** A modal `DialogContent` overrides the focus scope's own "restore whatever was
 * focused before" and focuses its `DialogTrigger` instead. That is right for the usual
 * composition. These dialogs are driven from a parent's state and have no `DialogTrigger`,
 * so the override focuses nothing and a keyboard user pressing Escape is dropped on the
 * document body (FR-025).
 *
 * **Scroll position.** The modal locks body scrolling by setting `overflow: hidden`, and
 * the browser discards the document's scroll offset when it does. Opening a dialog from
 * row 40 of a directory therefore jumps the page to the top, and closing it leaves it
 * there. Measured, not assumed: scrollY 400 before opening, 0 after.
 *
 * That second one is the whole reason `018` renders a client's record as a dialog instead
 * of a `/clientes/[id]` route (FR-027, SC-014). The route was rejected precisely so that
 * someone three pages into a filtered directory comes back to where they were. Losing the
 * scroll position means paying the route's cost — no shareable link to a client — and
 * getting the route's drawback anyway.
 *
 * Spread the returned props onto the `DialogContent` / `AlertDialogContent`, and pass the
 * same `open` you pass the dialog.
 */
import { useRef, useState } from 'react';

export interface DialogAnchorProps {
  readonly onOpenAutoFocus: (event: Event) => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}

export function useDialogAnchor(open: boolean): DialogAnchorProps {
  const openerRef = useRef<HTMLElement | null>(null);

  /*
   * The scroll position is latched here, during the render in which `open` becomes true —
   * NOT in `onOpenAutoFocus` below, where the first attempt put it.
   *
   * That attempt read zero every time, and the reason is ordering. The scroll lock is
   * applied by an effect belonging to the dialog's own content, which is a descendant, and
   * descendant effects run before this component's. By the time any mount handler fires,
   * `overflow: hidden` is already on the body and the document's scroll offset has already
   * been discarded. This render, in contrast, happens after the click and before any of
   * that — it is the last moment the real value exists.
   *
   * State rather than a ref, adjusted during render: this is React's own pattern for a
   * value derived from a prop changing, and it is what `QueryBoundary` and `ClientFilters`
   * already use here. A ref would say the same thing and is not allowed to be written
   * during render — which is the rule that pointed at the ordering problem in the first
   * place.
   */
  const [anchorScrollY, setAnchorScrollY] = useState(0);
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (open && typeof window !== 'undefined') {
      setAnchorScrollY(window.scrollY);
    }
  }

  return {
    /*
     * Fires before focus moves into the content — the last moment `document.activeElement`
     * is still the opener. Focus survives the scroll lock, so unlike the scroll offset it
     * can be captured here.
     */
    onOpenAutoFocus: () => {
      openerRef.current = document.activeElement as HTMLElement | null;
    },

    onCloseAutoFocus: (event: Event) => {
      // Suppress the trigger-focusing override; we know where focus actually came from.
      event.preventDefault();

      // `preventScroll`, or focusing the opener scrolls it into view and fights the
      // restore below — the two would race and the page would land somewhere neither
      // intended.
      openerRef.current?.focus({ preventScroll: true });

      /*
       * Restoring once is not enough, and the reason is worth stating so nobody simplifies
       * it back.
       *
       * The lock is `overflow: hidden` on the body. While it is applied the document's
       * height collapses to the viewport, so the browser clamps the scroll offset to zero —
       * which is why the offset had to be latched before the dialog opened. Releasing the
       * lock restores the height, but not the offset, and the release happens in a
       * different task from this handler. A single `scrollTo` here can therefore land while
       * the document is still short, be clamped to zero again, and look like it did nothing.
       *
       * So it is re-applied for a few frames and stops as soon as it holds. Bounded rather
       * than a loop with a condition, because the failure mode of getting the condition
       * wrong is a page that fights the reader's own scrolling.
       */
      const y = anchorScrollY;
      const MAX_FRAMES = 5;

      const restore = (frame: number): void => {
        window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
        if (window.scrollY === y || frame >= MAX_FRAMES) return;
        requestAnimationFrame(() => restore(frame + 1));
      };

      restore(0);
    },
  };
}
