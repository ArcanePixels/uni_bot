/**
 * Kanalrechte setzen.
 *
 * Discord kennt je Kanal eine Liste von "Overwrites" - Ausnahmen von den
 * Server-Rechten, je Rolle oder Mitglied. Jeder Eintrag hat ein Allow- und ein
 * Deny-Bitfeld.
 *
 * Wichtig: Ein PUT auf einen Overwrite ersetzt diesen Eintrag vollstaendig.
 * Wir lesen deshalb den bestehenden Stand, fuehren ihn mit der Aenderung
 * zusammen und schreiben das Ergebnis zurueck - sonst wuerden nebenbei
 * gesetzte Rechte stillschweigend verschwinden.
 */

const API = 'https://discord.com/api/v10';

export const PERMISSION_BITS = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  ADD_REACTIONS: 1n << 6n,
  ATTACH_FILES: 1n << 15n,
};

/** Rechtepakete, aus denen sich im Dashboard auswählen lässt. */
export const PRESETS = {
  read: {
    label: 'Lesen',
    description: 'Kanal sehen und mitlesen, aber nicht schreiben.',
    allow: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    deny: ['SEND_MESSAGES'],
  },
  write: {
    label: 'Lesen und schreiben',
    description: 'Der übliche Zugang: sehen, mitlesen, schreiben, reagieren.',
    allow: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES', 'ADD_REACTIONS', 'ATTACH_FILES'],
    deny: [],
  },
  voice: {
    label: 'Sprachkanal betreten',
    description: 'Kanal sehen, beitreten und sprechen.',
    allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK'],
    deny: [],
  },
  hide: {
    label: 'Verbergen',
    description: 'Kanal ist für diese Rolle unsichtbar.',
    allow: [],
    deny: ['VIEW_CHANNEL'],
  },
  reset: {
    label: 'Zurücksetzen',
    description: 'Ausnahme entfernen – es gelten wieder die Server-Rechte.',
    allow: [],
    deny: [],
    remove: true,
  },
};

export function bitsFrom(names) {
  return names.reduce((acc, n) => acc | (PERMISSION_BITS[n] ?? 0n), 0n);
}

/**
 * Führt einen bestehenden Overwrite mit einer Änderung zusammen.
 * Bits, die neu erlaubt werden, verschwinden aus deny - und umgekehrt.
 */
export function mergeOverwrite(existing, allowBits, denyBits) {
  const curAllow = BigInt(existing?.allow ?? '0');
  const curDeny = BigInt(existing?.deny ?? '0');
  return {
    allow: ((curAllow & ~denyBits) | allowBits).toString(),
    deny: ((curDeny & ~allowBits) | denyBits).toString(),
  };
}

async function discord(path, botToken, options = {}) {
  const res = await fetch(API + path, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bot ${botToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.reason ? { 'X-Audit-Log-Reason': encodeURIComponent(options.reason) } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.message) msg = b.message;
    } catch {
      // Antwort ohne JSON - Statuscode muss reichen.
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Berechnet, was eine Änderung bewirken würde - ohne sie auszuführen.
 * Damit lässt sich im Dashboard vorher anzeigen, was passiert.
 */
export async function planPermissions({ guildId, channelIds, roleId, preset, botToken }) {
  const spec = PRESETS[preset];
  if (!spec) throw new Error(`Unbekanntes Rechtepaket "${preset}"`);

  const channels = await discord(`/guilds/${guildId}/channels`, botToken);
  const byId = new Map(channels.map((c) => [c.id, c]));
  const allowBits = bitsFrom(spec.allow);
  const denyBits = bitsFrom(spec.deny);

  const plan = [];
  for (const id of channelIds) {
    const channel = byId.get(id);
    if (!channel) {
      plan.push({ channelId: id, name: '(nicht gefunden)', skip: true, reason: 'Kanal existiert nicht mehr' });
      continue;
    }
    const existing = (channel.permission_overwrites ?? []).find((o) => o.id === roleId);
    if (spec.remove) {
      plan.push({
        channelId: id,
        name: channel.name,
        type: channel.type,
        action: existing ? 'entfernen' : 'nichts zu tun',
        skip: !existing,
      });
      continue;
    }
    const merged = mergeOverwrite(existing, allowBits, denyBits);
    const unchanged =
      existing && existing.allow === merged.allow && existing.deny === merged.deny;
    plan.push({
      channelId: id,
      name: channel.name,
      type: channel.type,
      action: existing ? 'ändern' : 'neu setzen',
      skip: unchanged,
      before: existing ? { allow: existing.allow, deny: existing.deny } : null,
      after: merged,
    });
  }
  return { preset: spec.label, plan };
}

/**
 * Wendet die Änderung an. Gibt zurück, was tatsächlich geändert wurde -
 * inklusive der vorherigen Werte, damit sich das rückgängig machen lässt.
 */
export async function applyPermissions({ guildId, channelIds, roleId, preset, botToken, reason }) {
  const spec = PRESETS[preset];
  if (!spec) throw new Error(`Unbekanntes Rechtepaket "${preset}"`);

  const { plan } = await planPermissions({ guildId, channelIds, roleId, preset, botToken });
  const applied = [];
  const failed = [];

  for (const step of plan) {
    if (step.skip) continue;
    try {
      if (spec.remove) {
        await discord(`/channels/${step.channelId}/permissions/${roleId}`, botToken, {
          method: 'DELETE',
          reason,
        });
      } else {
        await discord(`/channels/${step.channelId}/permissions/${roleId}`, botToken, {
          method: 'PUT',
          // type 0 = Rolle, 1 = Mitglied
          body: { type: 0, allow: step.after.allow, deny: step.after.deny },
          reason,
        });
      }
      applied.push({ channelId: step.channelId, name: step.name, before: step.before ?? null });
    } catch (err) {
      // Einzelne Fehler duerfen den Rest nicht aufhalten - meist fehlt dem Bot
      // in genau diesem Kanal die Berechtigung.
      failed.push({ channelId: step.channelId, name: step.name, error: err.message });
    }
  }

  return { applied, failed, skipped: plan.filter((p) => p.skip).length };
}
