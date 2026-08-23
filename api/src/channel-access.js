/**
 * Prueft, ob der Bot in einem Kanal das darf, was ein Plugin braucht.
 *
 * Warum hier und nicht im Bot: Das Dashboard fragt die API, nicht den Bot -
 * beide laufen in eigenen Containern. Damit die Oberflaeche anzeigen kann, ob
 * die Rechte stimmen, muss die API es selbst ausrechnen.
 *
 * Discords Rechte-Berechnung in Kurzform, in genau dieser Reihenfolge:
 *   1. Die Rechte der @everyone-Rolle
 *   2. Plus die Rechte aller Rollen, die das Mitglied hat
 *   3. Administrator schlaegt alles - dann ist Schluss
 *   4. Ueberschreibung fuer @everyone im Kanal (erst deny, dann allow)
 *   5. Ueberschreibungen der Rollen (alle deny gesammelt, dann alle allow)
 *   6. Ueberschreibung fuer das Mitglied selbst
 */

/** Die Rechte-Bits, die wir benennen koennen. */
export const PERMISSION_BITS = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  ADD_REACTIONS: 1n << 6n,
  MANAGE_MESSAGES: 1n << 13n,
  ADMINISTRATOR: 1n << 3n,
};

/** Klartext fuer die Oberflaeche - so heissen sie in Discord auf Deutsch. */
export const PERMISSION_LABELS = {
  VIEW_CHANNEL: 'Kanal ansehen',
  SEND_MESSAGES: 'Nachrichten senden',
  EMBED_LINKS: 'Links einbetten',
  ATTACH_FILES: 'Dateien anhängen',
  READ_MESSAGE_HISTORY: 'Nachrichtenverlauf anzeigen',
  ADD_REACTIONS: 'Reaktionen hinzufügen',
  MANAGE_MESSAGES: 'Nachrichten verwalten',
};

const bit = (name) => PERMISSION_BITS[name] ?? 0n;

/**
 * Rechnet die Rechte eines Mitglieds in einem Kanal aus.
 *
 * `roles` sind alle Rollen des Servers, `memberRoleIds` die des Mitglieds,
 * `everyoneId` ist die ID der @everyone-Rolle (gleich der Server-ID).
 */
export function effectivePermissions({
  channel,
  roles,
  memberRoleIds,
  memberId,
  everyoneId,
}) {
  const rolleVon = new Map(roles.map((r) => [r.id, r]));

  // 1. + 2. Rollenrechte aufsummieren.
  let erlaubt = BigInt(rolleVon.get(everyoneId)?.permissions ?? '0');
  for (const id of memberRoleIds) {
    erlaubt |= BigInt(rolleVon.get(id)?.permissions ?? '0');
  }

  // 3. Administrator hebelt jede Kanal-Einstellung aus.
  if (erlaubt & PERMISSION_BITS.ADMINISTRATOR) return { bits: -1n, admin: true };

  const overwrites = channel?.permission_overwrites ?? [];
  const finde = (id) => overwrites.find((o) => o.id === id);

  // 4. @everyone im Kanal.
  const jeder = finde(everyoneId);
  if (jeder) {
    erlaubt &= ~BigInt(jeder.deny ?? '0');
    erlaubt |= BigInt(jeder.allow ?? '0');
  }

  // 5. Rollen: erst alle Verbote sammeln, dann alle Erlaubnisse. Sonst haenge
  //    das Ergebnis von der Reihenfolge ab, in der die Rollen kommen.
  let denySumme = 0n;
  let allowSumme = 0n;
  for (const id of memberRoleIds) {
    const o = finde(id);
    if (!o) continue;
    denySumme |= BigInt(o.deny ?? '0');
    allowSumme |= BigInt(o.allow ?? '0');
  }
  erlaubt &= ~denySumme;
  erlaubt |= allowSumme;

  // 6. Die Ueberschreibung fuer dieses eine Mitglied schlaegt die Rollen.
  const eigen = memberId ? finde(memberId) : null;
  if (eigen) {
    erlaubt &= ~BigInt(eigen.deny ?? '0');
    erlaubt |= BigInt(eigen.allow ?? '0');
  }

  return { bits: erlaubt, admin: false };
}

/**
 * Welche der gebrauchten Rechte fehlen?
 *
 * Gibt `{ ok, fehlend, admin }` zurueck - `fehlend` mit Schluessel und
 * Klartext, damit die Oberflaeche es direkt anzeigen kann.
 */
export function checkChannelAccess({
  channel,
  roles,
  memberRoleIds,
  memberId,
  everyoneId,
  benoetigt,
}) {
  const { bits, admin } = effectivePermissions({
    channel,
    roles,
    memberRoleIds,
    memberId,
    everyoneId,
  });

  if (admin) return { ok: true, admin: true, fehlend: [] };

  const fehlend = benoetigt
    .filter((name) => (bits & bit(name)) === 0n)
    .map((name) => ({ key: name, label: PERMISSION_LABELS[name] ?? name }));

  return { ok: fehlend.length === 0, admin: false, fehlend };
}
