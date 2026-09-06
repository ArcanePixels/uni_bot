import { Alert } from './Icons.js';
import { einladungsLink, RECHTE_ERKLAERT } from '@/lib/einladung.js';

/**
 * Der Hinweis, wenn der Bot auf dem Server noch fehlt.
 *
 * Ohne ihn laeuft man in Seiten, die mit einer Discord-Fehlermeldung
 * abbrechen - ohne zu sagen, dass schlicht die Einladung fehlt.
 *
 * Der Link fuegt nichts hinzu: Er fuehrt zu Discords eigener Seite, wo man den
 * Server waehlt und bestaetigt. Wer dort keine Adminrechte hat, kann den Bot
 * auch nicht einladen - das entscheidet Discord.
 */
export function BotFehlt({ guildId, guildName = null }) {
  const link = einladungsLink({
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId,
  });

  return (
    <div className="card bot-fehlt">
      <div className="notice error">
        <Alert width={15} height={15} />
        <div>
          <strong>
            Der Bot ist auf {guildName ? `„${guildName}"` : 'diesem Server'} noch nicht.
          </strong>
          <p className="help">
            Einstellungen lassen sich erst speichern, wenn er eingeladen wurde.
          </p>
        </div>
      </div>

      {link ? (
        <>
          <p>
            Der Knopf führt zu Discord. Dort wählst du den Server aus und bestätigst –
            <strong> hinzugefügt wird nichts ohne deine Zustimmung.</strong> Einladen kann nur,
            wer auf dem Server „Server verwalten" darf.
          </p>

          <details className="rechte-liste">
            <summary>Welche Rechte der Bot bekommt</summary>
            <ul>
              {RECHTE_ERKLAERT.map((r) => (
                <li key={r.name}>
                  <strong>{r.name}</strong> – {r.wofuer}
                </li>
              ))}
            </ul>
            <p className="help">
              Administrator ist bewusst <strong>nicht</strong> dabei. Du kannst die Rechte auf
              der Discord-Seite noch einschränken – dann funktionieren die betroffenen
              Funktionen aber nicht.
            </p>
          </details>

          <a className="btn primary" href={link} target="_blank" rel="noopener noreferrer">
            Bot zu diesem Server einladen
          </a>
        </>
      ) : (
        <p className="help">
          Für den Einladungslink fehlt <code>DISCORD_CLIENT_ID</code> in der{' '}
          <code>.env</code> des Dashboards. Ohne sie muss der Betreiber den Bot von Hand
          einladen.
        </p>
      )}
    </div>
  );
}
