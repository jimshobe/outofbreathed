import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock Firebase storage module
vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(() => Promise.reject(new Error('storage/unauthorized'))),
  getDownloadURL: vi.fn(),
}));

// Mock src/lib/firebase to provide a fake storage export
vi.mock('../../lib/firebase', () => ({
  storage: {},
  auth: {},
  googleProvider: {},
  db: {},
}));

// TipTap uses browser APIs — provide minimal stubs
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => ({
    getHTML: vi.fn(() => ''),
    isActive: vi.fn(() => false),
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({
        toggleBold: vi.fn(() => ({ run: vi.fn() })),
        toggleItalic: vi.fn(() => ({ run: vi.fn() })),
        toggleHeading: vi.fn(() => ({ run: vi.fn() })),
        toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
        toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
        toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
        extendMarkRange: vi.fn(() => ({
          unsetLink: vi.fn(() => ({ run: vi.fn() })),
          setLink: vi.fn(() => ({ run: vi.fn() })),
        })),
        setImage: vi.fn(() => ({ run: vi.fn() })),
        undo: vi.fn(() => ({ run: vi.fn() })),
        redo: vi.fn(() => ({ run: vi.fn() })),
      })),
    })),
    getAttributes: vi.fn(() => ({})),
  })),
  EditorContent: ({ editor }: any) => <div data-testid="editor-content" />,
}));

import PostEditor from '../PostEditor';

describe('PostEditor — image upload error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows inline error message when image upload fails', async () => {
    const user = userEvent.setup();
    render(<PostEditor content="" onChange={vi.fn()} postSlug="test" />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/image upload failed/i)).toBeInTheDocument();
    });
  });
});
