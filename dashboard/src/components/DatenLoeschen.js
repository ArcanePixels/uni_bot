'use client';

import { useState, useTransition } from 'react';
import { Alert, Trash, Check } from './Icons.js';

/**
 * Alle Daten eines Servers loeschen.
 *
 * Bewusst umstaendlich: Man muss die Server-ID abtippen. Ein Knopf allein
 * waere hier zu wenig - das Geloeschte ist unwiederbringlich, und ein
 * Fehlklick trifft alles auf einmal.
 *
 * Der Bereich steht am Ende der Einstellungen und ist als Gefahrenbereich
 * gekennzeichnet, damit niemand versehentlich hineingerät.
 */
export function DatenLoeschen({ guildId, guildName, daten, loeschenAction }) {
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [status, setStatus] = useState(null);
  const [laeuft, starte] = useTransition();

  const passt = eingabe.trim() === guildId;
  const eintraege = daten?.gesamt ?? 0;

  const loeschen = () => {
    starte(async () => {
      const r = await loeschenAction(guildId, eingabe.trim());
      setStatus(
        r?.ok
          ? { ok: true, text: `${r.entfernt ?? 0} Einträge gelöscht.` }
          : { ok: false, text: r?.error ?? 'Löschen fehlgeschlagen.' },
      );
      if (r?.ok) {
        setOffen(false);
        setEingabe('');
      }
    });
  };

  return (
    <section className="card gefahr">
      <h2>Alle Daten dieses Servers löschen</h2>

      <p>
        Entfernt alles, was der Bot zu <strong>{guildName ?? 'diesem Server'}</strong> gespeichert
        hat: Einstellungen, Verstöße, geplante Posts, Regeln, Tickets, Panels und den
        Nachrichten-Log.
      </p>

      {eintraege > 0 ? (
        <p className="help">
          Betroffen sind derzeit <strong>{eintraege}</strong> Einträge
          {daten?.tabellen && Object.keys(daten.tabellen).length > 0 && (
            <> in {Object.keys(daten.tabellen).length} Bereichen</>
          )}
          .
        </p>
      ) : (
        <p className="help">Für diesen Server ist derzeit nichts gespeichert.</p>
      )}

      <div className="notice error">
        <Alert width={15} height={15} />
        <div>
          <strong>Das lässt sich nicht rückgängig machen.</strong>
          <p className="help">
            Der Bot bleibt auf dem Server – nur die Daten verschwinden. Willst du ihn ganz
            loswerden, entferne ihn danach in Discord unter Servereinstellungen → Mitglieder.
          </p>
        </div>
      </div>

      {!offen ? (
        <button className="danger" onClick={() => setOffen(true)} disabled={eintraege === 0}>
          <Trash width={14} height={14} /> Daten löschen
        </button>
      ) : (
        <div className="loeschen-bestaetigung">
          <label htmlFor="loesch-id">
            Tippe zur Bestätigung die Server-ID ab: <code>{guildId}</code>
          </label>
          <input
            id="loesch-id"
            type="text"
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder="Server-ID"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="row">
            <button className="danger" onClick={loeschen} disabled={!passt || laeuft}>
              {laeuft ? 'Löscht…' : 'Endgültig löschen'}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setOffen(false);
                setEingabe('');
              }}
              disabled={laeuft}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {status && (
        <p className={status.ok ? 'saved-hint' : 'error-hint'}>
          {status.ok && <Check width={14} height={14} />} {status.text}
        </p>
      )}
    </section>
  );
}
