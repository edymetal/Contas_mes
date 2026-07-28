import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogAccessibility(onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof document === "undefined") return undefined;

    const previouslyFocused = document.activeElement;
    const focusTarget = dialog.querySelector("[autofocus]")
      || dialog.querySelector(FOCUSABLE_SELECTOR)
      || dialog;
    const animationFrame = window.requestAnimationFrame(() => focusTarget.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusableElements = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hasAttribute("hidden"));
      if (!focusableElements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    dialog.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      dialog.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return dialogRef;
}
