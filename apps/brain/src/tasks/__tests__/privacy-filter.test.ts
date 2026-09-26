import { describe, it, expect } from 'vitest';
import { senderHidden } from '../email';
describe('never-show-agents filter', () => {
  it('exact address', () => { expect(senderHidden('Jane <jane@bank.co.nz>', ['jane@bank.co.nz'])).toBe(true); expect(senderHidden('bob@bank.co.nz', ['jane@bank.co.nz'])).toBe(false); });
  it('domain suffix', () => { expect(senderHidden('alerts@mybank.co.nz', ['@mybank.co.nz'])).toBe(true); expect(senderHidden('x@notmybank.co.nz', ['@mybank.co.nz'])).toBe(false); });
  it('case-insensitive, empty rules never hide', () => { expect(senderHidden('A@B.COM', ['a@b.com'])).toBe(true); expect(senderHidden('a@b.com', [])).toBe(false); });
});
