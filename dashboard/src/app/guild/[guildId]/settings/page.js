import { api, ApiError } from '@/lib/api.js';
import { Alert } from '@/components/Icons.js';
import { SettingsForm } from '@/components/SettingsForm.js';
import { DatenLoeschen } from '@/components/DatenLoeschen.js';
import { checkConsistency, checkPlausibility } from '@/lib/consistency.js';
import { saveSettings, loescheGuildDaten } from '../actions.js';

export default async function SettingsPage({ params }) {
  const { guildId } = await params;

  let schema, settings, meta;
  // Was fuer diesen Server gespeichert ist - nur fuer die Anzeige im
  // Loeschbereich. Faellt es aus, laedt die Seite trotzdem.
  let daten = null;
  try {
    // Parallel laden - drei Roundtrips nacheinander waeren spuerbar langsamer.
    [schema, settings, meta] = await Promise.all([
      api.getSchema(),
      api.getSettings(guildId),
      api.getMeta(guildId),
    ]);
    daten = await api.getGuildDaten(guildId).catch(() => null);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.';
    return (
      <div className="notice error">
        {message}
        {err?.status === 503 && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            Läuft der Bot-Container? Prüfe mit <code>docker compose ps</code>.
          </div>
        )}
      </div>
    );
  }

  const issues = [
    ...checkConsistency({ settings, channels: meta.channels, roles: meta.roles }),
    ...checkPlausibility({ settings, channels: meta.channels }),
  ];

  return (
    <>
      <div className="page-head">
        <h1>Einstellungen</h1>
        <p>Automod und Willkommensnachricht für diesen Server.</p>
      </div>

      {issues.length > 0 && (
        <div className={`notice ${issues.some((i) => i.severity === 'error') ? 'error' : 'warning'}`}>
          <Alert width={15} height={15} />
          <div>
            <strong>Prüf das bitte:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {issues.map((i, n) => (
                <li key={n} style={{ marginBottom: 4 }}>
                  <strong>{i.where}</strong> – {i.message}
                  <div style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>{i.hint}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <SettingsForm
        guildId={guildId}
        schema={schema}
        initialSettings={settings}
        meta={meta}
        saveAction={saveSettings}
      />

      <DatenLoeschen
        guildId={guildId}
        guildName={meta?.guild?.name}
        daten={daten}
        loeschenAction={loescheGuildDaten}
      />
    </>
  );
}
