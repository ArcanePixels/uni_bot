import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';

/**
 * Serverregeln - der Bot-Teil.
 *
 * Zeigt, wie ein Plugin im neuen Format aussieht: Die Oberflaeche steht in
 * plugin.json, die Daten verwaltet das Grundsystem. Hier steht nur noch das,
 * was wirklich Bot-Arbeit ist - das Bauen und Posten der Nachricht.
 *
 * `ctx.store` kommt vom Grundsystem und kennt die Felder aus dem Manifest.
 * Eigene Tabellen braucht dieses Plugin deshalb nicht mehr.
 */

const CHECK_INTERVAL_MS = 5000;

/** Wandelt "#7c5cff" in die Zahl, die Discord erwartet. */
export function parseColor(value) {
  const s = String(value ?? '')
    .trim()
    .replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(s)) return 0x5865f2; // Discord-Blau als Rueckfall
  return parseInt(s, 16);
}

/** Discord-Grenzen. Ueberschritten heisst: Der Post wird abgelehnt. */
const MAX_DESCRIPTION = 4096;
const MAX_FIELDS = 25;

/**
 * Eine schlichte Aufzaehlung als Fliesstext:
 *
 *   🤝 **1.** Seien Sie cool, freundlich und respektvoll zueinander.
 *   **2.** Halten Sie Ihr Discord-Profil angemessen.
 *
 * Das ist der Normalfall. Discord verlangt fuer jedes Embed-*Feld* einen Namen,
 * eine Regel ohne Ueberschrift kann also gar kein Feld sein. Im Beschreibungs-
 * text gibt es diese Einschraenkung nicht.
 */
export function buildListe(rules, startNummer = 1) {
  return (rules ?? [])
    .map((r, i) => {
      const icon = r.icon?.trim();
      const nummer = `**${startNummer + i}.**`;
      const text = r.text?.trim() || '';
      const titel = r.title?.trim();
      // Hat eine Regel doch eine Ueberschrift, kommt sie fett davor.
      const inhalt = titel && text ? `**${titel}** – ${text}` : text || titel || '';
      return icon ? `${icon} ${nummer} ${inhalt}` : `${nummer} ${inhalt}`;
    })
    .join('\n');
}

/** Hat mindestens eine Regel eine eigene Ueberschrift? */
export function brauchtFelder(rules) {
  return (rules ?? []).some((r) => r.title?.trim());
}

/**
 * Baut die Regel-Nachricht.
 *
 * Zwei Darstellungen, je nachdem was drinsteht:
 * - Keine Ueberschriften -> eine durchgehende nummerierte Liste
 * - Mit Ueberschriften   -> je Regel ein Feld, damit die Ueberschrift wirkt
 */
export function buildEmbed({ title, description, color, footer, rules }) {
  const embed = new EmbedBuilder()
    .setTitle(title?.trim() || 'Serverregeln')
    .setColor(parseColor(color));

  const alle = rules ?? [];
  const einleitung = description?.trim() || '';

  if (!brauchtFelder(alle)) {
    // Der Normalfall: schlichte Aufzaehlung.
    const liste = buildListe(alle);
    // Leerzeile zwischen Einleitung und Aufzaehlung.
    const text = einleitung ? [einleitung, '', liste].join('\n') : liste;
    if (text) embed.setDescription(text.slice(0, MAX_DESCRIPTION));
  } else {
    if (einleitung) embed.setDescription(einleitung);
    for (const [i, r] of alle.slice(0, MAX_FIELDS).entries()) {
      const nummer = i + 1;
      const icon = r.icon?.trim();
      const ueberschrift = r.title?.trim() || r.text?.trim()?.slice(0, 80) || 'Regel';
      embed.addFields({
        name: icon ? `${icon}  ${nummer}. ${ueberschrift}` : `${nummer}. ${ueberschrift}`,
        // Discord weist ein Feld mit leerem Wert ab.
        value: (r.title?.trim() ? r.text?.trim() : '') || '​',
      });
    }
  }

  if (footer?.trim()) embed.setFooter({ text: footer.trim() });
  embed.setTimestamp();
  return embed;
}

/**
 * Passt alles in eine Nachricht?
 *
 * Lieber vorher pruefen und klar melden, als Discord den Post kommentarlos
 * ablehnen zu lassen.
 */
export function pruefeGroesse(cfg, rules) {
  if (brauchtFelder(rules)) {
    if (rules.length > MAX_FIELDS) {
      return `Mehr als ${MAX_FIELDS} Regeln mit Ueberschrift passen nicht in eine Nachricht.`;
    }
    return null;
  }
  const laenge = buildListe(rules).length + (cfg.description?.trim()?.length ?? 0) + 2;
  if (laenge > MAX_DESCRIPTION) {
    return `Die Regeln sind zusammen ${laenge} Zeichen lang - Discord erlaubt ${MAX_DESCRIPTION}.`;
  }
  return null;
}

/**
 * Welche Rechte fehlen dem Bot in diesem Kanal?
 *
 * Gibt die fehlenden im Klartext zurueck oder null, wenn alles da ist.
 * Discord meldet sonst nur "Missing Permissions" - ohne zu sagen, welches.
 */
