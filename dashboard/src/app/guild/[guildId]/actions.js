'use server';

import { revalidatePath } from 'next/cache';
import { requireGuildAccess, AccessError } from '@/lib/guard.js';
import { api, ApiError } from '@/lib/api.js';

/**
 * Jede Action prueft die Berechtigung selbst. Server-Actions sind oeffentliche
 * Endpunkte - ohne eigene Pruefung koennte sie jeder aufrufen, unabhaengig
 * davon, was die Seite vorher angezeigt hat.
 */
async function guarded(guildId, fn, options = {}) {
  try {
    const { session } = await requireGuildAccess(guildId);
    const result = await fn(session);
    // Standardmaessig nur die aktuelle Seite neu aufbauen. Mit 'layout' wuerde
    // die gesamte Hierarchie verworfen - Layout plus Seite, jeweils mit allen
    // Datenabfragen. Das ist nur noetig, wenn eine Aenderung auch andere
    // Bereiche betrifft, und war zuvor eine Quelle unnoetiger Discord-Anfragen.
    revalidatePath(`/guild/${guildId}`, options.scope ?? 'page');
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof AccessError || err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    console.error('[dashboard] Unerwarteter Fehler in Server-Action', err);
    return { ok: false, error: 'Unerwarteter Fehler. Details stehen im Server-Log.' };
  }
}

export async function saveSettings(guildId, settings) {
  // Einstellungen wirken sich auch auf die Uebersicht und andere Reiter aus
  // (Warnhinweise, Konsistenz-Check) - deshalb hier die ganze Hierarchie.
  return guarded(guildId, () => api.saveSettings(guildId, settings), { scope: 'layout' });
}

export async function createScheduledPost(guildId, formData) {
  return guarded(guildId, () => {
    const mode = formData.get('mode');
    const content = String(formData.get('content') ?? '').trim();
    const channelId = String(formData.get('channelId') ?? '');
    if (!content) throw new ApiError('Der Text darf nicht leer sein.', 400);
    if (!channelId) throw new ApiError('Bitte einen Kanal wählen.', 400);

    if (mode === 'cron') {
      const cron = String(formData.get('cron') ?? '').trim();
      if (!cron) throw new ApiError('Bitte einen Zeitplan angeben.', 400);
      return api.createScheduled(guildId, { channelId, content, cron });
    }

    const local = String(formData.get('runAt') ?? '');
    if (!local) throw new ApiError('Bitte einen Zeitpunkt wählen.', 400);
    const ts = Math.floor(new Date(local).getTime() / 1000);
    if (!Number.isFinite(ts)) throw new ApiError('Der Zeitpunkt ist ungültig.', 400);
    if (ts * 1000 < Date.now()) throw new ApiError('Der Zeitpunkt liegt in der Vergangenheit.', 400);
    return api.createScheduled(guildId, { channelId, content, runAt: ts });
  });
}

export async function deleteScheduledPost(guildId, id) {
  return guarded(guildId, () => api.deleteScheduled(guildId, id));
}

export async function createYoutubeFeed(guildId, formData) {
  return guarded(guildId, () => {
    const raw = String(formData.get('ytChannelId') ?? '').trim();
    const channelId = String(formData.get('channelId') ?? '');
    const template = String(formData.get('template') ?? '').trim() || null;
    if (!channelId) throw new ApiError('Bitte einen Zielkanal wählen.', 400);
    // Aus einer eingefuegten URL die Kanal-ID ziehen, wenn moeglich.
    const fromUrl = raw.match(/channel\/(UC[\w-]{22})/)?.[1];
    const ytChannelId = fromUrl ?? raw;
    if (!/^UC[\w-]{22}$/.test(ytChannelId)) {
      throw new ApiError(
        'Das ist keine YouTube-Kanal-ID. Sie beginnt mit "UC" und ist 24 Zeichen lang – ein @handle funktioniert nicht.',
        400,
      );
    }
    return api.createYoutube(guildId, { ytChannelId, channelId, template });
  });
}

export async function deleteYoutubeFeed(guildId, id) {
  return guarded(guildId, () => api.deleteYoutube(guildId, id));
}

/**
 * Fordert eine Pruefung ausserhalb der Reihe an. Der Bot greift sie binnen
 * weniger Sekunden auf - deshalb meldet die Oberflaeche "angefordert", nicht
 * "erledigt".
 */
