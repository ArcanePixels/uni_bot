import { timingSafeEqual } from 'node:crypto';

/**
 * Statisches Bearer-Token. Bewusst als Zwischenschritt - Stufe 2 ersetzt das
 * durch Discord-OAuth, damit Rechte gegen die echten Discord-Permission-Bits
 * geprueft werden statt gegen ein eigenes Rechtesystem.
 */
export function bearerAuth(expected) {
  if (!expected) throw new Error('API_TOKEN fehlt - die API startet nicht ohne Token.');
  const want = Buffer.from(expected);

  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const got = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    // Laengenvergleich vorweg, weil timingSafeEqual sonst wirft.
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      return res.status(401).json({ error: 'Nicht autorisiert' });
    }
    next();
  };
}
