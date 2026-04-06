import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

interface Props {
  content: string;
  onChange: (html: string) => void;
  postSlug: string;
}

export default function PostEditor({ content, onChange, postSlug }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploadError(null);
    try {
      const storageRef = ref(storage, `posts/${postSlug || 'draft'}/${Date.now()}-${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error('Image upload failed', err);
      setUploadError('Image upload failed. Check Storage rules and try again.');
    }
    e.target.value = '';
  }

  function setLink() {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  return (
    <div className="editor-wrap">
      <div className="editor-toolbar">
        <button type="button" className={`tb-btn${editor.isActive('bold') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">B</button>
        <button type="button" className={`tb-btn italic${editor.isActive('italic') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">I</button>
        <button type="button" className={`tb-btn${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</button>
        <button type="button" className={`tb-btn${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">H3</button>
        <span className="tb-sep" />
        <button type="button" className={`tb-btn${editor.isActive('bulletList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">•</button>
        <button type="button" className={`tb-btn${editor.isActive('orderedList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">1.</button>
        <button type="button" className={`tb-btn${editor.isActive('blockquote') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">"</button>
        <span className="tb-sep" />
        <button type="button" className={`tb-btn${editor.isActive('link') ? ' active' : ''}`} onClick={setLink} title="Link">↗</button>
        <button type="button" className="tb-btn" onClick={() => fileInputRef.current?.click()} title="Insert image">IMG</button>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleImageUpload} />
        <span className="tb-sep" />
        <button type="button" className="tb-btn" onClick={() => editor.chain().focus().undo().run()} title="Undo">↩</button>
        <button type="button" className="tb-btn" onClick={() => editor.chain().focus().redo().run()} title="Redo">↪</button>
      </div>
      {uploadError && (
        <p style={{ padding: '0.4rem 1rem', fontSize: '0.78rem', color: '#e05c6a', borderTop: '1px solid var(--color-divider)' }}>
          {uploadError}
        </p>
      )}
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}