export function fehlendeRechte(channel, botUserId) {
  // Ohne diese Angaben laesst sich nichts pruefen - dann eben nicht, und
  // Discord meldet es beim Senden. Besser als faelschlich zu blockieren.
  if (!botUserId || typeof channel?.permissionsFor !== 'function') return null;

  const rechte = channel.permissionsFor(botUserId);
  if (!rechte) return null;

  const gebraucht = [
    [PermissionFlagsBits.ViewChannel, 'Kanal ansehen'],
    [PermissionFlagsBits.SendMessages, 'Nachrichten senden'],
    [PermissionFlagsBits.EmbedLinks, 'Links einbetten'],
    // Ohne das findet der Bot seine eigene alte Nachricht nicht wieder und
    // postet bei jeder Aenderung eine neue.
    [PermissionFlagsBits.ReadMessageHistory, 'Nachrichtenverlauf anzeigen'],
  ];

  const fehlen = gebraucht.filter(([bit]) => !rechte.has(bit)).map(([, name]) => name);
  return fehlen.length ? fehlen.join(', ') : null;
}

export default {
  name: 'regeln',

  async setup(ctx) {
    const { client, store, log } = ctx;

    /**
     * Postet die Regeln oder aktualisiert die bestehende Nachricht.
     * Gibt einen kurzen Text zurueck, was passiert ist.
     */
    const veroeffentlichen = async (cfg) => {
      const guildId = cfg.guild_id;
      if (!cfg.channel_id) return 'kein Kanal gewaehlt';

      const rules = store.listItems(guildId, 'items') ?? [];
      // Eine leere Regel-Nachricht waere sinnlos.
      if (rules.length === 0) return 'keine Regeln angelegt';

      const zuGross = pruefeGroesse(cfg, rules);
      if (zuGross) return zuGross;

      const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
      if (!channel) return 'Kanal nicht erreichbar';

      // Rechte vorher pruefen. Discord antwortet sonst nur mit "Missing
      // Permissions" und verraet nicht, welches Recht fehlt - dann sucht man
      // im Code statt in den Kanaleinstellungen.
      const fehlt = fehlendeRechte(channel, client.user?.id);
      if (fehlt) return `im Kanal #${channel.name ?? cfg.channel_id} fehlt: ${fehlt}`;

      const embed = buildEmbed({ ...cfg, rules });

      // Was wir uns gemerkt haben - die ID der zuletzt geposteten Nachricht.
      const merk = store.getState(guildId);

      // Bestehende Nachricht bearbeiten, statt eine neue zu posten - so bleibt
      // der Kanal sauber und Verlinkungen funktionieren weiter.
      if (merk.messageId) {
        const alt = await channel.messages.fetch(merk.messageId).catch(() => null);
        if (alt) {
          await alt.edit({ embeds: [embed] });
          return `aktualisiert (${rules.length} Regeln)`;
        }
        // Wurde sie in Discord geloescht, posten wir eine neue.
      }

      const neu = await channel.send({ embeds: [embed] });
      // setState setzt bewusst kein `dirty` - sonst wuerde die Nachricht beim
      // naechsten Durchlauf gleich nochmal bearbeitet.
      store.setState(guildId, { messageId: neu.id });
      return `gepostet (${rules.length} Regeln)`;
    };

    // Das Dashboard kann den Bot nicht direkt ansprechen - beide laufen in
    // eigenen Containern. Es markiert den Server stattdessen, und wir sehen
    // regelmaessig nach.
    this._timer = setInterval(async () => {
      let auftraege = [];
      try {
        auftraege = store.pendingGuilds();
      } catch {
        return; // Datenbank gerade nicht lesbar - beim naechsten Mal wieder.
      }

      for (const cfg of auftraege) {
        let ergebnis;
        try {
          ergebnis = await veroeffentlichen(cfg);
          log?.info(`${cfg.guild_id}: ${ergebnis}`);
        } catch (err) {
          ergebnis = `Fehlgeschlagen: ${err.message}`;
          log?.error(`Veroeffentlichen fehlgeschlagen: ${err.message}`);
        } finally {
          // Immer abhaken - auch im Fehlerfall. Sonst wuerde es endlos
          // weiterversuchen und das Log fluten. Das Ergebnis geht mit, damit
          // das Dashboard es anzeigen kann.
          store.clearDirty(cfg.guild_id, ergebnis);
        }
      }
    }, CHECK_INTERVAL_MS);

    // Moderatoren koennen die Regeln jederzeit anzeigen.
    this._onMessage = async (message) => {
      if (message.author?.bot || !message.guild) return;
      if (message.content.trim().toLowerCase() !== '!regeln') return;
      // Bewusst auf Mods beschraenkt, damit der Befehl nicht als Spam dient.
      if (!message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return;

      const cfg = store.getConfig(message.guild.id);
      const rules = store.listItems(message.guild.id, 'items') ?? [];
      if (rules.length === 0) {
        await message.reply('Es sind noch keine Regeln hinterlegt.').catch(() => {});
        return;
      }
      await message.channel.send({ embeds: [buildEmbed({ ...cfg, rules })] }).catch(() => {});
    };
    client.on('messageCreate', this._onMessage);

    log?.info('Serverregeln bereit');
  },

  teardown() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },
};
