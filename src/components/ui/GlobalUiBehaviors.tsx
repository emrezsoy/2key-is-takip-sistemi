"use client";

import { useEffect } from "react";

const TEXT_TYPES = /^(text|search|email|url|tel|number|password|date|time|datetime-local|month|week)$/;
const CONFIRM_TEXT = "Kaydedilmemiş değişiklikler var. Yine de kapatmak istediğinden emin misin?";

/** Uygulama genelindeki iki davranış:
 *
 * 1) Açık bir pencerenin (dialog) dışındaki boşluğa tıklayınca pencere kapanır. Pencerede yazılmış ama kaydedilmemiş
 *    bir değişiklik varsa kapatmadan önce onay sorulur. Kapanmaması gereken pencereye `data-no-backdrop-close`,
 *    çizim gibi alan değişikliği algılanamayan pencerelere `data-confirm-close` verilir.
 * 2) Sayfada dosya sürüklenip bırakma alanı olmayan yere bırakılırsa tarayıcı dosyayı açıp sayfadan ayrılmasın. */
export function GlobalUiBehaviors() {
  useEffect(() => {
    // Değişiklik yapılmış form (yoksa pencere) kayıtları. Form gönderilince ya da pencere kapanınca silinir.
    const dirty = new WeakSet<Element>();
    let downTarget: EventTarget | null = null;

    const markDirty = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.closest("dialog")) return;
      const inForm = !!t.closest("form");
      let entry = false;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) entry = true;
      else if (t instanceof HTMLInputElement) entry = t.type === "file" ? inForm : inForm || TEXT_TYPES.test(t.type);
      else if (t.isContentEditable) entry = true;
      // Dosya bırakma: formlarda dosya gönderilmeyi bekler (kaydedilmemiş değişiklik); diğer pencerelerde anında yüklenir.
      if (e.type === "drop") entry = inForm;
      if (!entry) return;
      const owner = t.closest("form") ?? t.closest("dialog");
      if (owner) dirty.add(owner);
    };
    const clearDirty = (e: Event) => {
      if (e.target instanceof Element) dirty.delete(e.target);
    };

    const onPointerDown = (e: Event) => {
      downTarget = e.target;
    };

    const onClick = (e: MouseEvent) => {
      const dialog = e.target;
      if (!(dialog instanceof HTMLDialogElement)) return;
      // Boşluğa basıp içeride bırakma (ör. metin seçerken) ya da tersi pencereyi kapatmasın.
      if (downTarget !== dialog) return;
      if (!dialog.open || !dialog.matches(":modal")) return;
      if (dialog.hasAttribute("data-no-backdrop-close")) return;
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) return;

      const needsConfirm =
        dialog.hasAttribute("data-confirm-close") ||
        dirty.has(dialog) ||
        Array.from(dialog.querySelectorAll("form")).some((f) => dirty.has(f));
      if (needsConfirm && !window.confirm(CONFIRM_TEXT)) return;
      dialog.close();
    };

    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    // Bırakma alanı dışına düşen dosya sayfadan ayrılmaya yol açmasın.
    const guardOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const guardDrop = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("drop", markDirty, true);
    document.addEventListener("submit", clearDirty, true);
    document.addEventListener("reset", clearDirty, true);
    document.addEventListener("close", clearDirty, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);
    window.addEventListener("dragover", guardOver);
    window.addEventListener("drop", guardDrop);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("drop", markDirty, true);
      document.removeEventListener("submit", clearDirty, true);
      document.removeEventListener("reset", clearDirty, true);
      document.removeEventListener("close", clearDirty, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick);
      window.removeEventListener("dragover", guardOver);
      window.removeEventListener("drop", guardDrop);
    };
  }, []);

  return null;
}
