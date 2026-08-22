'use client';

import { useState, useTransition } from 'react';
import { getPath, setPath, isFieldVisible } from '@allrounder/shared/settings-schema';
import { ICON_MAP, Shield, Check, Alert, Plus } from './Icons.js';

const ACTIONS = [
  { value: 'warn', label: 'Verwarnung' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'kick', label: 'Kick' },
  { value: 'ban', label: 'Ban' },
];

/** Liste freier Textwerte (Wortfilter, Domain-Whitelist). */
function StringList({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const items = value ?? [];

  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  }

  return (
    <>
      {items.length > 0 && (
        <div className="tags">
          {items.map((item) => (
            <span key={item} className="tag">
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                aria-label={`${item} entfernen`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="secondary shrink" onClick={add}>
          <Plus width={14} height={14} />
          Hinzufügen
        </button>
      </div>
    </>
  );
}

/** Mehrfachauswahl von Kanaelen - baugleich zur Rollenauswahl. */
function ChannelPicker({ value, onChange, channels }) {
  const selected = value ?? [];
  const available = channels.filter((c) => !selected.includes(c.id));

  return (
    <>
      {selected.length > 0 && (
        <div className="tags">
          {selected.map((id) => {
            const ch = channels.find((c) => c.id === id);
            return (
              <span key={id} className="tag">
                #{ch ? ch.name : `Unbekannt (${id})`}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((s) => s !== id))}
                  aria-label="Kanal entfernen"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <select value="" onChange={(e) => e.target.value && onChange([...selected, e.target.value])}>
        <option value="">Kanal hinzufügen…</option>
        {available.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
    </>
  );
}

/** Mehrfachauswahl von Rollen. */
function RolePicker({ value, onChange, roles }) {
  const selected = value ?? [];
  const available = roles.filter((r) => !selected.includes(r.id));

  return (
    <>
      {selected.length > 0 && (
        <div className="tags">
          {selected.map((id) => {
            const role = roles.find((r) => r.id === id);
            return (
              <span key={id} className="tag">
                {role && role.color > 0 && (
                  <span
                    className="dot"
                    style={{ background: `#${role.color.toString(16).padStart(6, '0')}` }}
                  />
                )}
                {role ? role.name : `Unbekannte Rolle (${id})`}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((s) => s !== id))}
                  aria-label="Rolle entfernen"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <select
        value=""
        onChange={(e) => e.target.value && onChange([...selected, e.target.value])}
      >
        <option value="">Rolle hinzufügen…</option>
        {available.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </>
  );
}

function EscalationEditor({ value, onChange }) {
  const steps = value ?? [];

  function update(i, patch) {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  return (
    <>
      {steps.map((step, i) => (
        <div key={i} className="escalation-step">
          <span className="step-num">{i + 1}</span>
          <span className="lbl">ab</span>
          <input
            type="number"
            min={1}
            value={step.at}
            onChange={(e) => update(i, { at: Number(e.target.value) })}
          />
          <span className="lbl">Verstößen</span>
          <select value={step.action} onChange={(e) => update(i, { action: e.target.value })}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {step.action === 'timeout' && (
            <>
              <input
                type="number"
                min={1}
                value={step.durationMinutes ?? 10}
                onChange={(e) => update(i, { durationMinutes: Number(e.target.value) })}
              />
              <span className="lbl">Min.</span>
            </>
          )}
          <button
            type="button"
            className="ghost small shrink"
            onClick={() => onChange(steps.filter((_, idx) => idx !== i))}
            aria-label="Stufe entfernen"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary small"
        onClick={() => onChange([...steps, { at: (steps.at(-1)?.at ?? 0) + 2, action: 'warn' }])}
      >
        <Plus width={14} height={14} />
        Stufe hinzufügen
      </button>
    </>
  );
}

/** Vorschau des Begrüßungstextes, damit man sieht was ankommt. */
function WelcomePreview({ template, guildName }) {
  const parts = String(template ?? '').split(/(\{user\}|\{username\}|\{server\}|\{count\})/g);
  return (
    <div className="preview">
      <span className="avatar">B</span>
      <div className="body">
      <div className="author">
        Discord Allrounder
        <span className="bot-tag">BOT</span>
      </div>
      <div>
        {parts.map((p, i) => {
          if (p === '{user}') return <span key={i} className="mention">@NeuesMitglied</span>;
          if (p === '{username}') return <span key={i}>NeuesMitglied</span>;
          if (p === '{server}') return <span key={i}>{guildName}</span>;
          if (p === '{count}') return <span key={i}>42</span>;
          return <span key={i}>{p}</span>;
        })}
      </div>
      </div>
    </div>
  );
}

function Field({ field, values, meta, onChange, guildName }) {
  const value = getPath(values, field.key);
  const set = (v) => onChange(setPath(values, field.key, v));

  if (!isFieldVisible(field, values)) return null;

  const help = field.help && <div className="help">{field.help}</div>;

  if (field.type === 'boolean') {
    return (
      <div className="field">
        <label className="switch">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
          <span className="switch-text">{field.label}</span>
        </label>
        {help}
      </div>
    );
  }

  return (
    <div className="field">
      <label>{field.label}</label>

      {field.type === 'text' && (
        <input type="text" value={value ?? ''} onChange={(e) => set(e.target.value)} />
      )}

      {field.type === 'number' && (
        <input
          type="number"
          min={field.min}
          max={field.max}
          value={value ?? ''}
          onChange={(e) => set(Number(e.target.value))}
        />
      )}

      {field.type === 'textarea' && (
        <>
          <textarea value={value ?? ''} onChange={(e) => set(e.target.value)} />
          {field.placeholders && (
            <div className="help">
              Platzhalter:{' '}
              {field.placeholders.map((p, i) => (
                <span key={p.token}>
                  {i > 0 && ', '}
                  <code>{p.token}</code> ({p.description})
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <WelcomePreview template={value} guildName={guildName} />
          </div>
        </>
      )}

      {field.type === 'channel' && (
        <select value={value ?? ''} onChange={(e) => set(e.target.value || null)}>
          <option value="">{field.optional ? '– keiner –' : 'Bitte wählen…'}</option>
          {meta.channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      )}

      {field.type === 'roles' && (
        <RolePicker value={value} onChange={set} roles={meta.roles} />
      )}

      {field.type === 'channels' && (
        <ChannelPicker value={value} onChange={set} channels={meta.channels} />
      )}

      {field.type === 'stringlist' && (
        <StringList value={value} onChange={set} placeholder={field.placeholder} />
      )}

      {field.type === 'escalation' && <EscalationEditor value={value} onChange={set} />}

      {help}
    </div>
  );
}

export function SettingsForm({ guildId, schema, initialSettings, meta, saveAction }) {
  const [values, setValues] = useState(initialSettings);
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(schema[0]?.key ?? null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initialSettings);

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveAction(guildId, values);
      setStatus(result);
    });
  }

  /** Hat dieser Abschnitt ungespeicherte Aenderungen? */
  const sectionDirty = (key) =>
    JSON.stringify(values[key]) !== JSON.stringify(initialSettings[key]);

  const shown = schema.filter((s) => s.key === active);

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>Gespeichert. Der Bot übernimmt die Änderung innerhalb weniger Sekunden.</div>
        </div>
      )}
      {status && !status.ok && (
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{status.error}</div>
        </div>
      )}

      {/* Unter-Reiter: sechs Abschnitte untereinander waeren zu viel Scrollerei.
          Der Zustand liegt gemeinsam in `values`, deshalb gehen Aenderungen
          beim Wechseln nicht verloren. */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {schema.map((section) => {
          const on = section.enabledBy
            ? Boolean((values[section.key] ?? {})[section.enabledBy])
            : true;
          const Ico = ICON_MAP[section.icon] ?? Shield;
          return (
            <a
              key={section.key}
              href="#"
              className={active === section.key ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                setActive(section.key);
              }}
            >
              <Ico width={15} height={15} />
              {section.title}
              {section.enabledBy && !on && (
                <span className="badge" style={{ fontSize: 10, padding: '0 6px' }}>
                  aus
                </span>
              )}
              {sectionDirty(section.key) && (
                <span
                  title="ungespeicherte Änderungen"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--warning)',
                    flexShrink: 0,
                  }}
                />
              )}
            </a>
          );
        })}
      </div>

      {shown.map((section) => {
        const sectionValues = values[section.key] ?? {};
        const sectionOn = section.enabledBy ? sectionValues[section.enabledBy] : true;

        return (
          <div key={section.key} className="card">
            <div className="card-head">
              <span className="icon">
                {(() => {
                  const Ico = ICON_MAP[section.icon] ?? Shield;
                  return <Ico width={17} height={17} />;
                })()}
              </span>
              <div>
                <h2>{section.title}</h2>
                {section.description && <p className="desc">{section.description}</p>}
              </div>
              <span className="spacer" />
              {section.enabledBy && (
                <span className={`badge ${sectionOn ? 'ok' : ''}`}>
                  {sectionOn ? 'Aktiv' : 'Aus'}
                </span>
              )}
            </div>

            {section.fields.map((field) => {
              // Ist der Hauptschalter aus, blenden wir alles ausser ihm aus.
              if (section.enabledBy && field.key !== section.enabledBy && !sectionOn) return null;
              return (
                <Field
                  key={field.key}
                  field={field}
                  values={sectionValues}
                  meta={meta}
                  guildName={meta.guild?.name ?? 'Dein Server'}
                  onChange={(next) => setValues({ ...values, [section.key]: next })}
                />
              );
            })}
          </div>
        );
      })}

      <div className="sticky-save">
        <button onClick={save} disabled={!dirty || pending}>
          {pending ? 'Speichere…' : 'Speichern'}
        </button>
        {dirty && !pending && (
          <span className="hint">
            {(() => {
              // Beim Speichern gehen alle Abschnitte gemeinsam raus - deshalb
              // hier benennen, welche betroffen sind.
              const geaendert = schema.filter((s) => sectionDirty(s.key));
              return geaendert.length === 1
                ? `Ungespeicherte Änderungen in „${geaendert[0].title}"`
                : `Ungespeicherte Änderungen in ${geaendert.length} Bereichen`;
            })()}
          </span>
        )}
      </div>
    </>
  );
}
