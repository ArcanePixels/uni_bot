/**
 * Konsistenz-Check für Kanal- und Rollenverknüpfungen.
 *
 * Aus dem ursprünglichen Konzept: Kein stilles Falsch-Funktionieren, sondern
 * ein klarer Hinweis "hier stimmt was nicht". Wird ein verknüpfter Kanal
 * gelöscht oder eine Rolle entfernt, zeigt der Bot sonst keinerlei Reaktion –
 * und man sucht den Fehler an der falschen Stelle.
 */

/** Prüft eine einzelne Kanal-Verknüpfung. */
function checkChannel(id, channels, where) {
  if (!id) return null;
  const hit = channels.find((c) => c.id === id);
  if (hit) return null;
  return {
    severity: 'error',
    where,
    message: `Der verknüpfte Kanal existiert nicht mehr (ID ${id}).`,
    hint: 'Wähle einen anderen Kanal aus oder entferne die Verknüpfung.',
  };
}

/** Prüft eine Liste von Rollen-Verknüpfungen. */
function checkRoles(ids, roles, where) {
  const missing = (ids ?? []).filter((id) => !roles.some((r) => r.id === id));
  if (!missing.length) return null;
  return {
    severity: 'error',
    where,
    message:
      missing.length === 1
        ? `Eine verknüpfte Rolle existiert nicht mehr (ID ${missing[0]}).`
        : `${missing.length} verknüpfte Rollen existieren nicht mehr.`,
    hint: 'Entferne die veralteten Einträge und wähle die aktuellen Rollen aus.',
  };
}

/**
 * Sucht Verknüpfungen, die ins Leere zeigen.
 * Reine Funktion – gibt eine Liste von Befunden zurück.
 */
export function checkConsistency({ settings, channels, roles, scheduled = [], feeds = [] }) {
  const found = [];
  const push = (x) => x && found.push(x);

  const am = settings.automod ?? {};
  const wc = settings.welcome ?? {};

  push(checkChannel(am.logChannelId, channels, 'Automod → Mod-Log-Kanal'));
  push(checkRoles(am.exemptRoles, roles, 'Automod → Ausgenommene Rollen'));
  push(checkChannel(wc.channelId, channels, 'Willkommen → Kanal'));
  push(checkRoles(wc.autoroleIds, roles, 'Willkommen → Rollen beim Beitritt'));

  for (const p of scheduled) {
    if (!p.enabled) continue;
    const hit = channels.find((c) => c.id === p.channel_id);
    if (!hit) {
      found.push({
        severity: 'error',
        where: `Geplanter Post #${p.id}`,
        message: `Der Zielkanal existiert nicht mehr (ID ${p.channel_id}).`,
        hint: 'Der Bot deaktiviert den Post beim nächsten Versuch automatisch.',
      });
    }
  }

  for (const f of feeds) {
    if (!f.enabled) continue;
    const hit = channels.find((c) => c.id === f.channel_id);
    if (!hit) {
      found.push({
        severity: 'error',
        where: `YouTube-Feed ${f.yt_channel_id}`,
        message: `Der Zielkanal existiert nicht mehr (ID ${f.channel_id}).`,
        hint: 'Neue Uploads können nicht gepostet werden, bis ein Kanal gewählt ist.',
      });
    }
  }

  // Willkommen ist an, aber der Bot kann in den Kanal nicht schreiben?
  // Das lässt sich hier nicht prüfen (dafür bräuchte es die Rechte je Kanal),
  // wird aber vom Bot geloggt, wenn es auftritt.

  return found;
}

/**
 * Sucht Verknüpfungen, die zwar funktionieren, aber vermutlich falsch gemeint
 * sind – etwa ein Willkommens-Kanal, der nach Mod-Log klingt. Solche
 * Vertauschungen fallen sonst erst auf, wenn die Nachricht am falschen Ort steht.
 */
export function checkPlausibility({ settings, channels }) {
  const out = [];
  const nameOf = (id) => channels.find((c) => c.id === id)?.name?.toLowerCase() ?? null;

  const wcName = nameOf(settings.welcome?.channelId);
  const logName = nameOf(settings.automod?.logChannelId);

  // Wörter, die typischerweise auf einen Mod-/Log-Kanal hindeuten.
  const LOG_WORDS = ['log', 'mod', 'intern', 'staff', 'team'];
  const WELCOME_WORDS = ['willkommen', 'welcome', 'general', 'allgemein', 'chat', 'lobby'];

  if (wcName && LOG_WORDS.some((w) => wcName.includes(w))) {
    out.push({
      severity: 'warning',
      where: 'Willkommen → Kanal',
      message: `Die Begrüßung geht nach #${wcName} – der Name klingt nach einem internen Kanal.`,
      hint: 'Neue Mitglieder sehen die Nachricht dort womöglich gar nicht. Vertauscht?',
    });
  }

  if (logName && WELCOME_WORDS.some((w) => logName.includes(w))) {
    out.push({
      severity: 'warning',
      where: 'Automod → Mod-Log-Kanal',
      message: `Automod-Meldungen gehen nach #${logName} – der Name klingt nach einem öffentlichen Kanal.`,
      hint: 'Verstöße wären damit für alle sichtbar. Vertauscht?',
    });
  }

  if (wcName && logName && wcName === logName) {
    out.push({
      severity: 'warning',
      where: 'Willkommen & Automod',
      message: `Begrüßungen und Automod-Meldungen laufen beide in #${wcName}.`,
      hint: 'Meist will man Verstöße nicht im selben Kanal wie die Begrüßung.',
    });
  }

  return out;
}
