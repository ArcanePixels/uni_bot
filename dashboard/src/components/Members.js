'use client';

import { useState, useTransition, useMemo } from 'react';
import { Users, Gavel, Check, Alert, Clock, Shield } from './Icons.js';

const TIMEOUT_PRESETS = [
  { minutes: 5, label: '5 Minuten' },
  { minutes: 60, label: '1 Stunde' },
  { minutes: 1440, label: '1 Tag' },
  { minutes: 10080, label: '1 Woche' },
];

const ACTION_LABEL = {
  warn: 'Verwarnung',
  timeout: 'Timeout',
  untimeout: 'Timeout aufheben',
  kick: 'Kick',
  ban: 'Ban',
};

function formatJoined(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
}

function isTimedOut(member) {
  return member.timeoutUntil && new Date(member.timeoutUntil) > new Date();
}

/** Dialog für eine Maßnahme – zwingt zu einer bewussten Entscheidung. */
function ActionDialog({ member, action, channels, onConfirm, onCancel, pending }) {
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [notify, setNotify] = useState('');

  const severe = action === 'ban' || action === 'kick';

  return (
    <div className="card" style={{ borderColor: severe ? 'var(--danger)' : 'var(--accent)' }}>
      <div className="card-head">
        <span className="icon">
          <Gavel width={17} height={17} />
        </span>
        <div>
          <h2>
            {ACTION_LABEL[action]} für {member.name}
          </h2>
          <p className="desc">
            <code>{member.id}</code>
          </p>
        </div>
      </div>

      {severe && (
        <div className="notice warning">
          <Alert width={15} height={15} />
          <div>
            {action === 'ban'
              ? 'Ein Ban sperrt das Mitglied dauerhaft aus. Aufheben geht nur über die Ban-Liste.'
              : 'Ein Kick entfernt das Mitglied. Es kann mit einer neuen Einladung zurückkommen.'}
          </div>
        </div>
      )}

      {action === 'timeout' && (
        <div className="field">
          <label>Dauer</label>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {TIMEOUT_PRESETS.map((p) => (
              <option key={p.minutes} value={p.minutes}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="help">Discord erlaubt höchstens 28 Tage.</div>
        </div>
      )}

      <div className="field">
        <label>Grund</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Warum wird die Maßnahme verhängt?"
        />
        <div className="help">
          Steht im Verstoß-Log und im Discord-Audit-Log. Leer lassen ist möglich, aber unschön
          für die Nachvollziehbarkeit.
        </div>
      </div>

      {channels.length > 0 && action !== 'untimeout' && (
        <div className="field">
          <label>Öffentlich melden in (optional)</label>
          <select value={notify} onChange={(e) => setNotify(e.target.value)}>
            <option value="">– nicht melden –</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="row">
        <button
          className={severe ? 'danger' : ''}
          onClick={() => onConfirm({ reason, minutes, notifyChannelId: notify || undefined })}
          disabled={pending}
          style={severe ? { borderColor: 'var(--danger)' } : undefined}
        >
          {pending ? 'Führe aus…' : `${ACTION_LABEL[action]} bestätigen`}
        </button>
        <button className="secondary shrink" onClick={onCancel} disabled={pending}>
          Abbrechen
        </button>
        <span className="spacer" />
      </div>
    </div>
  );
}

export function Members({ guildId, members, channels, infractionCounts, moderateAction }) {
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // { member, action }
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = q
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.username ?? '').toLowerCase().includes(q) ||
            m.id.includes(q),
        )
      : members;
    // Auffällige zuerst – danach alphabetisch.
    return [...list].sort((a, b) => {
      const ca = infractionCounts[a.id] ?? 0;
      const cb = infractionCounts[b.id] ?? 0;
      if (ca !== cb) return cb - ca;
      return a.name.localeCompare(b.name, 'de');
    });
  }, [members, query, infractionCounts]);

  function run(member, action, extra) {
    setStatus(null);
    startTransition(async () => {
      const res = await moderateAction(guildId, { userId: member.id, action, ...extra });
      setStatus(res?.ok ? { ok: true, text: `${ACTION_LABEL[action]} für ${member.name} ausgeführt.` } : res);
      if (res?.ok) setDialog(null);
    });
  }

  const withInfractions = members.filter((m) => (infractionCounts[m.id] ?? 0) > 0).length;
  const timedOut = members.filter(isTimedOut).length;

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>{status.text}</div>
        </div>
      )}
      {status && !status.ok && (
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{status.error}</div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="label">
            <Users width={13} height={13} />
            Mitglieder
          </div>
          <div className="value">{members.length}</div>
          <div className="sub">{members.filter((m) => m.bot).length} davon Bots</div>
        </div>
        <div className="stat">
          <div className="label">
            <Gavel width={13} height={13} />
            Mit Verstößen
          </div>
          <div className="value">{withInfractions}</div>
          <div className="sub">in den letzten 100 Einträgen</div>
        </div>
        <div className={`stat${timedOut > 0 ? '' : ' off'}`}>
          <div className="label">
            <Clock width={13} height={13} />
            Stummgeschaltet
          </div>
          <div className="value">{timedOut}</div>
          <div className="sub">Timeout läuft gerade</div>
        </div>
      </div>

      {dialog && (
        <ActionDialog
          member={dialog.member}
          action={dialog.action}
          channels={channels}
          pending={pending}
          onCancel={() => setDialog(null)}
          onConfirm={(extra) => run(dialog.member, dialog.action, extra)}
        />
      )}

      <div className="card">
        <div className="card-head">
          <span className="icon">
            <Users width={17} height={17} />
          </span>
          <div>
            <h2>Mitglieder</h2>
            <p className="desc">
              Auffällige stehen oben. Maßnahmen werden im Verstoß- und Audit-Log festgehalten.
            </p>
          </div>
        </div>

        <div className="field">
          <input
            type="text"
            placeholder="Nach Name oder ID suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            <Users width={26} height={26} />
            {members.length === 0 ? 'Keine Mitglieder geladen.' : 'Kein Treffer.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mitglied</th>
                  <th>Beigetreten</th>
                  <th>Verstöße</th>
                  <th>Status</th>
                  <th>Maßnahme</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 100).map((m) => {
                  const count = infractionCounts[m.id] ?? 0;
                  const muted = isTimedOut(m);
                  return (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.avatar}
                            alt=""
                            width={26}
                            height={26}
                            style={{ borderRadius: '50%', flexShrink: 0 }}
                          />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block' }}>{m.name}</span>
                            <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                              {m.username ?? m.id}
                            </span>
                          </span>
                          {m.bot && <span className="badge">BOT</span>}
                        </span>
                      </td>
                      <td className="dim nowrap">{formatJoined(m.joinedAt)}</td>
                      <td>
                        {count > 0 ? (
                          <span className={`badge ${count >= 3 ? 'danger' : 'warn'}`}>{count}</span>
                        ) : (
                          <span className="dim">–</span>
                        )}
                      </td>
                      <td className="nowrap">
                        {muted ? (
                          <span className="badge warn">stumm</span>
                        ) : (
                          <span className="dim">–</span>
                        )}
                      </td>
                      <td className="nowrap">
                        {m.bot ? (
                          <span className="dim">–</span>
                        ) : (
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="ghost small"
                              onClick={() => setDialog({ member: m, action: 'warn' })}
                              disabled={pending}
                            >
                              Warnen
                            </button>
                            {muted ? (
                              <button
                                className="ghost small"
                                onClick={() => run(m, 'untimeout', { reason: 'Aufhebung' })}
                                disabled={pending}
                              >
                                Entstummen
                              </button>
                            ) : (
                              <button
                                className="ghost small"
                                onClick={() => setDialog({ member: m, action: 'timeout' })}
                                disabled={pending}
                              >
                                Timeout
                              </button>
                            )}
                            <button
                              className="ghost small"
                              onClick={() => setDialog({ member: m, action: 'kick' })}
                              disabled={pending}
                            >
                              Kick
                            </button>
                            <button
                              className="danger small"
                              onClick={() => setDialog({ member: m, action: 'ban' })}
                              disabled={pending}
                            >
                              Ban
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {shown.length > 100 && (
          <div className="notice info" style={{ marginTop: 14, marginBottom: 0 }}>
            <Shield width={15} height={15} />
            <div>
              {shown.length} Treffer, angezeigt werden die ersten 100. Grenz die Suche weiter ein.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
