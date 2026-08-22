/**
 * Discord-Permission-Bits.
 *
 * Wir pruefen gegen die echten Rechte, die Discord dem Nutzer auf dem Server
 * gibt - kein eigenes Rechtesystem daneben. Wer auf dem Server nichts darf,
 * darf hier auch nichts, ohne dass wir das separat pflegen muessen.
 */
export const PERMISSION = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_GUILD: 1n << 5n,
};

/**
 * Darf dieser Nutzer den Server im Dashboard verwalten?
 * `permissions` kommt als String aus der Discord-API (die Zahl ist zu gross
 * fuer einen JS-Number, deshalb BigInt).
 */
export function canManageGuild(guild) {
  if (guild?.owner) return true;
  if (typeof guild?.permissions !== 'string') return false;
  let bits;
  try {
    bits = BigInt(guild.permissions);
  } catch {
    // Unerwartetes Format - im Zweifel nicht erlauben.
    return false;
  }
  return (
    (bits & PERMISSION.ADMINISTRATOR) === PERMISSION.ADMINISTRATOR ||
    (bits & PERMISSION.MANAGE_GUILD) === PERMISSION.MANAGE_GUILD
  );
}

/** Filtert die Guild-Liste auf die verwaltbaren Server. */
export function manageableGuilds(guilds) {
  if (!Array.isArray(guilds)) return [];
  return guilds.filter(canManageGuild);
}
