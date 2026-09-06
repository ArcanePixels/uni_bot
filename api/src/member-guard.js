/**
 * Wer darf gegen wen vorgehen?
 *
 * Ohne diese Pruefung bietet das Dashboard Knoepfe an, die im besten Fall an
 * Discord scheitern und im schlechtesten den falschen Treffen. Zwei Faelle
 * waren offen:
 *
 * - Man konnte **sich selbst** bannen.
 * - Man konnte es beim **Server-Gruender** versuchen (Discord lehnt das ab,
 *   aber die Oberflaeche liess es zu und meldete einen Fehler statt es gar
 *   nicht erst anzubieten).
 *
 * Discords Regeln, die wir hier nachbilden:
 * - Der Gruender steht ueber allem, auch ueber Administratoren.
 * - Ein Bot kann nur gegen Mitglieder vorgehen, deren hoechste Rolle
 *   **unter** seiner eigenen steht. Gleichstand reicht nicht.
 * - Bei gleicher Position entscheidet die niedrigere Rollen-ID.
 */

/** Die Aktionen, die eine Rangfolge brauchen. Verwarnen tut niemandem weh. */
export const EINGRIFFE = ['timeout', 'kick', 'ban'];

/**
 * Die hoechste Rolle eines Mitglieds.
 *
 * Discord sortiert nach `position`; bei Gleichstand gewinnt die kleinere ID
 * (die aeltere Rolle).
 */
export function hoechsteRolle(roleIds, rollen) {
  let beste = null;
  for (const id of roleIds ?? []) {
    const r = rollen.get(String(id));
    if (!r) continue;
    if (
      !beste ||
      r.position > beste.position ||
      (r.position === beste.position && BigInt(r.id) < BigInt(beste.id))
    ) {
      beste = r;
    }
  }
  // Ohne Rolle zaehlt @everyone auf Position 0.
  return beste ?? { id: '0', name: '@everyone', position: 0, color: 0 };
}

/**
 * Prueft ein Mitglied und gibt zurueck, was mit ihm moeglich ist.
 *
 * `rollen` ist eine Map id -> { id, name, position, color }.
 */
export function pruefeMitglied({
  member,
  rollen,
  ownerId,
  botRoleIds = [],
  actorId = null,
}) {
  const istGruender = String(member.id) === String(ownerId);
  const istSelbst = actorId != null && String(member.id) === String(actorId);

  const eigene = hoechsteRolle(member.roles, rollen);
  const botOben = hoechsteRolle(botRoleIds, rollen);

  // Der Bot muss echt hoeher stehen. Gleiche Position heisst: Discord laesst
  // nichts zu - unabhaengig davon, welche Rolle aelter ist. Der ID-Vergleich
  // gilt nur beim Ermitteln der eigenen hoechsten Rolle, nicht hier.
  const botIstHoeher = botOben.position > eigene.position;

  let grund = null;
  if (istGruender) grund = 'Server-Gründer – Discord lässt hier nichts zu.';
  else if (istSelbst) grund = 'Das bist du selbst.';
  else if (member.bot) grund = 'Ein Bot – Maßnahmen ergeben hier selten Sinn.';
  else if (!botIstHoeher) {
    grund =
      `Die Rolle „${eigene.name}" steht nicht unter der des Bots. ` +
      `Zieh die Bot-Rolle in Discord höher.`;
  }

  return {
    istGruender,
    istSelbst,
    hoechsteRolle: eigene,
    // Verwarnen bleibt immer moeglich - es greift niemanden an, sondern
    // notiert nur etwas. Nur beim Gruender waere selbst das unpassend.
    kannVerwarnen: !istGruender && !istSelbst,
    kannEingreifen: grund === null,
    grund,
  };
}

/**
 * Reichert eine Mitgliederliste mit Rollen und Schutzangaben an.
 *
 * Das Dashboard bekommt damit alles, was es zum Anzeigen und Ausgrauen
 * braucht - ohne die Regeln selbst zu kennen.
 */
export function reichereMitgliederAn({ members, roles, ownerId, botRoleIds = [], actorId = null }) {
  const rollen = new Map(roles.map((r) => [String(r.id), r]));

  return members.map((m) => {
    const pruefung = pruefeMitglied({ member: m, rollen, ownerId, botRoleIds, actorId });
    return {
      ...m,
      // Volle Rollenangaben statt roher IDs - das Dashboard soll keine IDs zeigen.
      roleNames: (m.roles ?? [])
        .map((id) => rollen.get(String(id)))
        .filter(Boolean)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color })),
      istGruender: pruefung.istGruender,
      istSelbst: pruefung.istSelbst,
      topRolle: pruefung.hoechsteRolle.name,
      kannVerwarnen: pruefung.kannVerwarnen,
      kannEingreifen: pruefung.kannEingreifen,
      schutzGrund: pruefung.grund,
    };
  });
}

/**
 * Letzte Instanz vor dem Ausfuehren.
 *
 * Die Oberflaeche graut Knoepfe aus, aber Server-Actions sind oeffentliche
 * Endpunkte - ohne eigene Pruefung liesse sich das Ausgrauen umgehen.
 * Gibt eine Fehlermeldung zurueck oder null.
 */
export function darfAktion({ action, member, rollen, ownerId, botRoleIds, actorId }) {
  const p = pruefeMitglied({ member, rollen, ownerId, botRoleIds, actorId });

  if (!EINGRIFFE.includes(action)) {
    // Verwarnen und Notizen: nur Gruender und man selbst sind tabu.
    return p.kannVerwarnen ? null : p.grund;
  }
  return p.kannEingreifen ? null : p.grund;
}
