'use client';

import { useState, useTransition } from 'react';
import { Alert, Plus, Trash, Check, Info } from './Icons.js';
import {
  startwerte,
  zeilenText,
  istVoll,
  kannSchieben,
  farbwert,
  darstellbareAbschnitte,
  darstellbareFelder,
} from '@/lib/plugin-ui.js';

/**
 * Baut die Seite eines Plugins aus seinem Manifest.
 *
 * Der Kern des Plugin-Systems auf Dashboard-Seite: Ein Plugin liefert keinen
 * React-Code, sondern eine Beschreibung. Next.js kompiliert seine Seiten beim
 * Bauen - Code aus einem Plugin-Ordner koennte also nur nach einem Neubau
 * erscheinen. Die Bausteine hier sind fest eingebaut, das Plugin waehlt nur aus.
 *
 * Damit gilt: Ordner nach `plugins/` kopieren, neu starten, Reiter ist da.
 */

/** Ein einzelnes Eingabefeld nach seiner Beschreibung im Manifest. */
function Feld({ feld, wert, onChange, channels = [], roles = [] }) {
  const id = `f_${feld.key}`;
  const gemeinsam = {
    id,
    name: feld.key,
    value: wert ?? '',
    onChange: (e) => onChange(feld.key, e.target.value),
  };

  let eingabe;
  switch (feld.type) {
    case 'textarea':
      eingabe = <textarea {...gemeinsam} rows={feld.rows ?? 3} placeholder={feld.placeholder} />;
      break;
    case 'number':
      eingabe = (
        <input
          type="number"
          {...gemeinsam}
          min={feld.min}
          max={feld.max}
          placeholder={feld.placeholder}
        />
      );
      break;
    case 'boolean':
      eingabe = (
        <label className="switch">
          <input
            type="checkbox"
            id={id}
            checked={wert === 1 || wert === true || wert === 'true'}
            onChange={(e) => onChange(feld.key, e.target.checked)}
          />
          <span>{feld.label}</span>
        </label>
      );
      break;
    case 'select':
      eingabe = (
        <select {...gemeinsam}>
          <option value="">– bitte wählen –</option>
          {(feld.options ?? []).map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'channel':
      eingabe = (
        <select {...gemeinsam}>
          <option value="">– kein Kanal –</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      );
      break;
    case 'role':
      eingabe = (
        <select {...gemeinsam}>
          <option value="">– keine Rolle –</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      );
      break;
    case 'color':
      eingabe = (
        <div className="color-row">
          <input
            type="color"
            value={farbwert(wert)}
            onChange={(e) => onChange(feld.key, e.target.value)}
          />
          <input type="text" {...gemeinsam} placeholder="#5865f2" spellCheck={false} />
        </div>
      );
      break;
    default:
      eingabe = (
        <input type="text" {...gemeinsam} placeholder={feld.placeholder} maxLength={feld.maxLength} />
      );
  }

  // Beim Schalter steht die Beschriftung schon daneben.
  if (feld.type === 'boolean') {
    return (
      <div className="field">
        {eingabe}
        {feld.help && <p className="help">{feld.help}</p>}
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {feld.label}
        {feld.required && <span className="req"> *</span>}
      </label>
      {eingabe}
      {feld.help && <p className="help">{feld.help}</p>}
    </div>
  );
}

/**
 * Zeigt, ob der Bot im gewaehlten Kanal darf, was das Plugin braucht.
 *
 * Ohne das merkt man erst am ausbleibenden Post, dass ein Recht fehlt - und
 * Discord meldet dann nur "Missing Permissions", ohne zu sagen welches.
 */
function RechteAnzeige({ eintrag }) {
  if (!eintrag) return null;

  const namen = (eintrag.fehlend ?? []).map((f) => f.label);

  if (eintrag.status === 'kein-kanal') {
    return (
      <p className="help">
        Der Bot braucht in dem Kanal: {benoetigtText(eintrag.benoetigt)}. Sobald du einen wählst
        und speicherst, wird hier geprüft, ob die Rechte gesetzt sind.
      </p>
    );
  }

  if (eintrag.status === 'kanal-weg') {
    return (
      <div className="notice error">
        <Alert width={15} height={15} />
        <div>Der gewählte Kanal existiert nicht mehr. Wähl einen anderen.</div>
      </div>
    );
  }

  if (eintrag.status === 'ok') {
    return (
      <p className="saved-hint">
        <Check width={14} height={14} /> Rechte in #{eintrag.channelName} vollständig
        {eintrag.admin ? ' (der Bot ist Administrator)' : ''}.
      </p>
    );
  }

  return (
    <div className="notice error">
      <Alert width={15} height={15} />
      <div>
        <strong>
          Dem Bot fehlt in #{eintrag.channelName}: {namen.join(', ')}
        </strong>
        <p className="help">
          Discord → Kanal bearbeiten → Berechtigungen → Rolle des Bots. Achte auf
          kanalspezifische Überschreibungen: Der Bot kann serverweit alles dürfen und trotzdem
          hier blockiert sein.
        </p>
      </div>
    </div>
  );
}

/** Die gebrauchten Rechte im Klartext. */
function benoetigtText(keys) {
  const namen = {
    VIEW_CHANNEL: 'Kanal ansehen',
    SEND_MESSAGES: 'Nachrichten senden',
    EMBED_LINKS: 'Links einbetten',
    ATTACH_FILES: 'Dateien anhängen',
    READ_MESSAGE_HISTORY: 'Nachrichtenverlauf anzeigen',
    ADD_REACTIONS: 'Reaktionen hinzufügen',
    MANAGE_MESSAGES: 'Nachrichten verwalten',
  };
  return (keys ?? []).map((k) => namen[k] ?? k).join(', ');
}

/** Ein Formular-Abschnitt: Einstellungen, die einmal je Server gelten. */
function FormAbschnitt({ abschnitt, config, guildId, plugin, meta, rechte, onSave }) {
  const felder = darstellbareFelder(abschnitt.fields);
  const [werte, setWerte] = useState(() => startwerte(felder, config));
  const [meldung, setMeldung] = useState(null);
  const [laeuft, starte] = useTransition();

  const aendern = (key, wert) => {
    setWerte((v) => ({ ...v, [key]: wert }));
    setMeldung(null);
  };

  const speichern = () => {
    starte(async () => {
      const r = await onSave(guildId, plugin, werte);
      setMeldung(r.ok ? { art: 'ok', text: 'Gespeichert.' } : { art: 'error', text: r.error });
    });
  };

  return (
    <section className="card">
      {abschnitt.title && <h2>{abschnitt.title}</h2>}
      {abschnitt.description && <p className="empty">{abschnitt.description}</p>}

      <div className="field-grid">
        {felder.map((f) => (
          <div key={f.key} className="field-wrap">
            <Feld
              feld={f}
              wert={werte[f.key]}
              onChange={aendern}
              channels={meta?.channels ?? []}
              roles={meta?.roles ?? []}
            />
            {/* Der Status gehoert direkt unter das Kanal-Feld, nicht ans
                Seitenende - sonst sucht man den Zusammenhang. */}
            <RechteAnzeige eintrag={(rechte ?? []).find((r) => r.key === f.key)} />
          </div>
        ))}
      </div>

      <div className="row">
        <button onClick={speichern} disabled={laeuft}>
          {laeuft ? 'Speichert…' : 'Speichern'}
        </button>
        {meldung && (
          <span className={meldung.art === 'ok' ? 'saved-hint' : 'error-hint'}>
            {meldung.art === 'ok' && <Check width={14} height={14} />} {meldung.text}
          </span>
        )}
      </div>
    </section>
  );
}

/** Ein Listen-Abschnitt: mehrere Eintraege, sortierbar. */
function ListenAbschnitt({
  abschnitt,
  items,
  guildId,
  plugin,
  meta,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
}) {
  const [neu, setNeu] = useState({});
  const [bearbeitet, setBearbeitet] = useState(null); // id des Eintrags in Bearbeitung
  const [entwurf, setEntwurf] = useState({});
  const [fehler, setFehler] = useState(null);
  const [laeuft, starte] = useTransition();

  const felder = darstellbareFelder(abschnitt.fields);
  const voll = istVoll(abschnitt, items.length);

  const anlegen = () => {
    starte(async () => {
      const r = await onAdd(guildId, plugin, abschnitt.key, neu);
      if (r.ok) {
        setNeu({});
        setFehler(null);
      } else setFehler(r.error);
    });
  };

  const speichern = (id) => {
    starte(async () => {
      const r = await onUpdate(guildId, plugin, abschnitt.key, id, entwurf);
      if (r.ok) {
        setBearbeitet(null);
        setFehler(null);
      } else setFehler(r.error);
    });
  };

  const loeschen = (id) => {
    starte(async () => {
      const r = await onDelete(guildId, plugin, abschnitt.key, id);
      if (!r.ok) setFehler(r.error);
    });
  };

  const schieben = (id, richtung) => {
    starte(async () => {
      const r = await onMove(guildId, plugin, abschnitt.key, id, richtung);
      if (!r.ok) setFehler(r.error);
    });
  };

  return (
    <section className="card">
      {abschnitt.title && <h2>{abschnitt.title}</h2>}
      {abschnitt.description && <p className="empty">{abschnitt.description}</p>}

      {fehler && (
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{fehler}</div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty">Noch nichts angelegt.</p>
      ) : (
        <ol className="plugin-list">
          {items.map((item, i) => {
            const zeile = zeilenText(abschnitt, item);
            return (
            <li key={item.id}>
              {bearbeitet === item.id ? (
                <div className="plugin-list-edit">
                  <div className="field-grid">
                    {felder.map((f) => (
                      <Feld
                        key={f.key}
                        feld={f}
                        wert={entwurf[f.key]}
                        onChange={(k, v) => setEntwurf((e) => ({ ...e, [k]: v }))}
                        channels={meta?.channels ?? []}
                        roles={meta?.roles ?? []}
                      />
                    ))}
                  </div>
                  <div className="row">
                    <button
                      className="btn primary"
                      onClick={() => speichern(item.id)}
                      disabled={laeuft}
                    >
                      Übernehmen
                    </button>
                    <button className="secondary" onClick={() => setBearbeitet(null)}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="plugin-list-row">
                  <span className="pos">{i + 1}.</span>
                  <div className="grow">
                    <strong>
                      {zeile.icon ? `${zeile.icon} ` : ''}
                      {zeile.titel}
                    </strong>
                    {zeile.zusatz.map((t, k) => (
                      <p key={k} className="help">
                        {t}
                      </p>
                    ))}
                  </div>
                  <div className="actions">
                    <button
                      className="btn icon"
                      title="Nach oben"
                      onClick={() => schieben(item.id, 'up')}
                      disabled={laeuft || !kannSchieben(i, items.length, 'up')}
                    >
                      ↑
                    </button>
                    <button
                      className="btn icon"
                      title="Nach unten"
                      onClick={() => schieben(item.id, 'down')}
                      disabled={laeuft || !kannSchieben(i, items.length, 'down')}
                    >
                      ↓
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        setBearbeitet(item.id);
                        setEntwurf(startwerte(felder, item));
                      }}
                    >
                      Ändern
                    </button>
                    <button
                      className="btn danger icon"
                      title="Löschen"
                      onClick={() => loeschen(item.id)}
                      disabled={laeuft}
                    >
                      <Trash width={14} height={14} />
                    </button>
                  </div>
                </div>
              )}
            </li>
            );
          })}
        </ol>
      )}

      <div className="plugin-add">
        <h3>Neuer Eintrag</h3>
        {voll ? (
          <p className="empty">
            Die Obergrenze von {abschnitt.max} Einträgen ist erreicht.
          </p>
        ) : (
          <>
            <div className="field-grid">
              {felder.map((f) => (
                <Feld
                  key={f.key}
                  feld={f}
                  wert={neu[f.key]}
                  onChange={(k, v) => setNeu((n) => ({ ...n, [k]: v }))}
                  channels={meta?.channels ?? []}
                  roles={meta?.roles ?? []}
                />
              ))}
            </div>
            <button onClick={anlegen} disabled={laeuft}>
              <Plus width={14} height={14} /> Hinzufügen
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Was der Bot beim letzten Durchlauf gemacht hat.
 *
 * Ohne das sagt die Oberflaeche nur "Erledigt" - das heisst aber nur, dass der
 * Auftrag notiert wurde. Ob in Discord etwas passiert ist, weiss nur der Bot.
 */
function LetzterLauf({ lauf }) {
  if (!lauf?.ergebnis) return null;

  const text = lauf.ergebnis;
  // Alles, was nicht nach Erfolg aussieht, ist einer Warnung wert.
  const geklappt = /^(gepostet|aktualisiert)/i.test(text);
  const zeit = new Date(lauf.zeit * 1000).toLocaleString('de-DE');

  if (geklappt) {
    return (
      <p className="saved-hint">
        <Check width={14} height={14} /> Bot: {text} ({zeit})
      </p>
    );
  }
  return (
    <div className="notice error">
      <Alert width={15} height={15} />
      <div>
        <strong>Der Bot konnte nicht posten: {text}</strong>
        <p className="help">Zuletzt versucht: {zeit}</p>
      </div>
    </div>
  );
}

/** Die Aktionsknoepfe. */
function AktionsAbschnitt({ abschnitt, guildId, plugin, letzterLauf, onAction }) {
  const [meldung, setMeldung] = useState(null);
  const [laeuft, starte] = useTransition();

  const ausloesen = (key) => {
    starte(async () => {
      const r = await onAction(guildId, plugin, key);
      // Bewusst nicht "Erledigt": Die API hat den Auftrag nur notiert. Ob der
      // Bot posten konnte, steht ein paar Sekunden spaeter unten.
      setMeldung(
        r.ok
          ? { art: 'ok', text: 'An den Bot übergeben – das Ergebnis steht in wenigen Sekunden hier.' }
          : { art: 'error', text: r.error },
      );
    });
  };

  return (
    <section className="card">
      {abschnitt.title && <h2>{abschnitt.title}</h2>}
      {/* Als Hinweiskasten, nicht als grauer Fliesstext: Hier steht, dass der
          Bot von selbst postet - wer das ueberliest, drueckt unnoetig und
          rechnet mit einem zweiten Post. */}
      {abschnitt.description && (
        <div className="notice">
          <Info width={15} height={15} />
          <div>{abschnitt.description}</div>
        </div>
      )}
      <div className="row wrap">
        {abschnitt.actions.map((a) => (
          <div key={a.key} className="action-item">
            <button
              className={a.style === 'primary' ? undefined : 'secondary'}
              onClick={() => ausloesen(a.key)}
              disabled={laeuft}
            >
              {laeuft ? 'Läuft…' : a.label}
            </button>
            {a.help && <p className="help">{a.help}</p>}
          </div>
        ))}
      </div>
      {meldung && (
        <p className={meldung.art === 'ok' ? 'saved-hint' : 'error-hint'}>
          {meldung.art === 'ok' && <Check width={14} height={14} />} {meldung.text}
        </p>
      )}
      <LetzterLauf lauf={letzterLauf} />
    </section>
  );
}

export function PluginPage({
  manifest,
  guildId,
  config,
  lists,
  meta,
  rechte,
  letzterLauf,
  actions,
}) {
  return (
    <>
      {darstellbareAbschnitte(manifest.ui).map((abschnitt, i) => {
        if (abschnitt.type === 'form') {
          return (
            <FormAbschnitt
              key={i}
              abschnitt={abschnitt}
              config={config}
              guildId={guildId}
              plugin={manifest.name}
              meta={meta}
              rechte={rechte}
              onSave={actions.saveConfig}
            />
          );
        }
        if (abschnitt.type === 'list') {
          return (
            <ListenAbschnitt
              key={i}
              abschnitt={abschnitt}
              items={lists?.[abschnitt.key] ?? []}
              guildId={guildId}
              plugin={manifest.name}
              meta={meta}
              onAdd={actions.addItem}
              onUpdate={actions.updateItem}
              onDelete={actions.deleteItem}
              onMove={actions.moveItem}
            />
          );
        }
        if (abschnitt.type === 'actions') {
          return (
            <AktionsAbschnitt
              key={i}
              abschnitt={abschnitt}
              guildId={guildId}
              plugin={manifest.name}
              letzterLauf={letzterLauf}
              onAction={actions.runAction}
            />
          );
        }
        return null;
      })}
    </>
  );
}
