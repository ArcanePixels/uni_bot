'use client';

import { useState, useTransition } from 'react';
import { Play, Plus, Check, Alert, Info } from './Icons.js';

function formatTs(ts) {
  if (!ts) return 'noch nie';
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function YoutubeFeeds({
  guildId,
  feeds,
  channels,
  intervalMinutes = 10,
  createAction,
  deleteAction,
  checkAction,
}) {
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  function submit(formData) {
    setStatus(null);
    startTransition(async () => setStatus(await createAction(guildId, formData)));
  }

  function remove(id) {
    setStatus(null);
    startTransition(async () => setStatus(await deleteAction(guildId, id)));
  }

  function jetztPruefen() {
    setStatus(null);
    startTransition(async () => {
      const res = await checkAction(guildId);
      setStatus(
        res?.ok
          ? { ok: true, text: 'Prüfung angefordert – der Bot ist in wenigen Sekunden dran. Lad die Seite danach neu.' }
          : res,
      );
    });
  }

  const channelName = (id) => channels.find((c) => c.id === id)?.name ?? `Unbekannt (${id})`;

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>{status.text ?? 'Gespeichert.'}</div>
        </div>
      )}
      {status && !status.ok && (
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{status.error}</div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="icon"><Play width={17} height={17} /></span>
          <div>
            <h2>YouTube-Kanal beobachten</h2>
            <p className="desc">
          Neue Uploads werden automatisch gepostet. Discord kann das nicht von sich aus –
          Twitch dagegen schon, dafür brauchst du den Bot nicht.
            </p>
          </div>
        </div>

        <form action={submit}>
          <div className="field">
            <label>YouTube-Kanal-ID oder Kanal-URL</label>
            <input
              type="text"
              name="ytChannelId"
              required
              placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
            />
            <div className="help">
              Die ID beginnt mit „UC“ und ist 24 Zeichen lang. Ein <code>@handle</code> funktioniert
              nicht – du findest die ID in der URL der Kanalseite, wenn sie die Form
              <code> youtube.com/channel/UC…</code> hat.
            </div>
          </div>

          <div className="field">
            <label>Zielkanal auf Discord</label>
            <select name="channelId" required defaultValue="">
              <option value="" disabled>
                Bitte wählen…
              </option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Nachrichtenvorlage (optional)</label>
            <input
              type="text"
              name="template"
              placeholder="Neues Video von **{author}**: {title}"
            />
            <div className="help">
              Platzhalter: <code>{'{title}'}</code>, <code>{'{url}'}</code>,{' '}
              <code>{'{author}'}</code>. Leer lassen für die Standardvorlage.
            </div>
          </div>

          <button type="submit" disabled={pending}>
            <Plus width={14} height={14} />
            {pending ? 'Speichere…' : 'Kanal hinzufügen'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="icon"><Play width={17} height={17} /></span>
          <div>
            <h2>Beobachtete Kanäle</h2>
            <p className="desc">
              {feeds.length === 0
                ? 'Noch nichts eingetragen.'
                : `Wird alle ${intervalMinutes} Minuten geprüft, außerdem bei jedem Bot-Start.`}
            </p>
          </div>
          <span className="spacer" />
          {feeds.length > 0 && (
            <button className="secondary small" onClick={jetztPruefen} disabled={pending}>
              {pending ? 'Fordere an…' : 'Jetzt prüfen'}
            </button>
          )}
        </div>
        {feeds.length === 0 ? (
          <div className="empty">
            <Play width={26} height={26} />
            Noch keine Kanäle eingetragen.
          </div>
        ) : (
          <>
            <div className="table-wrap"><table>
              <thead>
                <tr>
                  <th>YouTube-Kanal</th>
                  <th>Postet nach</th>
                  <th>Zuletzt geprüft</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {feeds.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <a
                        href={`https://www.youtube.com/channel/${f.yt_channel_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {f.yt_channel_id}
                      </a>
                    </td>
                    <td className="nowrap">#{channelName(f.channel_id)}</td>
                    <td className="dim nowrap">{formatTs(f.last_checked_at)}</td>
                    <td>
                      <button className="danger small" onClick={() => remove(f.id)} disabled={pending}>
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="notice info" style={{ marginTop: 16, marginBottom: 0 }}>
              <Info width={15} height={15} />
              <div>
                Beim ersten Prüfen merkt sich der Bot nur den aktuellsten Upload, ohne ihn zu
                posten – sonst käme direkt beim Einrichten ein altes Video als „neu“ rein.
                <div style={{ marginTop: 6 }}>
                  Steht bei „Zuletzt geprüft“ dauerhaft <em>noch nie</em>, obwohl der Bot läuft:
                  Ein Blick ins Log hilft – <code>docker compose logs bot --tail 30</code>.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
