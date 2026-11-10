import { describe, it, expect } from 'vitest';
import { renderMarkdown, photoIds, excerpt, type PhotoRef } from '../markdown';

const lib: Record<string, PhotoRef> = {
  a1: { id: 'a1', src: '/media/a1.jpg', thumb: '/media/t/a1.jpg', youtube: false },
  b2: { id: 'b2', src: '/media/b2.jpg', thumb: '/media/t/b2.jpg', youtube: false },
  yt: { id: 'yt', src: 'https://i.ytimg.com/vi/x/hqdefault.jpg', thumb: 'https://i.ytimg.com/vi/x/mqdefault.jpg', youtube: true },
};
const md = (s: string) => renderMarkdown(s, (id) => lib[id] ?? null);

describe('renderMarkdown', () => {
  it('makes paragraphs, line breaks, headings, quotes and lists', () => {
    expect(md('one\ntwo\n\nthree')).toBe('<p>one<br>two</p>\n<p>three</p>');
    expect(md('## The ride')).toBe('<h3>The ride</h3>');
    expect(md('> said it\n> twice')).toBe('<blockquote>said it<br>twice</blockquote>');
    expect(md('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(md('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
  });
  it('formats bold, italic and links', () => {
    expect(md('**big** and *small* and _also_')).toBe('<p><strong>big</strong> and <em>small</em> and <em>also</em></p>');
    expect(md('see [the map](/map) or [osm](https://osm.org/a_b_c)')).toBe(
      '<p>see <a href="/map">the map</a> or <a href="https://osm.org/a_b_c" target="_blank" rel="noopener">osm</a></p>');
    expect(md('2 * 3 * 4 and snake_case_name')).toBe('<p>2 * 3 * 4 and snake_case_name</p>');
  });
  it('escapes HTML and refuses unsafe links', () => {
    expect(md('<script>alert(1)</script> "hi"')).toBe('<p>&#60;script&#62;alert(1)&#60;/script&#62; &#34;hi&#34;</p>');
    expect(md('[x](javascript:alert(1))')).not.toContain('<a');
    expect(md('[x](//evil.com)')).not.toContain('<a');
    expect(md('[x](https://a.com/"onmouseover="y)')).not.toContain('"onmouseover');
  });
  it('places photos: one with its caption, several in a row, missing ones left out', () => {
    const one = md('![at the top](photo:a1)');
    expect(one).toContain('<figure class="photo">');
    expect(one).toContain('src="/media/a1.jpg"');
    expect(one).toContain('data-lb-open="musing" data-lb-id="a1"');
    expect(one).toContain('<figcaption>at the top</figcaption>');
    const row = md('![](photo:a1)\n![](photo:b2)\n![](photo:gone)');
    expect(row).toContain('<figure class="photos n2">');
    expect(row).toContain('src="/media/t/b2.jpg"');
    expect(row).not.toContain('gone');
    expect(md('![](photo:gone)')).toBe('');
    expect(md('![](photo:yt)')).toContain('<span class="play">▶</span>');
  });
  it('splits text and photos written in one block', () => {
    expect(md('before\n![](photo:a1)\nafter')).toMatch(/^<p>before<\/p>\n<figure class="photo">.*<\/figure>\n<p>after<\/p>$/s);
  });
});

describe('photoIds and excerpt', () => {
  it('lists placed photos in order', () => {
    expect(photoIds('hi\n![](photo:b2)\n\n![x](photo:a1)\nnot ![](photo:inline)')).toEqual(['b2', 'a1']);
  });
  it('gives the opening words as plain text', () => {
    expect(excerpt('# Title\n\n![](photo:a1)\nWe rode **north** to [Ebor](/map).\n\n- then home')).toBe('We rode north to Ebor. then home');
    const long = excerpt('word '.repeat(100), 40);
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long.endsWith('word…')).toBe(true);
  });
});
