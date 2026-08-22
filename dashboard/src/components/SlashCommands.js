import { SLASH_COMMANDS } from '@allrounder/shared/slash-commands';
import { Info } from './Icons.js';

/**
 * Übersicht der fest eingebauten Slash-Commands.
 *
 * Die Liste kommt aus `shared` – derselben Quelle, aus der der Bot sie bei
 * Discord anmeldet. So kann die Anzeige nicht veralten.
 */
export function SlashCommands({ prefix = '!' }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="icon">
          <Info width={17} height={17} />
        </span>
        <div>
          <h2>Eingebaute Befehle</h2>
          <p className="desc">
            Diese Befehle bringt der Bot mit – sie müssen nicht angelegt werden und erscheinen in
            Discord beim Tippen von <code>/</code> mit Autovervollständigung.
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Befehl</th>
              <th>Was er tut</th>
              <th>Wer darf</th>
            </tr>
          </thead>
          <tbody>
            {SLASH_COMMANDS.map((c) => (
              <tr key={c.name}>
                <td className="nowrap" style={{ verticalAlign: 'top' }}>
                  <code>{c.usage}</code>
                </td>
                <td>
                  {c.description}
                  {c.detail && (
                    <div style={{ color: 'var(--text-faint)', fontSize: 12.5, marginTop: 3 }}>
                      {c.detail}
                    </div>
                  )}
                </td>
                <td className="nowrap" style={{ verticalAlign: 'top' }}>
                  {c.permission ? (
                    <span className="badge">{c.permissionLabel}</span>
                  ) : (
                    <span className="badge ok">{c.permissionLabel}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="notice info" style={{ marginTop: 16, marginBottom: 0 }}>
        <Info width={15} height={15} />
        <div>
          Antworten sind <strong>nur für den Aufrufer sichtbar</strong> – im Kanal steht nichts.
          Discord blendet jeden Befehl nur bei denen ein, die die passende Berechtigung haben.
          <div style={{ marginTop: 6 }}>
            Tauchen sie nach einem Update nicht sofort auf: Discord verteilt die Liste mit
            Verzögerung. Ein Neuladen des Clients mit <code>Strg+R</code> hilft meist.
          </div>
          <div style={{ marginTop: 6 }}>
            Deine eigenen Textbefehle (<code>{prefix}…</code>) bekommen technisch bedingt{' '}
            <strong>keine</strong> Autovervollständigung – dafür gibt es{' '}
            <code>{prefix}befehle</code> und <code>/befehle</code> als Übersicht.
          </div>
        </div>
      </div>
    </div>
  );
}
