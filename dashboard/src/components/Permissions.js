'use client';

import { useState, useTransition } from 'react';
import { Shield, Check, Alert, Info, Hash } from './Icons.js';

const CHANNEL_TYPE = { TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, STAGE: 13, FORUM: 15 };

function channelPrefix(type) {
  if (type === CHANNEL_TYPE.VOICE || type === CHANNEL_TYPE.STAGE) return '🔊 ';
  if (type === CHANNEL_TYPE.CATEGORY) return '📁 ';
  return '#';
}

function formatTs(ts) {
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Bulk-Rechteänderung: Rechte einmal wählen, auf viele Kanäle anwenden.
 * Aus dem Konzept – statt jeden Kanal einzeln in Discord durchzuklicken.
 */
export function Permissions({
  guildId,
  roles,
  channels,
  presets,
  history,
  planAction,
  applyAction,
  undoAction,
}) {
  const [roleId, setRoleId] = useState('');
  const [preset, setPreset] = useState('write');
  const [picked, setPicked] = useState(new Set());
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
    setPlan(null); // Auswahl geändert – die Vorschau passt nicht mehr.
  };

  const selectAll = (type) => {
    const next = new Set(picked);
    for (const c of channels) if (type === null || c.type === type) next.add(c.id);
    setPicked(next);
    setPlan(null);
  };

  function preview() {
    setStatus(null);
    startTransition(async () => {
      const res = await planAction(guildId, { channelIds: [...picked], roleId, preset });
      if (res?.ok) setPlan(res);
      else setStatus(res);
    });
  }

  function apply() {
    setStatus(null);
    startTransition(async () => {
      const res = await applyAction(guildId, { channelIds: [...picked], roleId, preset });
      setStatus(res);
      if (res?.ok) {
        setPlan(null);
        setPicked(new Set());
      }
    });
  }

  const ready = roleId && picked.size > 0 && preset;
  const roleName = (id) => roles.find((r) => r.id === id)?.name ?? `Rolle ${id}`;

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>
            {status.applied?.length ?? 0} Kanal/Kanäle geändert
            {status.skipped > 0 && `, ${status.skipped} waren schon richtig`}
            {status.failed?.length > 0 && (
              <div style={{ marginTop: 6, color: 'var(--warning)' }}>
                Nicht geklappt bei: {status.failed.map((f) => f.name).join(', ')} – meist fehlt dem
                Bot dort die Berechtigung.
              </div>
            )}
            {status.restored && <>{status.restored.length} Kanal/Kanäle zurückgesetzt.</>}
          </div>
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
          <span className="icon">
            <Shield width={17} height={17} />
          </span>
          <div>
            <h2>Rechte auf mehrere Kanäle anwenden</h2>
            <p className="desc">
              Einmal einstellen statt jeden Kanal in Discord einzeln durchzuklicken.
            </p>
          </div>
        </div>

        <div className="field">
          <label>Rolle</label>
          <select
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setPlan(null);
            }}
          >
            <option value="">Bitte wählen…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Was soll gelten</label>
          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setPlan(null);
            }}
          >
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="help">{presets.find((p) => p.key === preset)?.description}</div>
        </div>

        <div className="field">
          <label>Kanäle ({picked.size} gewählt)</label>
          <div className="row" style={{ marginBottom: 8 }}>
            <button type="button" className="secondary small shrink" onClick={() => selectAll(null)}>
              Alle
            </button>
            <button
              type="button"
              className="secondary small shrink"
              onClick={() => selectAll(CHANNEL_TYPE.TEXT)}
            >
              Alle Textkanäle
            </button>
            <button
              type="button"
              className="secondary small shrink"
              onClick={() => selectAll(CHANNEL_TYPE.VOICE)}
            >
              Alle Sprachkanäle
            </button>
            <button
              type="button"
              className="ghost small shrink"
              onClick={() => {
                setPicked(new Set());
                setPlan(null);
              }}
            >
              Auswahl leeren
            </button>
            <span className="spacer" />
          </div>

          <div
            style={{
              maxHeight: 300,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 10,
            }}
          >
            {channels.map((c) => (
              <label key={c.id} className="switch" style={{ padding: '3px 0', fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={picked.has(c.id)}
                  onChange={() => toggle(c.id)}
                  style={{ width: 16, height: 16, borderRadius: 4 }}
                />
                <span className="switch-text">
                  {channelPrefix(c.type)}
                  {c.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="row">
          <button className="secondary" onClick={preview} disabled={!ready || pending}>
            {pending && !plan ? 'Prüfe…' : 'Vorschau'}
          </button>
          <span className="spacer" />
        </div>
      </div>

      {plan && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-head">
            <span className="icon">
              <Hash width={17} height={17} />
            </span>
            <div>
              <h2>Das würde passieren</h2>
              <p className="desc">
                „{plan.preset}" für <strong>{roleName(roleId)}</strong>
              </p>
            </div>
          </div>

          {plan.plan.every((p) => p.skip) ? (
            <div className="notice info" style={{ marginBottom: 16 }}>
              <Info width={15} height={15} />
              <div>Nichts zu tun – überall gilt das schon.</div>
            </div>
          ) : (
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Kanal</th>
                    <th>Änderung</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.plan.map((p) => (
                    <tr key={p.channelId}>
                      <td className="nowrap">
                        {channelPrefix(p.type)}
                        {p.name}
                      </td>
                      <td>
                        {p.skip ? (
                          <span className="dim">{p.reason ?? 'schon richtig'}</span>
                        ) : (
                          <span className="badge accent">{p.action}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="row">
            <button onClick={apply} disabled={pending || plan.plan.every((p) => p.skip)}>
              {pending ? 'Wende an…' : 'Jetzt anwenden'}
            </button>
            <button className="secondary shrink" onClick={() => setPlan(null)} disabled={pending}>
              Abbrechen
            </button>
            <span className="spacer" />
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="icon">
            <Info width={17} height={17} />
          </span>
          <div>
            <h2>Verlauf</h2>
            <p className="desc">
              Die letzten Änderungen – jede lässt sich zurücknehmen.
            </p>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="empty">
            <Info width={26} height={26} />
            Noch keine Rechteänderung über das Dashboard.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wann</th>
                  <th>Rolle</th>
                  <th>Was</th>
                  <th>Kanäle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="dim nowrap">{formatTs(h.created_at)}</td>
                    <td className="nowrap">{roleName(h.role_id)}</td>
                    <td className="nowrap">
                      <span className="badge">
                        {presets.find((p) => p.key === h.preset)?.label ?? h.preset}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                      {h.channels.slice(0, 3).join(', ')}
                      {h.channelCount > 3 && ` +${h.channelCount - 3}`}
                    </td>
                    <td>
                      <button
                        className="secondary small"
                        onClick={() => {
                          setStatus(null);
                          startTransition(async () => setStatus(await undoAction(guildId, h.id)));
                        }}
                        disabled={pending}
                      >
                        Zurücknehmen
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
