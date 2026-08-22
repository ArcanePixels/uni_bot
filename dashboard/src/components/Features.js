'use client';

import { useState, useTransition } from 'react';
import { Users, Check, Alert, Plus, Info, Hash } from './Icons.js';

const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function formatTs(ts) {
  if (!ts) return '–';
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

/** Ein Eintrag im Reaction-Role-Panel: Emoji + Rolle. */
function OptionRow({ option, roles, onChange, onRemove }) {
  return (
    <div className="escalation-step">
      <input
        type="text"
        value={option.emoji}
        onChange={(e) => onChange({ ...option, emoji: e.target.value })}
        placeholder="🎮"
        style={{ width: 70, flex: '0 0 auto', textAlign: 'center' }}
      />
      <select
        value={option.roleId}
        onChange={(e) => onChange({ ...option, roleId: e.target.value })}
      >
        <option value="">Rolle wählen…</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={option.label ?? ''}
        onChange={(e) => onChange({ ...option, label: e.target.value })}
        placeholder="Beschriftung (optional)"
        style={{ flex: 1, minWidth: 130 }}
      />
      <button type="button" className="ghost small shrink" onClick={onRemove} aria-label="Entfernen">
        ×
      </button>
    </div>
  );
}

function ReactionRoleForm({ channels, roles, onCreate, pending }) {
  const [title, setTitle] = useState('Wähle deine Rollen');
  const [description, setDescription] = useState('');
  const [channelId, setChannelId] = useState('');
  const [mode, setMode] = useState('multi');
  const [options, setOptions] = useState([{ emoji: '🎮', roleId: '', label: '' }]);

  const valid =
    channelId && title.trim() && options.length > 0 && options.every((o) => o.emoji && o.roleId);

  return (
    <div className="card">
      <div className="card-head">
        <span className="icon">
          <Plus width={17} height={17} />
        </span>
        <div>
          <h2>Neues Rollen-Panel</h2>
          <p className="desc">
            Der Bot postet eine Nachricht mit Emojis. Wer draufklickt, bekommt die Rolle.
          </p>
        </div>
      </div>

      <div className="field">
        <label>Kanal</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="">Bitte wählen…</option>
          {channels.map((c) => (
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

      <div className="field">
        <label>Beschreibung (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Erklärender Text unter der Überschrift"
        />
      </div>

      <div className="field">
        <label>Auswahlverhalten</label>
        <div className="row">
          <label className="switch shrink">
            <input
              type="radio"
              checked={mode === 'multi'}
              onChange={() => setMode('multi')}
            />
            <span className="switch-text">Beliebig viele Rollen</span>
          </label>
          <label className="switch shrink">
            <input
              type="radio"
              checked={mode === 'single'}
              onChange={() => setMode('single')}
            />
            <span className="switch-text">Nur eine Rolle</span>
          </label>
          <span className="spacer" />
        </div>
        {mode === 'single' && (
          <div className="help">
            Wählt jemand eine andere, wird die vorherige automatisch entfernt.
          </div>
        )}
      </div>

      <div className="field">
        <label>Emoji und Rolle</label>
        {options.map((o, i) => (
          <OptionRow
            key={i}
            option={o}
            roles={roles}
            onChange={(next) => setOptions(options.map((x, ix) => (ix === i ? next : x)))}
            onRemove={() => setOptions(options.filter((_, ix) => ix !== i))}
          />
        ))}
        <button
          type="button"
          className="secondary small"
          onClick={() => setOptions([...options, { emoji: '', roleId: '', label: '' }])}
          disabled={options.length >= 20}
        >
          <Plus width={14} height={14} />
          Weitere Rolle
        </button>
        <div className="help">
          Eigene Server-Emojis funktionieren, wenn der Bot Zugriff darauf hat. Höchstens 20
          Einträge je Panel.
        </div>
      </div>

      <button
        onClick={() =>
          onCreate({ channelId, title, description: description.trim() || null, mode, options })
        }
        disabled={!valid || pending}
      >
        {pending ? 'Erstelle…' : 'Panel posten'}
      </button>
    </div>
  );
}

function PollForm({ channels, onCreate, pending }) {
  const [channelId, setChannelId] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [closesAt, setClosesAt] = useState('');

  const clean = options.map((o) => o.trim()).filter(Boolean);
  const valid = channelId && question.trim() && clean.length >= 2;

  return (
    <div className="card">
      <div className="card-head">
        <span className="icon">
          <Plus width={17} height={17} />
        </span>
        <div>
          <h2>Neue Umfrage</h2>
          <p className="desc">Abstimmung mit Balkenanzeige, die sich live aktualisiert.</p>
        </div>
      </div>

      <div className="field">
        <label>Kanal</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="">Bitte wählen…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Frage</label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Worüber soll abgestimmt werden?"
        />
      </div>

      <div className="field">
        <label>Antwortmöglichkeiten</label>
        {options.map((o, i) => (
          <div key={i} className="row" style={{ marginBottom: 7 }}>
            <span
              className="shrink"
              style={{ display: 'grid', placeItems: 'center', width: 26, fontSize: 16 }}
            >
              {NUMBER_EMOJI[i]}
            </span>
            <input
              type="text"
              value={o}
              onChange={(e) => setOptions(options.map((x, ix) => (ix === i ? e.target.value : x)))}
              placeholder={`Antwort ${i + 1}`}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="ghost small shrink"
                onClick={() => setOptions(options.filter((_, ix) => ix !== i))}
                aria-label="Entfernen"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="secondary small"
          onClick={() => setOptions([...options, ''])}
          disabled={options.length >= 10}
        >
          <Plus width={14} height={14} />
          Weitere Antwort
        </button>
        <div className="help">Zwei bis zehn Antworten.</div>
      </div>

      <div className="field">
        <label className="switch">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          <span className="switch-text">Mehrfachauswahl erlauben</span>
        </label>
      </div>

      <div className="field">
        <label>Automatisch beenden am (optional)</label>
        <input
          type="datetime-local"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
        />
      </div>

      <button
        onClick={() =>
          onCreate({
            channelId,
            question,
            options: clean,
            multi,
            closesAt: closesAt ? Math.floor(new Date(closesAt).getTime() / 1000) : null,
          })
        }
        disabled={!valid || pending}
      >
        {pending ? 'Erstelle…' : 'Umfrage starten'}
      </button>
    </div>
  );
}

export function Features({
  guildId,
  panels,
  polls,
  tickets,
  channels,
  roles,
  ticketsEnabled,
  createPanelAction,
  deletePanelAction,
  createPollAction,
  closePollAction,
  createTicketPanelAction,
}) {
  const [tab, setTab] = useState('roles');
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();
  const [ticketChannel, setTicketChannel] = useState('');

  const run = (fn, ...args) => {
    setStatus(null);
    startTransition(async () => setStatus(await fn(guildId, ...args)));
  };

  const channelName = (id) => channels.find((c) => c.id === id)?.name ?? `Unbekannt (${id})`;
  const roleName = (id) => roles.find((r) => r.id === id)?.name ?? `Rolle ${id}`;

  return (
    <>
      {status?.ok && (
        <div className="notice success">
          <Check width={15} height={15} />
          <div>Erledigt.</div>
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
          ['roles', 'Reaction Roles'],
          ['polls', 'Umfragen'],
          ['tickets', 'Tickets'],
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

      {tab === 'roles' && (
        <>
          <ReactionRoleForm
            channels={channels}
            roles={roles}
            pending={pending}
            onCreate={(payload) => run(createPanelAction, payload)}
          />

          <div className="card">
            <div className="card-head">
              <span className="icon">
                <Users width={17} height={17} />
              </span>
              <div>
                <h2>Bestehende Panels</h2>
                <p className="desc">
                  {panels.length === 0 ? 'Noch keins angelegt.' : `${panels.length} Panel${panels.length === 1 ? '' : 's'}.`}
                </p>
              </div>
            </div>

            {panels.length === 0 ? (
              <div className="empty">
                <Users width={26} height={26} />
                Noch kein Rollen-Panel angelegt.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Überschrift</th>
                      <th>Kanal</th>
                      <th>Rollen</th>
                      <th>Modus</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {panels.map((p) => (
                      <tr key={p.id}>
                        <td>{p.title}</td>
                        <td className="nowrap">#{channelName(p.channel_id)}</td>
                        <td>
                          <span className="tags" style={{ marginBottom: 0 }}>
                            {p.options.map((o) => (
                              <span key={o.id} className="tag">
                                {o.emoji} {roleName(o.role_id)}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="nowrap">
                          <span className="badge">
                            {p.mode === 'single' ? 'nur eine' : 'mehrere'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="danger small"
                            onClick={() => run(deletePanelAction, p.id)}
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

            {panels.length > 0 && (
              <div className="notice info" style={{ marginTop: 14, marginBottom: 0 }}>
                <Info width={15} height={15} />
                <div>
                  Löschen entfernt nur die Verknüpfung – die Nachricht bleibt in Discord stehen.
                  Lösch sie dort von Hand, sonst klicken Mitglieder ins Leere.
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'polls' && (
        <>
          <PollForm
            channels={channels}
            pending={pending}
            onCreate={(payload) => run(createPollAction, payload)}
          />

          <div className="card">
            <div className="card-head">
              <span className="icon">
                <Hash width={17} height={17} />
              </span>
              <div>
                <h2>Umfragen</h2>
                <p className="desc">
                  {polls.length === 0 ? 'Noch keine gestartet.' : `${polls.length} insgesamt.`}
                </p>
              </div>
            </div>

            {polls.length === 0 ? (
              <div className="empty">
                <Hash width={26} height={26} />
                Noch keine Umfrage gestartet.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Frage</th>
                      <th>Kanal</th>
                      <th>Stimmen</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {polls.map((p) => {
                      const total = p.counts.reduce((a, b) => a + b, 0);
                      const leader = p.counts.indexOf(Math.max(...p.counts));
                      return (
                        <tr key={p.id}>
                          <td>
                            {p.question}
                            {total > 0 && (
                              <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                                vorn: {p.options[leader]} ({p.counts[leader]})
                              </div>
                            )}
                          </td>
                          <td className="nowrap">#{channelName(p.channel_id)}</td>
                          <td>{total}</td>
                          <td className="nowrap">
                            {p.closed ? (
                              <span className="badge">beendet</span>
                            ) : (
                              <span className="badge ok">läuft</span>
                            )}
                          </td>
                          <td>
                            {!p.closed && (
                              <button
                                className="secondary small"
                                onClick={() => run(closePollAction, p.id)}
                                disabled={pending}
                              >
                                Beenden
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'tickets' && (
        <>
          {!ticketsEnabled && (
            <div className="notice warning">
              <Alert width={15} height={15} />
              <div>
                Das Ticket-System ist ausgeschaltet. Schalte es in den{' '}
                <a href={`/guild/${guildId}/settings`}>Einstellungen</a> ein, sonst passiert beim
                Klick auf das Emoji nichts.
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <span className="icon">
                <Plus width={17} height={17} />
              </span>
              <div>
                <h2>Eröffnungsnachricht anlegen</h2>
                <p className="desc">
                  Der Bot postet eine Nachricht mit 🎫. Wer draufklickt, bekommt einen privaten
                  Kanal.
                </p>
              </div>
            </div>

            <div className="field">
              <label>Kanal</label>
              <select value={ticketChannel} onChange={(e) => setTicketChannel(e.target.value)}>
                <option value="">Bitte wählen…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => run(createTicketPanelAction, { channelId: ticketChannel })}
              disabled={!ticketChannel || pending}
            >
              {pending ? 'Erstelle…' : 'Nachricht posten'}
            </button>

            <div className="notice info" style={{ marginTop: 16, marginBottom: 0 }}>
              <Info width={15} height={15} />
              <div>
                Die ID der Nachricht wird automatisch in den Einstellungen hinterlegt. Legst du
                eine neue an, gilt nur noch die neueste.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="icon">
                <Users width={17} height={17} />
              </span>
              <div>
                <h2>Tickets</h2>
                <p className="desc">
                  {tickets.filter((t) => t.status === 'offen').length} offen,{' '}
                  {tickets.length} insgesamt.
                </p>
              </div>
            </div>

            {tickets.length === 0 ? (
              <div className="empty">
                <Users width={26} height={26} />
                Noch keine Tickets.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Geöffnet</th>
                      <th>Von</th>
                      <th>Kanal</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t.id}>
                        <td className="dim nowrap">{formatTs(t.created_at)}</td>
                        <td className="nowrap">
                          <code>{t.user_id}</code>
                        </td>
                        <td className="nowrap">#{channelName(t.channel_id)}</td>
                        <td className="nowrap">
                          <span className={`badge ${t.status === 'offen' ? 'ok' : ''}`}>
                            {t.status}
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
    </>
  );
}
