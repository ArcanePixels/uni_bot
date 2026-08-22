'use client';

import { useState, useTransition } from 'react';
import { Clock, Check, Alert, Plus, Info, Shield, Users } from './Icons.js';
import { SlashCommands } from './SlashCommands.js';

function formatTs(ts) {
  if (!ts) return 'nie';
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const PLACEHOLDERS = [
  ['{user}', 'Erwähnung des Aufrufers'],
  ['{username}', 'Name ohne Erwähnung'],
  ['{server}', 'Servername'],
  ['{count}', 'Mitgliederzahl'],
  ['{channel}', 'Aktueller Kanal'],
];

export function Commands({
  guildId,
  commands,
  messageLog,
  backups,
  prefix,
  logEnabled,
  commandsEnabled,
  roles,
  createAction,
  updateAction,
  deleteAction,
  clearLogAction,
  backupAction,
}) {
  const [tab, setTab] = useState('commands');
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [response, setResponse] = useState('');
  const [roleId, setRoleId] = useState('');
  const [editing, setEditing] = useState(null);

  const run = (fn, ...args) => {
    setStatus(null);
    startTransition(async () => {
      const res = await fn(guildId, ...args);
      setStatus(res);
      if (res?.ok) {
        setName('');
        setResponse('');
        setRoleId('');
        setEditing(null);
      }
    });
  };

  const roleName = (id) => roles.find((r) => r.id === id)?.name ?? `Rolle ${id}`;

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>
            {status.file
              ? `Sicherung erstellt: ${status.file}`
              : status.deleted !== undefined
                ? `${status.deleted} Einträge gelöscht.`
                : 'Gespeichert.'}
          </div>
        </div>
      )}
      {status && !status.ok && (
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{status.error}</div>
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          ['commands', 'Eigene Befehle'],
          ['slash', 'Eingebaute Befehle'],
          ['log', 'Nachrichten-Log'],
          ['backups', 'Sicherungen'],
        ].map(([key, label]) => (
          <a
            key={key}
            href="#"
            className={tab === key ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setTab(key);
            }}
          >
            {label}
          </a>
        ))}
      </div>

      {tab === 'commands' && (
        <>
          {!commandsEnabled && (
            <div className="notice warning">
              <Alert width={15} height={15} />
              <div>
                Eigene Befehle sind ausgeschaltet. Schalte sie in den{' '}
                <a href={`/guild/${guildId}/settings`}>Einstellungen</a> ein, sonst antwortet der
                Bot nicht.
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <span className="icon">
                <Plus width={17} height={17} />
              </span>
              <div>
                <h2>{editing ? `Befehl ${prefix}${editing.name} bearbeiten` : 'Neuer Befehl'}</h2>
                <p className="desc">
                  Der Bot antwortet mit dem hinterlegten Text, sobald jemand den Befehl schreibt.
                </p>
              </div>
            </div>

            {!editing && (
              <div className="field">
                <label>Befehl</label>
                <div className="row">
                  <span
                    className="shrink"
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: 32,
                      fontSize: 16,
                      color: 'var(--text-dim)',
                    }}
                  >
                    {prefix}
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="regeln"
                  />
                </div>
                <div className="help">
                  Nur Buchstaben, Ziffern, _ und -. Aufgerufen wird er später als{' '}
                  <code>
                    {prefix}
                    {name || 'regeln'}
                  </code>
                  .
                </div>
              </div>
            )}

            <div className="field">
              <label>Antwort</label>
              <textarea
                value={editing ? (response || editing.response) : response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Was der Bot antworten soll"
                style={{ minHeight: 100 }}
              />
              <div className="help">
                Platzhalter:{' '}
                {PLACEHOLDERS.map(([t, d], i) => (
                  <span key={t}>
                    {i > 0 && ', '}
                    <code>{t}</code> ({d})
                  </span>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Nur für eine Rolle (optional)</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">– alle dürfen –</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="row">
              <button
                onClick={() =>
                  editing
                    ? run(updateAction, editing.id, {
                        response: response || editing.response,
                        roleId: roleId || null,
                      })
                    : run(createAction, { name, response, roleId: roleId || null })
                }
                disabled={pending || (!editing && (!name.trim() || !response.trim()))}
              >
                {pending ? 'Speichere…' : editing ? 'Änderung speichern' : 'Befehl anlegen'}
              </button>
              {editing && (
                <button
                  className="secondary shrink"
                  onClick={() => {
                    setEditing(null);
                    setResponse('');
                    setRoleId('');
                  }}
                  disabled={pending}
                >
                  Abbrechen
                </button>
              )}
              <span className="spacer" />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="icon">
                <Clock width={17} height={17} />
              </span>
              <div>
                <h2>Angelegte Befehle</h2>
                <p className="desc">
                  {commands.length === 0 ? 'Noch keiner.' : `${commands.length} insgesamt.`}
                </p>
              </div>
            </div>

            {commands.length === 0 ? (
              <div className="empty">
                <Clock width={26} height={26} />
                Noch kein eigener Befehl angelegt.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Befehl</th>
                      <th>Antwort</th>
                      <th>Nur für</th>
                      <th>Genutzt</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {commands.map((c) => (
                      <tr key={c.id}>
                        <td className="nowrap">
                          <code>
                            {prefix}
                            {c.name}
                          </code>
                          {!c.enabled && (
                            <span className="badge" style={{ marginLeft: 6 }}>
                              aus
                            </span>
                          )}
                        </td>
                        <td style={{ maxWidth: 280, color: 'var(--text-dim)' }}>
                          {c.response.length > 70 ? `${c.response.slice(0, 70)}…` : c.response}
                        </td>
                        <td className="nowrap">
                          {c.role_id ? roleName(c.role_id) : <span className="dim">alle</span>}
                        </td>
                        <td className="nowrap dim">
                          {c.uses}× · {formatTs(c.last_used_at)}
                        </td>
                        <td className="nowrap">
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="ghost small"
                              onClick={() => {
                                setEditing(c);
                                setResponse(c.response);
                                setRoleId(c.role_id ?? '');
                              }}
                              disabled={pending}
                            >
                              Bearbeiten
                            </button>
                            <button
                              className="ghost small"
                              onClick={() => run(updateAction, c.id, { enabled: !c.enabled })}
                              disabled={pending}
                            >
                              {c.enabled ? 'Aus' : 'An'}
                            </button>
                            <button
                              className="danger small"
                              onClick={() => run(deleteAction, c.id)}
                              disabled={pending}
                            >
                              Löschen
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'slash' && <SlashCommands prefix={prefix} />}

      {tab === 'log' && (
        <>
          {!logEnabled && (
            <div className="notice warning">
              <Alert width={15} height={15} />
              <div>
                Das Nachrichten-Log ist ausgeschaltet – hier steht nur, was früher mitgeschrieben
                wurde. Einschalten in den <a href={`/guild/${guildId}/settings`}>Einstellungen</a>.
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <span className="icon">
                <Shield width={17} height={17} />
              </span>
              <div>
                <h2>Bearbeitet und gelöscht</h2>
                <p className="desc">
                  {messageLog.length === 0
                    ? 'Nichts aufgezeichnet.'
                    : `Die letzten ${messageLog.length} Einträge.`}
                </p>
              </div>
              <span className="spacer" />
              {messageLog.length > 0 && (
                <button
                  className="danger small"
                  onClick={() => run(clearLogAction)}
                  disabled={pending}
                >
                  Alles löschen
                </button>
              )}
            </div>

            {messageLog.length === 0 ? (
              <div className="empty">
                <Shield width={26} height={26} />
                Nichts aufgezeichnet.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Wann</th>
                      <th>Wer</th>
                      <th>Was</th>
                      <th>Inhalt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messageLog.map((m) => (
                      <tr key={m.id}>
                        <td className="dim nowrap">{formatTs(m.created_at)}</td>
                        <td className="nowrap">
                          <code>{m.author_id}</code>
                        </td>
                        <td className="nowrap">
                          <span className={`badge ${m.kind === 'delete' ? 'danger' : 'warn'}`}>
                            {m.kind === 'delete' ? 'gelöscht' : 'bearbeitet'}
                          </span>
                        </td>
                        <td style={{ maxWidth: 380, fontSize: 13 }}>
                          {m.kind === 'edit' ? (
                            <>
                              <div style={{ color: 'var(--text-faint)' }}>
                                {m.content_before || '(leer)'}
                              </div>
                              <div>→ {m.content_after || '(leer)'}</div>
                            </>
                          ) : (
                            m.content_before || <span className="dim">(kein Text)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="notice info" style={{ marginTop: 16, marginBottom: 0 }}>
              <Info width={15} height={15} />
              <div>
                Das ist eine Mitschrift von Nachrichteninhalten. Alte Einträge verschwinden nach
                der eingestellten Aufbewahrungsdauer automatisch.
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'backups' && (
        <div className="card">
          <div className="card-head">
            <span className="icon">
              <Users width={17} height={17} />
            </span>
            <div>
              <h2>Sicherungen</h2>
              <p className="desc">
                Einstellungen, Verstöße, Panels – alles in einer Datei. Läuft automatisch, lässt
                sich aber auch von Hand auslösen.
              </p>
            </div>
            <span className="spacer" />
            {!backups.hinweis && (
              <button className="secondary small" onClick={() => run(backupAction)} disabled={pending}>
                {pending ? 'Sichere…' : 'Jetzt sichern'}
              </button>
            )}
          </div>

          {backups.hinweis && (
            <div className="notice info" style={{ marginBottom: 0 }}>
              <Info width={15} height={15} />
              <div>
                {backups.hinweis}
                <div style={{ marginTop: 6, fontSize: 12.5 }}>
                  Eine Sicherung enthält die Daten <strong>aller</strong> Server, die diesen Bot
                  nutzen – deshalb ist der Zugriff auf den Betreiber beschränkt. Die automatische
                  Sicherung läuft davon unabhängig weiter.
                </div>
              </div>
            </div>
          )}

          {backups.hinweis ? null : backups.list.length === 0 ? (
            <div className="empty">
              <Users width={26} height={26} />
              Noch keine Sicherung vorhanden.
              <div style={{ marginTop: 6 }}>
                Die automatische läuft nachts – oder klick oben auf „Jetzt sichern".
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Datei</th>
                    <th>Wann</th>
                    <th>Größe</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.list.map((b) => (
                    <tr key={b.name}>
                      <td>
                        <code>{b.name}</code>
                      </td>
                      <td className="dim nowrap">{formatTs(b.createdAt)}</td>
                      <td className="nowrap">{formatSize(b.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!backups.hinweis && (
            <div className="notice info" style={{ marginTop: 16, marginBottom: 0 }}>
              <Info width={15} height={15} />
              <div>
                Aufbewahrung: {backups.keepDays} Tage, eine Sicherung je Tag. Sie liegen im
                Docker-Volume unter <code>{backups.directory}</code> – für eine Sicherung außer
                Haus kopier den Ordner regelmäßig weg.
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
