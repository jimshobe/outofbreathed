import { describe, it, expect } from 'vitest';
import { newCommentStatus, cleanBody, parseTarget, MAX_COMMENT } from '../comment-rules';

describe('comment rules', () => {
  it('holds a new commenter for approval, publishes trusted ones and the owner, refuses blocked', () => {
    expect(newCommentStatus({ trusted: 0, blocked: 0 }, false)).toBe('pending');
    expect(newCommentStatus({ trusted: 1, blocked: 0 }, false)).toBe('approved');
    expect(newCommentStatus({ trusted: 0, blocked: 0 }, true)).toBe('approved');
    expect(() => newCommentStatus({ trusted: 1, blocked: 1 }, false)).toThrow(/turned off/);
  });

  it('cleans bodies and rejects empty or long ones', () => {
    expect(cleanBody('  hello\r\n\r\n\r\n\r\nthere  ')).toBe('hello\n\nthere');
    expect(() => cleanBody('   ')).toThrow(/write something/);
    expect(() => cleanBody(42)).toThrow(/write something/);
    expect(() => cleanBody('x'.repeat(MAX_COMMENT + 1))).toThrow(/limited/);
  });

  it('parses targets and rejects anything else', () => {
    expect(parseTarget('m:mv3abc')).toEqual({ moment_id: 'mv3abc', set_id: null });
    expect(parseTarget('s:smv49')).toEqual({ moment_id: null, set_id: 'smv49' });
    for (const bad of ['x:1', 'm:', "m:1' OR 1=1", null]) expect(() => parseTarget(bad)).toThrow();
  });
});
