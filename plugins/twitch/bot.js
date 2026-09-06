import { EmbedBuilder } from 'discord.js';
import { createTwitchClient, normalizeLogin } from '@allrounder/shared/twitch';

/**
 * Twitch-Livemeldung.
 *
 * Zwei Wege, dasselbe Ergebnis:
 *
 * 1. **Webhook (EventSub)** — Twitch meldet sich selbst, sobald jemand live
 *    geht. Verzoegerung: Sekunden. Braucht einen oeffentlich erreichbaren
 *    HTTPS-Endpunkt auf Port 443, also eine Domain mit Zertifikat.
 * 2. **Abfrage im Intervall** — der Bot fragt regelmaessig nach. Laeuft
 *    ueberall, Verzoegerung rund eine Minute.
 *
 * Beide laufen gleichzeitig. Der Webhook ist schneller, die Abfrage faengt
 * auf, was er verpasst — etwa waehrend eines Neustarts. Doppelte Meldungen
 * verhindert `schonGemeldet()`: Massgeblich ist die Stream-ID, die Twitch je
 * Sendung vergibt.
 */

const ABFRAGE_MS = 60_000;
const WEBHOOK_MS = 5_000;

/** Setzt die Platzhalter im Nachrichtentext. */
export function formatText(vorlage, stream) {
  return String(vorlage ?? '{name} ist jetzt live!')
    .replaceAll('{name}', stream.name ?? stream.login ?? '')
    .replaceAll('{game}', stream.game || 'etwas')
    .replaceAll('{title}', stream.title || '')
    .replaceAll('{url}', stream.url ?? '');
}

/** Baut die Discord-Nachricht zu einem laufenden Stream. */
export function buildEmbed(stream, cfg, hinweis = null) {
  const embed = new EmbedBuilder()
    .setColor(parseColor(cfg.color))
    .setAuthor({ name: stream.name ?? stream.login })
    .setTitle(stream.title || `${stream.name} ist live`)
    .setURL(stream.url);

  const felder = [];
  if (stream.game) felder.push({ name: 'Spiel', value: stream.game, inline: true });
  if (Number.isFinite(stream.viewers)) {
    felder.push({ name: 'Zuschauer', value: String(stream.viewers), inline: true });
  }
  if (felder.length) embed.addFields(felder);

  if (hinweis?.trim()) embed.setDescription(hinweis.trim());

  // Twitch liefert dasselbe Bild fuer die ganze Sendung. Ein Zeitstempel
  // daran zwingt Discord, es neu zu laden statt das alte zu zeigen.
  if (cfg.zeige_vorschau !== 0 && stream.thumbnail) {
    embed.setImage(`${stream.thumbnail}?t=${Date.now()}`);
  }

  embed.setTimestamp(stream.startedAt ? new Date(stream.startedAt) : new Date());
  return embed;
}

/** Wandelt "#9146ff" in die Zahl, die Discord erwartet. */
export function parseColor(value) {
  const s = String(value ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(s)) return 0x9146ff; // Twitch-Lila als Rueckfall
  return parseInt(s, 16);
}

/**
 * Wurde dieser Stream schon gemeldet?
 *
 * Massgeblich ist die Stream-ID: Twitch vergibt sie je Sendung, sie bleibt
 * ueber die ganze Sendung gleich. Damit ist ausgeschlossen, dass Webhook und
 * Abfrage dieselbe Sendung zweimal melden.
 *
 * Zusaetzlich die Sperrzeit: Wer kurz hintereinander mehrfach live geht (etwa
 * nach einem Verbindungsabbruch), bekommt eine neue Stream-ID - ohne Sperre
 * gaebe es dann mehrere Meldungen mit Ping.
 */
export function schonGemeldet(merk, login, streamId, cooldownMin, jetzt = Date.now()) {
  const eintrag = merk?.[login];
  if (!eintrag) return false;

  // Dieselbe Sendung: auf jeden Fall schon gemeldet.
  if (eintrag.streamId && String(eintrag.streamId) === String(streamId)) return true;

  // Andere Sendung, aber noch in der Sperrzeit.
  const minuten = Number(cooldownMin);
  if (!Number.isFinite(minuten) || minuten <= 0) return false;
  const vergangen = jetzt - Number(eintrag.zeit ?? 0);
  return vergangen < minuten * 60_000;
}

