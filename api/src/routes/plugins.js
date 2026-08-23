import { Router } from 'express';
import { createPluginStore } from '@allrounder/shared/plugin-store';
import { publicManifests } from '@allrounder/shared/plugin-discovery';
import { checkChannelAccess } from '../channel-access.js';
import { getBotMember, getChannelsWithOverwrites, getRawRoles } from '../discord.js';

/**
 * Endpunkte fuer alle Plugins - eine Route fuer beliebig viele Erweiterungen.
 *
 * Ein Plugin beschreibt seine Felder und Listen im Manifest; daraus entstehen
 * Tabellen und Zugriff von selbst. Deshalb braucht ein Plugin fuer den
 * Normalfall keinen eigenen API-Code.
 *
 * Wer doch mehr braucht, legt eine `api.js` in den Plugin-Ordner. Die bekommt
 * einen eigenen Router unter `/api/guilds/:guildId/p/<name>/x/...` - bewusst in
 * einem Unterpfad, damit ein Plugin die Standardendpunkte nicht ueberschreiben
 * und damit auch keine fremden Daten erreichbar machen kann.
 */
export function pluginRoutes(db, plugins, extraRouters = new Map(), botToken = null) {
  const router = Router();

  // Fuer jedes Plugin einmal den Speicher aufbauen. Das legt die Tabellen an.
  const stores = new Map();
  const geladen = [];
  const fehler = [];

  for (const p of plugins) {
    try {
      stores.set(p.name, createPluginStore(db, p.manifest));
      geladen.push(p);
    } catch (err) {
      // Ein Plugin mit kaputtem Manifest darf die API nicht am Start hindern.
      fehler.push(`${p.name}: ${err.message}`);
    }
  }

  /** Die Liste der Plugins - daraus baut das Dashboard seine Reiter. */
  router.get('/plugins', (_req, res) => {
    res.json({ plugins: publicManifests(geladen), fehler });
  });

  /** Holt Store und Manifest, oder antwortet mit 404. */
  const hole = (req, res) => {
    const store = stores.get(req.params.plugin);
    if (!store) {
      res.status(404).json({ error: 'Unbekanntes Plugin' });
      return null;
    }
    return store;
  };

  /**
   * Darf der Bot in den gewaehlten Kanaelen das, was das Plugin braucht?
   *
   * Ohne diese Anzeige merkt man erst am ausbleibenden Post, dass ein Recht
   * fehlt - und Discord meldet dann nur "Missing Permissions", ohne zu sagen
   * welches.
   */
  const rechteStatus = async (guildId, manifest, config) => {
    // Welche Kanal-Felder verlangen Rechte?
    const felder = (manifest.ui?.sections ?? [])
      .flatMap((s) => s.fields ?? [])
      .filter((f) => f.type === 'channel' && f.requiresPermissions?.length);
    if (!felder.length || !botToken) return null;

    const [botMember, channels, roles] = await Promise.all([
      getBotMember(guildId, botToken),
      getChannelsWithOverwrites(guildId, botToken),
      getRawRoles(guildId, botToken),
    ]);

    return felder.map((feld) => {
      const channelId = config?.[feld.key];
      const channel = channels.find((c) => c.id === channelId);
      const basis = { key: feld.key, label: feld.label, benoetigt: feld.requiresPermissions };

      // Noch kein Kanal gewaehlt: nichts zu pruefen, aber auch kein Fehler.
      if (!channelId) return { ...basis, status: 'kein-kanal' };
      if (!channel) return { ...basis, status: 'kanal-weg', channelId };

      const ergebnis = checkChannelAccess({
        channel,
        roles,
        memberRoleIds: botMember.roleIds,
        memberId: botMember.id,
        everyoneId: guildId, // die @everyone-Rolle traegt die Server-ID
        benoetigt: feld.requiresPermissions,
      });

      return {
        ...basis,
        channelId,
        channelName: channel.name,
        status: ergebnis.ok ? 'ok' : 'fehlt',
        admin: ergebnis.admin,
        fehlend: ergebnis.fehlend,
      };
    });
  };

  /** Alle Daten eines Plugins fuer einen Server. */
  router.get('/:guildId/p/:plugin', async (req, res) => {
    const store = hole(req, res);
    if (!store) return;
    const daten = store.getAll(req.params.guildId);

    // Der Rechte-Status ist Beiwerk: Faellt Discord aus, soll die Seite
    // trotzdem laden - dann eben ohne Anzeige. Der Grund gehoert aber ins Log,
    // sonst sucht man sich bei einer leeren Anzeige zu Tode.
    let rechte = null;
    try {
      rechte = await rechteStatus(req.params.guildId, store.manifest, daten.config);
    } catch (err) {
      console.warn(`[api] Rechte-Pruefung fuer ${req.params.plugin} fehlgeschlagen: ${err.message}`);
      rechte = null;
    }

    // Was der Bot zuletzt gemacht hat. Ohne das sagt die Oberflaeche nur
    // "erledigt" - auch wenn in Discord nichts passiert ist.
    const merk = store.getState(req.params.guildId);

    res.json({
      manifest: publicManifests([{ manifest: store.manifest }])[0],
      ...daten,
      rechte,
      letzterLauf: merk.letzterLauf
        ? { ergebnis: merk.letztesErgebnis ?? null, zeit: merk.letzterLauf }
        : null,
    });
  });

  /** Einstellungen speichern. */
  router.put('/:guildId/p/:plugin/config', (req, res) => {
    const store = hole(req, res);
    if (!store) return;
    const ergebnis = store.saveConfig(req.params.guildId, req.body ?? {});
    if (ergebnis.error) return res.status(400).json({ error: ergebnis.error });
    res.json({ ok: true });
  });

  /** Eintrag in einer Liste anlegen. */
  router.post('/:guildId/p/:plugin/list/:list', (req, res) => {
    const store = hole(req, res);
    if (!store) return;
    const ergebnis = store.addItem(req.params.guildId, req.params.list, req.body ?? {});
    if (ergebnis.error) return res.status(400).json({ error: ergebnis.error });
    res.status(201).json({ id: ergebnis.id });
  });

  /** Eintrag aendern. */
  router.put('/:guildId/p/:plugin/list/:list/:id', (req, res) => {
    const store = hole(req, res);
    if (!store) return;
    const ergebnis = store.updateItem(
      req.params.guildId,
      req.params.list,
      req.params.id,
      req.body ?? {},
    );
    if (ergebnis.notFound) return res.status(404).json({ error: 'Nicht gefunden' });
    if (ergebnis.error) return res.status(400).json({ error: ergebnis.error });
    res.json({ ok: true });
  });

  /** Eintrag loeschen. */
  router.delete('/:guildId/p/:plugin/list/:list/:id', (req, res) => {
    const store = hole(req, res);
    if (!store) return;
    const ergebnis = store.removeItem(req.params.guildId, req.params.list, req.params.id);
    if (ergebnis.notFound) return res.status(404).json({ error: 'Nicht gefunden' });
    if (ergebnis.error) return res.status(400).json({ error: ergebnis.error });
    res.status(204).end();
  });

  /** Eintrag verschieben. */
  router.post('/:guildId/p/:plugin/list/:list/:id/move', (req, res) => {
    const store = hole(req, res);
    if (!store) return;
    const ergebnis = store.moveItem(
      req.params.guildId,
      req.params.list,
      req.params.id,
      req.body?.direction,
    );
    if (ergebnis.notFound) return res.status(404).json({ error: 'Nicht gefunden' });
    if (ergebnis.error) return res.status(400).json({ error: ergebnis.error });
    res.json({ ok: true, unveraendert: ergebnis.unveraendert === true });
  });

  /**
   * Aktionsknopf. Es gibt genau eine eingebaute Aktion: `publish` markiert den
   * Server, damit der Bot beim naechsten Durchlauf taetig wird. Alles andere
   * muss das Plugin selbst in seiner `api.js` anbieten.
   */
  router.post('/:guildId/p/:plugin/action/:action', (req, res) => {
    const store = hole(req, res);
    if (!store) return;

    const def = (store.manifest.ui?.sections ?? [])
      .filter((s) => s.type === 'actions')
      .flatMap((s) => s.actions ?? [])
      .find((a) => a.key === req.params.action);
    if (!def) return res.status(404).json({ error: 'Unbekannte Aktion' });

    // Eine Aktion kann verlangen, dass bestimmte Felder gefuellt sind - sonst
    // laeuft der Nutzer in einen stillen Fehlschlag im Bot.
    const config = store.getConfig(req.params.guildId);
    for (const key of def.requires ?? []) {
      if (!config[key]) {
        const feld = (store.manifest.ui?.sections ?? [])
          .flatMap((s) => s.fields ?? [])
          .find((f) => f.key === key);
        return res.status(400).json({ error: `"${feld?.label ?? key}" muss ausgefuellt sein.` });
      }
    }
    // Ebenso: eine leere Liste zu veroeffentlichen ergibt selten Sinn.
    if (def.requiresList) {
      const eintraege = store.listItems(req.params.guildId, def.requiresList);
      if (!eintraege || eintraege.length === 0) {
        return res.status(400).json({ error: 'Es ist noch kein Eintrag angelegt.' });
      }
    }

    store.markDirty(req.params.guildId);
    res.json({ ok: true });
  });

  // Eigene Endpunkte eines Plugins, bewusst unter /x/ abgetrennt.
  for (const [name, eigener] of extraRouters) {
    router.use(`/:guildId/p/${name}/x`, eigener);
  }

  return { router, stores };
}
