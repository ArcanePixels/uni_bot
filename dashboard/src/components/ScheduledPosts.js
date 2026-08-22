'use client';

import { useState, useTransition } from 'react';
import { Clock, Plus, Check, Alert, Hash } from './Icons.js';

// Gaengige Zeitpläne, damit niemand Cron-Syntax lernen muss.
const PRESETS = [
  { value: '0 9 * * *', label: 'Täglich um 9:00' },
  { value: '0 18 * * *', label: 'Täglich um 18:00' },
  { value: '0 9 * * 1', label: 'Montags um 9:00' },
  { value: '0 20 * * 5', label: 'Freitags um 20:00' },
  { value: '0 * * * *', label: 'Jede volle Stunde' },
  { value: '__custom', label: 'Eigener Cron-Ausdruck…' },
];

function describeCron(cron) {
  const hit = PRESETS.find((p) => p.value === cron);
  return hit ? hit.label : cron;
}

function formatTs(ts) {
  if (!ts) return '–';
  return new Date(ts * 1000).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function ScheduledPosts({ guildId, posts, channels, createAction, deleteAction }) {
  const [mode, setMode] = useState('cron');
  const [preset, setPreset] = useState(PRESETS[0].value);
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  function submit(formData) {
    setStatus(null);
    startTransition(async () => {
      const res = await createAction(guildId, formData);
      setStatus(res);
    });
  }

  function remove(id) {
    setStatus(null);
    startTransition(async () => setStatus(await deleteAction(guildId, id)));
  }

  const channelName = (id) => channels.find((c) => c.id === id)?.name ?? `Unbekannt (${id})`;

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>Gespeichert.</div>
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
          <span className="icon"><Plus width={17} height={17} /></span>
          <div>
            <h2>Neuen Post planen</h2>
            <p className="desc">Einmalig zu einem Zeitpunkt oder wiederkehrend.</p>
          </div>
        </div>
        <form action={submit}>
          <div className="field">
            <label>Kanal</label>
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
            <label>Text</label>
            <textarea name="content" required placeholder="Was soll gepostet werden?" />
          </div>

          <div className="field">
            <label>Wann</label>
            <div className="row" style={{ marginBottom: 10 }}>
              <label className="switch shrink">
                <input
                  type="radio"
                  name="mode"
                  value="cron"
                  checked={mode === 'cron'}
                  onChange={() => setMode('cron')}
                />
                <span>Wiederkehrend</span>
              </label>
              <label className="switch shrink">
                <input
                  type="radio"
                  name="mode"
                  value="once"
                  checked={mode === 'once'}
                  onChange={() => setMode('once')}
                />
                <span>Einmalig</span>
              </label>
              <span className="spacer" />
            </div>

            {mode === 'cron' ? (
              <>
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {preset === '__custom' ? (
                  <input
                    type="text"
                    name="cron"
                    placeholder="0 9 * * *"
                    style={{ marginTop: 8 }}
                    required
                  />
                ) : (
                  <input type="hidden" name="cron" value={preset} />
                )}
                <div className="help">
                  Zeiten richten sich nach der Zeitzone des Servers.
                </div>
              </>
            ) : (
              <input type="datetime-local" name="runAt" required />
            )}
          </div>

          <button type="submit" disabled={pending}>
            <Plus width={14} height={14} />
            {pending ? 'Speichere…' : 'Post anlegen'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="icon"><Clock width={17} height={17} /></span>
          <div>
            <h2>Geplante Posts</h2>
            <p className="desc">{posts.length === 0 ? 'Noch nichts angelegt.' : `${posts.length} Eintrag${posts.length === 1 ? '' : 'e'}.`}</p>
          </div>
        </div>
        {posts.length === 0 ? (
          <div className="empty">
            <Clock width={26} height={26} />
            Noch keine Posts geplant.
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>Kanal</th>
                <th>Text</th>
                <th>Zeitplan</th>
                <th>Zuletzt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">#{channelName(p.channel_id)}</td>
                  <td style={{ maxWidth: 260 }}>
                    {p.content.length > 70 ? `${p.content.slice(0, 70)}…` : p.content}
                  </td>
                  <td className="nowrap">
                    {p.cron ? (
                      <span className="badge accent">{describeCron(p.cron)}</span>
                    ) : (
                      <span className="badge">einmalig · {formatTs(p.run_at)}</span>
                    )}
                  </td>
                  <td className="dim nowrap">{formatTs(p.last_run_at)}</td>
                  <td>
                    <button
                      className="danger small"
                      onClick={() => remove(p.id)}
                      disabled={pending}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
