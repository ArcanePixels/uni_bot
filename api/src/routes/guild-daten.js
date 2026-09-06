import { Router } from 'express';
import { zaehleDaten, loescheGuild } from '@allrounder/shared/guild-loeschen';

/**
 * Daten eines Servers ansehen und loeschen.
 *
 * Zwei Gruende:
 * - Wer den Bot rauswirft, soll seine Daten loswerden koennen. Sonst liegen
 *   sie still auf einem fremden Server weiter.
 * - Sobald andere den Bot nutzen, ist eine Loeschung keine Aufraeumarbeit
 *   mehr, sondern eine berechtigte Forderung.
 *
 * Das Loeschen verlangt bewusst mehr als einen Klick: Der Aufrufer muss die
 * Server-ID im Rumpf wiederholen. So kann eine versehentlich abgeschickte
 * Anfrage nicht die falschen Daten treffen.
 */
export function guildDatenRoutes(db, { audit = null } = {}) {
  const router = Router();

  /** Was ist fuer diesen Server gespeichert? */
  router.get('/:guildId/daten', (req, res) => {
    try {
      res.json(zaehleDaten(db, req.params.guildId));
    } catch (err) {
      res.status(500).json({ error: `Konnte nicht zaehlen: ${err.message}` });
    }
  });

  /**
   * Alles loeschen.
   *
   * Die Berechtigung hat das Dashboard schon geprueft - hier geht es nur
   * darum, ein Versehen abzufangen.
   */
  router.post('/:guildId/daten/loeschen', (req, res) => {
    const { guildId } = req.params;
    const bestaetigung = req.body?.bestaetigung;

    // Die ID muss wiederholt werden. Ein Klick allein loescht nichts.
    if (String(bestaetigung ?? '') !== String(guildId)) {
      return res.status(400).json({
        error: 'Zum Löschen muss die Server-ID zur Bestätigung wiederholt werden.',
      });
    }

    try {
      const vorher = zaehleDaten(db, guildId);
      const bericht = loescheGuild(db, guildId);

      // Der Audit-Eintrag wird gleich mitgeloescht - deshalb erst danach
      // schreiben, sonst waere er sofort wieder weg.
      audit?.record?.({
        guildId,
        actorId: String(req.body?.actorId ?? 'dashboard'),
        action: 'guild.daten-geloescht',
        target: guildId,
        detail: `${bericht.gesamt} Einträge aus ${Object.keys(bericht.tabellen).length} Tabellen`,
      });

      res.json({ ok: true, entfernt: bericht.gesamt, vorher: vorher.gesamt, tabellen: bericht.tabellen });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
