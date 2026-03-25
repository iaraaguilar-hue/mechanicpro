import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, Pilcrow } from 'lucide-react';
import { useEffect } from 'react';

// ---- Toolbar ----
function Toolbar({ editor }: { editor: Editor | null }) {
    if (!editor) return null;

    const btnBase = 'p-1.5 rounded hover:bg-slate-100 transition-colors disabled:opacity-30';
    const btnActive = 'bg-slate-200 text-slate-900';

    return (
        <div className="flex items-center gap-1 border-b px-2 py-1 bg-slate-50 rounded-t-md">
            <button
                type="button"
                title="Negrita (Ctrl+B)"
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={!editor.can().chain().focus().toggleBold().run()}
                className={`${btnBase} ${editor.isActive('bold') ? btnActive : 'text-slate-600'}`}
            >
                <Bold size={14} />
            </button>
            <button
                type="button"
                title="Cursiva (Ctrl+I)"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={!editor.can().chain().focus().toggleItalic().run()}
                className={`${btnBase} ${editor.isActive('italic') ? btnActive : 'text-slate-600'}`}
            >
                <Italic size={14} />
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button
                type="button"
                title="Lista con viñetas"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={`${btnBase} ${editor.isActive('bulletList') ? btnActive : 'text-slate-600'}`}
            >
                <List size={14} />
            </button>
            <button
                type="button"
                title="Salto de párrafo"
                onClick={() => editor.chain().focus().setHardBreak().run()}
                className={`${btnBase} text-slate-600`}
            >
                <Pilcrow size={14} />
            </button>
        </div>
    );
}

// ---- Main Component ----
interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: string;
}

export function RichTextEditor({
    value,
    onChange,
    placeholder = 'Escribe la descripción del servicio...',
    minHeight = '120px',
}: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [StarterKit],
        content: value || '',
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none px-3 py-2 text-sm text-slate-800',
                style: `min-height: ${minHeight};`,
                'data-placeholder': placeholder,
            },
        },
        onUpdate({ editor }) {
            // Emit plain empty string if only empty paragraph
            const html = editor.getHTML();
            onChange(html === '<p></p>' ? '' : html);
        },
    });

    // Sync external value changes (e.g. when editing a different row)
    useEffect(() => {
        if (!editor) return;
        const currentHtml = editor.getHTML();
        const incoming = value || '';
        if (currentHtml !== incoming) {
            editor.commands.setContent(incoming);
        }
    }, [value, editor]);

    return (
        <div className="border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-white">
            <Toolbar editor={editor} />
            <EditorContent editor={editor} />
            <style>{`
                .tiptap p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    color: #94a3b8;
                    float: left;
                    height: 0;
                    pointer-events: none;
                }
                .tiptap ul { list-style-type: disc; padding-left: 1.2rem; }
                .tiptap strong { font-weight: 700; }
                .tiptap em { font-style: italic; }
            `}</style>
        </div>
    );
}
