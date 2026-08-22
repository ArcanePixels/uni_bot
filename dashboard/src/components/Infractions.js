'use client';

import { useState, useTransition } from 'react';
import { Gavel, Check, Alert, Users } from './Icons.js';

const ACTION_LABEL = {
  warn: 'Verwarnung',
  timeout: 'Timeout',
  kick: 'Kick',
  ban: 'Ban',
};

const ACTION_TONE = { warn: '', timeout: 'warn', kick: 'danger', ban: 'danger' };

const RULE_LABEL = {
  wortfilter: 'Wortfilter',
  spam: 'Spam',
  link: 'Link',
};

function formatTs(ts) {
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function Infractions({ guildId, entries, deleteAction, names = {} }) {
  const [status, setStatus] = useState(null);
  const [filter, setFilter] = useState('');
  const [onlyRepeat, setOnlyRepeat] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(id) {
    setStatus(null);
    startTransition(async () => setStatus(await deleteAction(guildId, id)));
  }

  // Wie oft ist wer auffaellig geworden - zeigt Wiederholungstaeter.
  const counts = entries.reduce((acc, e) => {
    acc[e.user_id] = (acc[e.user_id] ?? 0) + 1;
    return acc;
  }, {});
  const repeatCount = Object.values(counts).filter((n) => n > 1).length;

  let shown = entries;
  if (filter.trim()) {
    const q = filter.trim().toLowerCase();
    shown = shown.filter(
      (e) => e.user_id.includes(q) || (names[e.user_id]?.name ?? '').toLowerCase().includes(q),
    );
  }
  if (onlyRepeat) shown = shown.filter((e) => counts[e.user_id] > 1);

  const byRule = entries.reduce((acc, e) => {
    acc[e.rule] = (acc[e.rule] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>Gelöscht. Der Verstoß zählt für die Eskalation nicht mehr mit.</div>
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
            <Gavel width={13} height={13} />
            Erfasst
          </div>
          <div className="value">{entries.length}</div>
          <div className="sub">die letzten 100</div>
        </div>
        <div className="stat">
          <div className="label">
            <Users width={13} height={13} />
            Wiederholungstäter
          </div>
          <div className="value">{repeatCount}</div>
          <div className="sub">mehr als ein Verstoß</div>
        </div>
        {Object.entries(byRule).map(([rule, n]) => (
          <div key={rule} className="stat">
            <div className="label">{RULE_LABEL[rule] ?? rule}</div>
            <div className="value">{n}</div>
            <div className="sub">
              {Math.round((n / entries.length) * 100)}% aller Verstöße
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="icon">
            <Gavel width={17} height={17} />
          </span>
          <div>
            <h2>Verstöße</h2>
            <p className="desc">
              Ein gelöschter Verstoß zählt für die Eskalation nicht mehr mit.
            </p>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="row" style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Nach Name oder ID filtern…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {repeatCount > 0 && (
              <label className="switch shrink">
                <input
                  type="checkbox"
                  checked={onlyRepeat}
                  onChange={(e) => setOnlyRepeat(e.target.checked)}
                />
                <span className="switch-text">Nur Wiederholungstäter</span>
              </label>
            )}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="empty">
            <Check width={26} height={26} />
            {entries.length === 0
              ? 'Noch keine Verstöße erfasst.'
              : 'Kein Treffer für diesen Filter.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Mitglied</th>
                  <th>Regel</th>
                  <th>Maßnahme</th>
                  <th>Grund</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td className="dim nowrap">{formatTs(e.created_at)}</td>
                    <td className="nowrap">
                      {names[e.user_id] ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={names[e.user_id].avatar}
                            alt=""
                            width={22}
                            height={22}
                            style={{ borderRadius: '50%' }}
                          />
                          {names[e.user_id].name}
                        </span>
                      ) : (
                        <code title="Mitglied nicht mehr auf dem Server">{e.user_id}</code>
                      )}
                      {counts[e.user_id] > 1 && (
                        <span className="badge warn" style={{ marginLeft: 6 }}>
                          {counts[e.user_id]}×
                        </span>
                      )}
                    </td>
                    <td className="nowrap">{RULE_LABEL[e.rule] ?? e.rule}</td>
                    <td className="nowrap">
                      <span className={`badge ${ACTION_TONE[e.action] ?? ''}`}>
                        {ACTION_LABEL[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="dim" style={{ maxWidth: 220 }}>
                      {e.reason ?? '–'}
                    </td>
                    <td>
                      <button
                        className="danger small"
                        onClick={() => remove(e.id)}
                        disabled={pending}
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
