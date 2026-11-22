"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Heading1,
  Heading2,
  ImagePlus,
  Loader2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

function parseDoc(raw: string | null) {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as object;
  } catch {
    return undefined;
  }
}

function Btn({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded p-1.5 disabled:opacity-30 ${
        active ? "bg-brand-600 text-white" : "text-(--color-text-muted) hover:bg-(--color-surface-muted)"
      }`}
    >
      {children}
    </button>
  );
}

/** Word benzeri düz yazı editörü. İçerik TipTap JSON metni olarak (string) alınır/verilir. */
export function RichEditor({
  initial,
  editable,
  onChange,
  onReady,
  onUploadImage,
}: {
  initial: string | null;
  editable: boolean;
  /** Verilirse görseller sürükle-bırak / yapıştır / düğme ile eklenebilir; dosyayı yükleyip adresini döner. */
  onUploadImage?: (file: File) => Promise<string>;
  onChange?: (json: string, plainText: string) => void;
  /** Düz metne erişmek isteyen üst bileşen için (kopyalama). */
  onReady?: (getText: () => string) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadRef = useRef(onUploadImage);
  useEffect(() => {
    uploadRef.current = onUploadImage;
  }, [onUploadImage]);

  // Görselleri yükleyip belirtilen konuma (yoksa imlecin olduğu yere) ekler.
  const addImages = async (view: import("@tiptap/pm/view").EditorView, files: File[], at?: number) => {
    const upload = uploadRef.current;
    if (!upload) return;
    setUploadError(null);
    let pos = at ?? view.state.selection.from;
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const src = await upload(file);
        const node = view.state.schema.nodes.image.create({ src, alt: file.name });
        const safePos = Math.min(pos, view.state.doc.content.size);
        view.dispatch(view.state.tr.insert(safePos, node));
        pos = safePos + node.nodeSize;
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Görsel yüklenemedi.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ allowBase64: false })],
    content: parseDoc(initial),
    editable,
    immediatelyRender: false,
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !uploadRef.current) return false;
        const images = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (images.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void addImages(view, images, coords?.pos);
        return true;
      },
      handlePaste: (view, event) => {
        if (!uploadRef.current) return false;
        const images = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (images.length === 0) return false;
        event.preventDefault();
        void addImages(view, images);
        return true;
      },
      attributes: {
        class: `rich-content min-h-[260px] px-4 py-3 text-sm outline-none ${editable ? "" : "min-h-0"}`,
      },
    },
    onCreate: ({ editor: e }) => onReady?.(() => e.getText({ blockSeparator: "\n" })),
    onUpdate: ({ editor: e }) => onChange?.(JSON.stringify(e.getJSON()), e.getText({ blockSeparator: "\n" })),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  if (!editor) return <div className="min-h-[260px] rounded-lg border border-(--color-border)" />;

  return (
    <div className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg)">
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-(--color-border) bg-(--color-surface-muted) px-2 py-1.5">
          <Btn label="Kalın" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={15} />
          </Btn>
          <Btn label="İtalik" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={15} />
          </Btn>
          <Btn label="Altı çizili" active={state?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon size={15} />
          </Btn>
          <Btn label="Üstü çizili" active={state?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={15} />
          </Btn>
          <span className="mx-1 h-5 w-px bg-(--color-border)" />
          <Btn label="Başlık 1" active={state?.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 size={15} />
          </Btn>
          <Btn label="Başlık 2" active={state?.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 size={15} />
          </Btn>
          <Btn label="Madde işaretli liste" active={state?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={15} />
          </Btn>
          <Btn label="Numaralı liste" active={state?.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={15} />
          </Btn>
          <Btn label="Alıntı" active={state?.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={15} />
          </Btn>
          {onUploadImage && (
            <Btn label="Görsel ekle" onClick={() => fileInput.current?.click()}>
              {uploading > 0 ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
            </Btn>
          )}
          <span className="mx-1 h-5 w-px bg-(--color-border)" />
          <Btn label="Geri al" disabled={!state?.canUndo} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={15} />
          </Btn>
          <Btn label="Yinele" disabled={!state?.canRedo} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={15} />
          </Btn>
        </div>
      )}
      <EditorContent editor={editor} />
      {editable && onUploadImage && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="sr-only"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (picked.length > 0) void addImages(editor.view, picked);
            }}
          />
          <p className="border-t border-(--color-border) px-3 py-1.5 text-[11px] text-(--color-text-muted)">
            {uploading > 0
              ? `Görsel yükleniyor (${uploading})...`
              : "Görselleri doğrudan metnin üzerine sürükleyip bırakabilir ya da yapıştırabilirsiniz."}
          </p>
          {uploadError && <p className="px-3 pb-2 text-xs text-brand-600">{uploadError}</p>}
        </>
      )}
    </div>
  );
}
