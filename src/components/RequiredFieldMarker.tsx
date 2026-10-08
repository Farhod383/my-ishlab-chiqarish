import { useEffect } from "react";

/**
 * App-wide: highlights required fields (label ending with "*", or `required` /
 * aria-required) in red while they are empty, and any field the browser reports
 * as invalid (min/max, type). Clears automatically once filled/corrected.
 */
const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select, button[role=combobox]';

function isEmpty(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value.trim() === "";
  // SearchableSelect sets data-empty; Radix Select trigger sets data-placeholder
  return el.hasAttribute("data-empty") || el.hasAttribute("data-placeholder");
}

function isInvalid(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.value === "" ) return false;
    return !el.checkValidity();
  }
  return false;
}

function scan() {
  const required = new Set<Element>();
  document.querySelectorAll("label").forEach((l) => {
    if (!/\*\s*$/.test(l.textContent ?? "")) return;
    const forId = l.getAttribute("for");
    const target = (forId && document.getElementById(forId)) || l.parentElement?.querySelector(FIELD);
    if (target && target !== l) required.add(target);
  });
  document.querySelectorAll("[required], [aria-required=true]").forEach((el) => { if (el.matches(FIELD)) required.add(el); });

  document.querySelectorAll(FIELD).forEach((el) => {
    const disabled = (el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly;
    const bad = !disabled && ((required.has(el) && isEmpty(el)) || isInvalid(el));
    if (bad) { if (!el.hasAttribute("data-req-error")) el.setAttribute("data-req-error", ""); }
    else if (el.hasAttribute("data-req-error")) el.removeAttribute("data-req-error");
  });
}

export function RequiredFieldMarker() {
  useEffect(() => {
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(scan); };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-empty", "data-placeholder", "value", "disabled"] });
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    // Suppress the browser's own "Please fill out this field" bubble — colour only.
    const noBubble = (e: Event) => e.preventDefault();
    document.addEventListener("invalid", noBubble, true);
    schedule();
    return () => { mo.disconnect(); cancelAnimationFrame(raf); document.removeEventListener("input", schedule, true); document.removeEventListener("change", schedule, true); document.removeEventListener("invalid", noBubble, true); };
  }, []);
  return null;
}
