'use client';

import { useState, useTransition, useMemo } from 'react';
import { Users, Check, Alert, Plus, Info, Hash, Shield } from './Icons.js';

const CHANNEL_TYPE = { TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, STAGE: 13, FORUM: 15 };

function channelPrefix(type) {
  if (type === CHANNEL_TYPE.VOICE || type === CHANNEL_TYPE.STAGE) return '🔊 ';
  if (type === CHANNEL_TYPE.CATEGORY) return '📁 ';
  return '#';
}

/**
 * Live-Vorschau: zeigt, welche Kanäle ein Mitglied nach dem Klick sieht.
 * Genau der Punkt aus dem Konzept – man erkennt vor dem Schalten, was passiert.
 */
function Preview({ groups, selected, channels }) {
  const visible = useMemo(() => {
    const ids = new Set();
    for (const g of groups) {
      if (!selected.has(g.id)) continue;
      for (const id of g.channelIds) ids.add(id);
    }
    return channels.filter((c) => ids.has(c.id));
  }, [groups, selected, channels]);

  const emptyGroups = groups.filter((g) => selected.has(g.id) && g.channelIds.length === 0);

  return (
    <div className="card" style={{ background: 'var(--bg-elevated)' }}>
      <div className="card-head">
        <span className="icon">
          <Hash width={17} height={17} />
        </span>
        <div>
          <h2>Vorschau</h2>
          <p className="desc">
            So sieht die Kanalliste für ein Mitglied aus, das genau diese Symbole angeklickt hat.
          </p>
        </div>
      </div>

      {selected.size === 0 ? (
        <div className="empty">
          <Hash width={26} height={26} />
          Klick oben auf ein Symbol, um zu sehen, was es freischaltet.
        </div>
      ) : visible.length === 0 ? (
        <div className="notice warning" style={{ marginBottom: 0 }}>
          <Alert width={15} height={15} />
          <div>
            Für die gewählten Symbole ist noch kein Kanal hinterlegt – beim Klick würde nichts
            passieren.
          </div>
        </div>
      ) : (
        <>
          <div className="tags" style={{ marginBottom: 12 }}>
            {visible.map((c) => (
              <span key={c.id} className="tag">
                {channelPrefix(c.type)}
                {c.name}
              </span>
            ))}
          </div>
          {emptyGroups.length > 0 && (
            <div className="notice warning" style={{ marginBottom: 0 }}>
              <Alert width={15} height={15} />
              <div>
                Ohne Wirkung: {emptyGroups.map((g) => `${g.emoji} ${g.label}`).join(', ')} – dort
                ist kein Kanal hinterlegt.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GroupForm({ roles, channels, presets, initial, onSave, onCancel, pending }) {
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [roleId, setRoleId] = useState(initial?.role_id ?? '');
  const [preset, setPreset] = useState(initial?.preset ?? 'write');
  const [picked, setPicked] = useState(new Set(initial?.channelIds ?? []));

  const toggle = (id) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const valid = emoji.trim() && label.trim() && roleId;

  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div className="card-head">
        <span className="icon">
          <Plus width={17} height={17} />
        </span>
        <div>
          <h2>{initial ? 'Gruppe bearbeiten' : 'Neue Interessens-Gruppe'}</h2>
          <p className="desc">Ein Symbol, eine Rolle und die Kanäle, die es freischaltet.</p>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 18 }}>
        <div className="shrink" style={{ width: 90 }}>
          <label style={{ display: 'block', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
            Symbol
          </label>
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🎮"
            style={{ textAlign: 'center', fontSize: 18 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
            Beschriftung
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Games"
          />
        </div>
      </div>

      <div className="field">
        <label>Rolle</label>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Bitte wählen…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="help">
          Diese Rolle bekommt, wer das Symbol anklickt. Leg sie vorher in Discord an.
        </div>
      </div>

      <div className="field">
        <label>Zugriff auf die Kanäle</label>
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {presets
            .filter((p) => p.key !== 'reset')
            .map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
        </select>
        <div className="help">
          {presets.find((p) => p.key === preset)?.description}
        </div>
      </div>

      <div className="field">
        <label>Kanäle ({picked.size} gewählt)</label>
        <div
          style={{
            maxHeight: 260,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 10,
          }}
        >
          {channels.map((c) => (
            <label
              key={c.id}
              className="switch"
              style={{ padding: '3px 0', fontSize: 13.5 }}
            >
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
        <div className="help">
          Bei einer Kategorie erben die enthaltenen Kanäle das Recht automatisch – oft reicht es,
          nur die Kategorie zu wählen.
        </div>
      </div>

      <div className="row">
        <button
          onClick={() =>
            onSave({ emoji: emoji.trim(), label: label.trim(), roleId, preset, channelIds: [...picked] })
          }
          disabled={!valid || pending}
        >
          {pending ? 'Speichere…' : 'Speichern'}
        </button>
        <button className="secondary shrink" onClick={onCancel} disabled={pending}>
          Abbrechen
        </button>
        <span className="spacer" />
      </div>
    </div>
  );
}

export function Wizard({
  guildId,
  groups,
  roles,
  channels,
  presets,
  createAction,
  updateAction,
  deleteAction,
  publishAction,
}) {
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(null); // null | 'new' | Gruppe
  const [selected, setSelected] = useState(new Set());
  const [publishChannel, setPublishChannel] = useState('');
  const [title, setTitle] = useState('Wähle deine Interessen');

  const run = (fn, ...args) => {
    setStatus(null);
    startTransition(async () => {
      const res = await fn(guildId, ...args);
      setStatus(res);
      if (res?.ok) setForm(null);
    });
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const roleName = (id) => roles.find((r) => r.id === id)?.name ?? `Rolle ${id}`;
  const channelName = (id) => channels.find((c) => c.id === id)?.name ?? id;
  const withoutChannels = groups.filter((g) => g.channelIds.length === 0);

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>
            {status.messageId
              ? 'Panel gepostet und Rechte gesetzt.'
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

      {withoutChannels.length > 0 && (
        <div className="notice warning">
          <Alert width={15} height={15} />
          <div>
            Ohne hinterlegte Kanäle bewirkt ein Klick nichts:{' '}
            {withoutChannels.map((g) => `${g.emoji} ${g.label}`).join(', ')}
          </div>
        </div>
      )}

      {form && (
        <GroupForm
          roles={roles}
          channels={channels}
          presets={presets}
          initial={form === 'new' ? null : form}
          pending={pending}
          onCancel={() => setForm(null)}
          onSave={(payload) =>
            form === 'new' ? run(createAction, payload) : run(updateAction, form.id, payload)
          }
        />
      )}

      <div className="card">
        <div className="card-head">
          <span className="icon">
            <Users width={17} height={17} />
          </span>
          <div>
            <h2>Interessens-Gruppen</h2>
            <p className="desc">
              {groups.length === 0
                ? 'Noch keine angelegt.'
                : `${groups.length} Gruppe${groups.length === 1 ? '' : 'n'}. Klick auf ein Symbol für die Vorschau.`}
            </p>
          </div>
          <span className="spacer" />
          {!form && (
            <button className="secondary small" onClick={() => setForm('new')}>
              <Plus width={14} height={14} />
              Neu
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="empty">
            <Users width={26} height={26} />
            Noch keine Interessens-Gruppe angelegt.
            <div style={{ marginTop: 6 }}>
              Leg pro Thema eine an – Games, Fotografie, was auf deinem Server passt.
            </div>
          </div>
        ) : (
          <>
            <div className="tags" style={{ marginBottom: 16, gap: 8 }}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={selected.has(g.id) ? '' : 'secondary'}
                  onClick={() => toggleSelect(g.id)}
                  style={{ fontSize: 14 }}
                >
                  <span style={{ fontSize: 16 }}>{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Rolle</th>
                    <th>Kanäle</th>
                    <th>Zugriff</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id}>
                      <td className="nowrap">
                        <span style={{ fontSize: 16, marginRight: 7 }}>{g.emoji}</span>
                        {g.label}
                      </td>
                      <td className="nowrap">{roleName(g.role_id)}</td>
                      <td>
                        {g.channelIds.length === 0 ? (
                          <span className="badge warn">keine</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                            {g.channelIds.slice(0, 3).map(channelName).join(', ')}
                            {g.channelIds.length > 3 && ` +${g.channelIds.length - 3}`}
                          </span>
                        )}
                      </td>
                      <td className="nowrap">
                        <span className="badge">
                          {presets.find((p) => p.key === g.preset)?.label ?? g.preset}
                        </span>
                      </td>
                      <td className="nowrap">
                        <span style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="ghost small"
                            onClick={() => setForm(g)}
                            disabled={pending}
                          >
                            Bearbeiten
                          </button>
                          <button
                            className="danger small"
                            onClick={() => run(deleteAction, g.id)}
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
          </>
        )}
      </div>

      {groups.length > 0 && <Preview groups={groups} selected={selected} channels={channels} />}

      {groups.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="icon">
              <Shield width={17} height={17} />
            </span>
            <div>
              <h2>Live schalten</h2>
              <p className="desc">
                Setzt die Kanalrechte für alle Gruppen und postet danach das Auswahl-Panel.
              </p>
            </div>
          </div>

          <div className="field">
            <label>Panel-Kanal</label>
            <select value={publishChannel} onChange={(e) => setPublishChannel(e.target.value)}>
              <option value="">Bitte wählen…</option>
              {channels
                .filter((c) => c.type === CHANNEL_TYPE.TEXT || c.type === CHANNEL_TYPE.ANNOUNCEMENT)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label>Überschrift</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="notice warning">
            <Alert width={15} height={15} />
            <div>
              Der Bot ändert dabei echte Kanalrechte auf deinem Server. Der vorherige Zustand wird
              gesichert – unter <strong>Rechte</strong> lässt sich das zurücknehmen.
            </div>
          </div>

          <button
            onClick={() => run(publishAction, { channelId: publishChannel, title })}
            disabled={!publishChannel || pending}
          >
            {pending ? 'Schalte live…' : 'Rechte setzen und Panel posten'}
          </button>

          <div className="notice info" style={{ marginTop: 16, marginBottom: 0 }}>
            <Info width={15} height={15} />
            <div>
              Die Klicks verarbeitet dasselbe Reaction-Roles-Plugin – das Panel taucht danach auch
              unter <strong>Funktionen</strong> auf.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