export async function checkYoutubeNow(guildId) {
  return guarded(guildId, () => api.checkYoutube(guildId));
}

export async function deleteInfraction(guildId, id) {
  return guarded(guildId, () => api.deleteInfraction(guildId, id));
}

export async function createReactionPanel(guildId, payload) {
  return guarded(guildId, () => api.createReactionRoles(guildId, payload));
}

export async function deleteReactionPanel(guildId, id) {
  return guarded(guildId, () => api.deleteReactionRoles(guildId, id));
}

export async function createPoll(guildId, payload) {
  return guarded(guildId, (session) =>
    api.createPoll(guildId, { ...payload, createdBy: session.user.id }),
  );
}

export async function closePoll(guildId, id) {
  return guarded(guildId, () => api.closePoll(guildId, id));
}

/**
 * Legt die Ticket-Eroeffnungsnachricht an und hinterlegt ihre ID gleich in den
 * Einstellungen - sonst muesste man sie von Hand kopieren, und das Plugin
 * wuerde bis dahin auf keine Reaktion hoeren.
 */
export async function createTicketPanel(guildId, payload) {
  return guarded(guildId, async () => {
    const { messageId } = await api.createTicketPanel(guildId, payload);
    const settings = await api.getSettings(guildId);
    await api.saveSettings(guildId, {
      ...settings,
      tickets: { ...settings.tickets, panelMessageId: messageId },
    });
    return { messageId };
  }, { scope: 'layout' });
}

// --- Eigene Befehle, Log, Sicherungen ---------------------------------------

export async function createCommand(guildId, payload) {
  return guarded(guildId, () => api.createCommand(guildId, payload));
}

export async function updateCommand(guildId, id, payload) {
  return guarded(guildId, () => api.updateCommand(guildId, id, payload));
}

export async function deleteCommand(guildId, id) {
  return guarded(guildId, () => api.deleteCommand(guildId, id));
}

export async function clearMessageLog(guildId, userId = null) {
  return guarded(guildId, () =>
    api.clearMessageLog(guildId, userId ? `?userId=${encodeURIComponent(userId)}` : ''),
  );
}

/**
 * Sicherungen betreffen den ganzen Dienst, nicht einen Server - und enthalten
 * die Daten aller Server. Die eigene Discord-ID kommt aus der geprueften
 * Sitzung; die API laesst nur durch, wer in OWNER_IDS steht.
 */
export async function triggerBackup(guildId) {
  return guarded(guildId, (session) => api.createBackup(session.user.id));
}

// --- Setup-Wizard und Rechte ------------------------------------------------

export async function createInterest(guildId, payload) {
  return guarded(guildId, () => api.createInterest(guildId, payload));
}

export async function updateInterest(guildId, id, payload) {
  return guarded(guildId, () => api.updateInterest(guildId, id, payload));
}

export async function deleteInterest(guildId, id) {
  return guarded(guildId, () => api.deleteInterest(guildId, id));
}

export async function publishInterests(guildId, payload) {
  // Legt nebenbei ein Reaction-Role-Panel an, das unter "Funktionen" erscheint.
  return guarded(
    guildId,
    (session) => api.publishInterests(guildId, { ...payload, actorId: session.user.id }),
    { scope: 'layout' },
  );
}

export async function planPermissions(guildId, payload) {
  return guarded(guildId, () => api.planPermissions(guildId, payload));
}

export async function applyPermissions(guildId, payload) {
  return guarded(guildId, (session) =>
    api.applyPermissions(guildId, { ...payload, actorId: session.user.id }),
  );
}

export async function undoPermissions(guildId, changeId) {
  return guarded(guildId, (session) =>
    api.undoPermissions(guildId, changeId, { actorId: session.user.id }),
  );
}

/**
 * Moderation von Hand. Der Ausloeser wird mit seiner echten Discord-User-ID
 * protokolliert - nicht mit einem Sammelbegriff wie "dashboard", sonst waere
 * im Nachhinein nicht mehr nachvollziehbar, wer die Massnahme veranlasst hat.
 */
export async function moderateMember(guildId, payload) {
  return guarded(guildId, (session) => {
    if (!payload?.userId || !payload?.action) {
      throw new ApiError('Mitglied und Maßnahme sind Pflicht.', 400);
    }
    return api.moderate(guildId, { ...payload, actorId: session.user.id });
  });
}
