/**
 * The shopping list that travels to a phone inside the link (13 Nov 2026).
 * It must survive the trip exactly, stay small enough for one scannable QR
 * code, and read properly as plain text in a WhatsApp chat.
 */
import { describe, it, expect } from 'vitest';
import { encodeSharedList, decodeSharedList, sharedListUrl, sharedListText, whatsAppLink, type SharedList } from '../src/health/share-list.js';

const week: SharedList = {
  v: 1, title: 'Mon 17 – Sun 23 Nov', made: '2026-11-13',
  groups: [
    { aisle: 'Fruit & veg', items: [{ n: 'fresh coriander (cilantro)', q: '30 g' }, { n: 'onion', q: '4' }, { n: 'lime', q: '3' }] },
    { aisle: 'Meat & fish', items: [{ n: 'chicken breast', q: '600 g' }, { n: 'beef brisket', q: '500 g' }] },
    { aisle: 'Cupboard', items: [{ n: 'jasmine rice', q: '400 g' }, { n: 'café crème', q: '' }] },
  ],
};

describe('a list sent to a phone', () => {
  it('arrives exactly as it left, accents and all', async () => {
    expect(await decodeSharedList(await encodeSharedList(week))).toEqual(week);
  });

  it('is read from the link after the #, which never reaches a server', async () => {
    const url = await sharedListUrl(week);
    expect(url.startsWith('https://avasupernova.com/list#1.')).toBe(true);
    expect(await decodeSharedList(url.slice(url.indexOf('#')))).toEqual(week);
  });

  it('a big week still fits one QR code', async () => {
    const big: SharedList = { ...week, groups: Array.from({ length: 8 }, (_, g) => ({
      aisle: `Aisle ${g}`, items: Array.from({ length: 8 }, (_, i) => ({ n: `ingredient number ${g * 8 + i} with a long name`, q: `${100 + i * 25} g` })),
    })) };
    const url = await sharedListUrl(big);
    // QR byte mode at the lowest error correction holds 2,953 bytes.
    expect(url.length).toBeLessThan(2000);
  });

  it('a damaged or foreign link is refused, not half-drawn', async () => {
    expect(await decodeSharedList('#1.not-a-list')).toBeNull();
    expect(await decodeSharedList('#2.whatever')).toBeNull();
    expect(await decodeSharedList('')).toBeNull();
  });

  it('reads properly as plain text in a chat', () => {
    const text = sharedListText(week, 'https://avasupernova.com/list#1.x');
    expect(text).toContain('Mon 17 – Sun 23 Nov');
    expect(text).toContain('FRUIT & VEG');
    expect(text).toContain('- chicken breast — 600 g');
    expect(text).toContain('- café crème');
    expect(whatsAppLink(text).startsWith('https://wa.me/?text=')).toBe(true);
  });
});