export default {
  name: 'twitch',

  async setup(ctx) {
    const { client, store, log } = ctx;

    const clientId = process.env.TWITCH_CLIENT_ID?.trim();
    const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      // Ohne Zugangsdaten kann das Plugin nichts tun - das gehoert klar
      // gesagt, statt still nichts zu melden.
      log?.warn?.(
        'TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET fehlen in der .env - ' +
          'Livemeldungen sind abgeschaltet. Anlegen unter dev.twitch.tv/console/apps',
      );
      return {};
    }

    const twitch = createTwitchClient({ clientId, clientSecret });

    /** Postet die Meldung fuer einen laufenden Stream. */
    const melde = async (cfg, stream, hinweis) => {
      const guildId = cfg.guild_id;
      if (!cfg.channel_id) return 'kein Kanal gewaehlt';

      const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
      if (!channel) return 'Kanal nicht erreichbar';

      const rolle = cfg.ping_role_id ? `<@&${cfg.ping_role_id}> ` : '';
      const text = rolle + formatText(cfg.text, stream);

      await channel.send({
        content: text,
        embeds: [buildEmbed(stream, cfg, hinweis)],
        // Nur die gewaehlte Rolle darf pingen - nie @everyone, auch wenn
        // jemand das in den Text schreibt.
        allowedMentions: cfg.ping_role_id ? { roles: [cfg.ping_role_id] } : { parse: [] },
      });

      // Merken, damit dieselbe Sendung nicht erneut gemeldet wird.
      const merk = store.getState(guildId);
      store.setState(guildId, {
        gemeldet: {
          ...(merk.gemeldet ?? {}),
          [stream.login]: { streamId: stream.id, zeit: Date.now() },
        },
      });

      return `gemeldet: ${stream.name}`;
    };

    /** Prueft einen Server: wer ist live, wer wurde noch nicht gemeldet? */
    const pruefeGuild = async (cfg) => {
      const guildId = cfg.guild_id;
      const eintraege = store.listItems(guildId, 'kanaele') ?? [];
      if (eintraege.length === 0) return 'keine Kanaele eingetragen';
      if (!cfg.channel_id) return 'kein Kanal gewaehlt';

      // Was der Nutzer eingetippt hat, kann eine URL sein.
      const zuLogin = new Map();
      for (const e of eintraege) {
        const login = normalizeLogin(e.login);
        if (login) zuLogin.set(login, e);
      }
      if (zuLogin.size === 0) return 'kein gueltiger Kanalname';

      const live = await twitch.getStreams([...zuLogin.keys()]);
      const merk = store.getState(guildId).gemeldet ?? {};
      let gemeldet = 0;

      for (const [login, stream] of live) {
        if (schonGemeldet(merk, login, stream.id, cfg.cooldown_min)) continue;
        try {
          await melde(cfg, stream, zuLogin.get(login)?.hinweis);
          gemeldet++;
        } catch (err) {
          log?.error(`${guildId}: Meldung fuer ${login} fehlgeschlagen: ${err.message}`);
        }
      }

      return gemeldet ? `${gemeldet} Meldung(en)` : `nichts Neues (${live.size} live)`;
    };

    // --- Weg 1: Abfrage im Intervall --------------------------------------
    // Faengt auch das auf, was der Webhook verpasst - etwa waehrend eines
    // Neustarts oder wenn keine Domain eingerichtet ist.
    const alleServer = async () => {
      let configs = [];
      try {
        configs = store.allGuilds();
      } catch {
        return;
      }
      for (const cfg of configs) {
        try {
          const ergebnis = await pruefeGuild(cfg);
          if (!String(ergebnis).startsWith('nichts')) log?.info(`${cfg.guild_id}: ${ergebnis}`);
        } catch (err) {
          log?.error(`${cfg.guild_id}: ${err.message}`);
        }
      }
    };

    this._abfrage = setInterval(alleServer, ABFRAGE_MS);

    // --- Weg 2: Webhook ---------------------------------------------------
    // Die API legt eingehende Meldungen in `twitch_events` ab - beide laufen
    // in eigenen Containern und koennen sich nicht direkt ansprechen. Wir
    // sehen haeufig nach, damit die Meldung wirklich in Sekunden ankommt.
    const { db } = ctx;
    let offeneEreignisse = null;
    let abhaken = null;
    try {
      offeneEreignisse = db.prepare(
        'SELECT * FROM twitch_events WHERE handled_at IS NULL ORDER BY id LIMIT 20',
      );
      abhaken = db.prepare('UPDATE twitch_events SET handled_at = ? WHERE id = ?');
    } catch {
      // Tabelle gibt es nur, wenn der Webhook eingerichtet ist.
      log?.debug?.('Keine Webhook-Tabelle - nur Abfrage im Intervall aktiv');
    }

    if (offeneEreignisse) {
      this._webhook = setInterval(async () => {
        let ereignisse = [];
        try {
          ereignisse = offeneEreignisse.all();
        } catch {
          return;
        }
        if (ereignisse.length === 0) return;

        for (const e of ereignisse) {
          try {
            if (e.typ === 'stream.online' && e.login) {
              // Twitch schickt nur, DASS jemand live ist - Titel, Spiel und
              // Zuschauerzahl muessen wir selbst holen.
              const live = await twitch.getStreams([e.login]);
              const stream = live.get(e.login);

              if (stream) {
                for (const cfg of store.allGuilds()) {
                  const eintraege = store.listItems(cfg.guild_id, 'kanaele') ?? [];
                  const treffer = eintraege.find((x) => normalizeLogin(x.login) === e.login);
                  if (!treffer) continue;

                  const merk = store.getState(cfg.guild_id).gemeldet ?? {};
                  if (schonGemeldet(merk, e.login, stream.id, cfg.cooldown_min)) continue;

                  await melde(cfg, stream, treffer.hinweis);
                  log?.info(`${cfg.guild_id}: ${stream.name} live (per Webhook)`);
                }
              }
            }
          } catch (err) {
            log?.error(`Webhook-Ereignis ${e.id}: ${err.message}`);
          } finally {
            // Immer abhaken - auch im Fehlerfall. Sonst laeuft es endlos.
            try {
              abhaken.run(Math.floor(Date.now() / 1000), e.id);
            } catch {
              /* beim naechsten Durchlauf erneut */
            }
          }
        }
      }, WEBHOOK_MS);
    }

    // --- EventSub anmelden ------------------------------------------------
    // Ohne Anmeldung schickt Twitch nie etwas. Sie muss nach jedem Neustart
    // abgeglichen werden: Kanaele koennen dazugekommen oder weggefallen sein.
    const webhookUrl = process.env.TWITCH_WEBHOOK_URL?.trim();
    const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET?.trim();

    const meldeAn = async () => {
      if (!webhookUrl || !webhookSecret) return;
      // Twitch nimmt ausschliesslich HTTPS an - eine http-Adresse wuerde ohne
      // erkennbaren Grund abgelehnt.
      if (!webhookUrl.startsWith('https://')) {
        log?.warn?.(`TWITCH_WEBHOOK_URL muss mit https:// beginnen - Webhook bleibt aus`);
        return;
      }

      // Alle Kanaele ueber alle Server einsammeln.
      const alle = new Set();
      for (const cfg of store.allGuilds()) {
        for (const e of store.listItems(cfg.guild_id, 'kanaele') ?? []) {
          const login = normalizeLogin(e.login);
          if (login) alle.add(login);
        }
      }
      if (alle.size === 0) return;

      try {
        const nutzer = await twitch.getUsers([...alle]);
        const bestehend = await twitch.listSubscriptions();
        const angemeldet = new Set(
          bestehend
            .filter((b) => b.type === 'stream.online' && b.callback === webhookUrl)
            .map((b) => String(b.userId)),
        );

        let neu = 0;
        for (const [, u] of nutzer) {
          if (angemeldet.has(String(u.id))) continue;
          await twitch.subscribe({
            userId: u.id,
            callbackUrl: webhookUrl,
            secret: webhookSecret,
          });
          neu++;
        }
        if (neu) log?.info(`${neu} Kanal/Kanaele bei Twitch angemeldet`);

        // Was nicht mehr beobachtet wird, wieder abmelden - sonst sammeln
        // sich Anmeldungen an, die niemand mehr braucht.
        const gebraucht = new Set([...nutzer.values()].map((u) => String(u.id)));
        for (const b of bestehend) {
          if (b.type !== 'stream.online' || b.callback !== webhookUrl) continue;
          if (gebraucht.has(String(b.userId))) continue;
          await twitch.unsubscribe(b.id);
        }
      } catch (err) {
        log?.error(`Anmeldung bei Twitch fehlgeschlagen: ${err.message}`);
      }
    };

    // Einmal kurz nach dem Start, danach stuendlich abgleichen.
    setTimeout(meldeAn, 10_000).unref?.();
    this._anmeldung = setInterval(meldeAn, 60 * 60_000);

    // --- Knopf im Dashboard -----------------------------------------------
    this._knopf = setInterval(async () => {
      let auftraege = [];
      try {
        auftraege = store.pendingGuilds();
      } catch {
        return;
      }
      for (const cfg of auftraege) {
        let ergebnis;
        try {
          ergebnis = await pruefeGuild(cfg);
          log?.info(`${cfg.guild_id}: ${ergebnis}`);
          // Ein neuer Kanal soll nicht bis zum stuendlichen Abgleich warten.
          await meldeAn();
        } catch (err) {
          ergebnis = `Fehlgeschlagen: ${err.message}`;
          log?.error(`${cfg.guild_id}: ${err.message}`);
        } finally {
          store.clearDirty(cfg.guild_id, ergebnis);
        }
      }
    }, WEBHOOK_MS);

    // Klar sagen, welcher Weg laeuft - und was fehlt, wenn der schnelle
    // nicht aktiv ist. Sonst sucht man im Log vergeblich nach dem Grund.
    if (offeneEreignisse && webhookUrl && webhookSecret) {
      log?.info('Twitch bereit: Webhook aktiv, Meldung in Sekunden');
    } else {
      const fehlt = [];
      if (!webhookUrl) fehlt.push('TWITCH_WEBHOOK_URL');
      if (!webhookSecret) fehlt.push('TWITCH_WEBHOOK_SECRET');
      if (!offeneEreignisse) fehlt.push('den Webhook-Endpunkt in der API');
      log?.info(
        `Twitch bereit: Abfrage jede Minute. Fuer Meldung in Sekunden fehlt ${fehlt.join(' und ')}.`,
      );
    }
    return {};
  },

  teardown() {
    for (const t of [this._abfrage, this._webhook, this._knopf, this._anmeldung]) {
      if (t) clearInterval(t);
    }
    this._abfrage = this._webhook = this._knopf = this._anmeldung = null;
  },
};
