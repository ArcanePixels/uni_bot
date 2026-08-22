import { api, ApiError } from '@/lib/api.js';
import { buildOverview } from '@/lib/overview.js';
import { checkConsistency, checkPlausibility } from '@/lib/consistency.js';
import { Overview } from '@/components/Overview.js';
import { Alert } from '@/components/Icons.js';

export default async function OverviewPage({ params }) {
  const { guildId } = await params;

  let settings, infractions, scheduled, feeds, meta;
  try {
    [settings, infractions, scheduled, feeds, meta] = await Promise.all([
      api.getSettings(guildId),
      api.getInfractions(guildId, '?limit=200'),
      api.getScheduled(guildId),
      api.getYoutube(guildId),
      api.getMeta(guildId),
    ]);
  } catch (err) {
    return (
      <div className="notice error">
        <Alert width={15} height={15} />
        <div>
          {err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.'}
          {err?.status === 503 && (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              Läuft der Bot-Container? Prüfe mit <code>docker compose ps</code>.
            </div>
          )}
        </div>
      </div>
    );
  }

  const data = buildOverview({ settings, infractions, scheduled, feeds });

  // Verknüpfungen prüfen, die ins Leere zeigen oder vertauscht wirken.
  const issues = [
    ...checkConsistency({
      settings,
      channels: meta.channels,
      roles: meta.roles,
      scheduled,
      feeds,
    }),
    ...checkPlausibility({ settings, channels: meta.channels }),
  ];

  // Nur den Spitzenreiter aufloesen - mehr braucht die Uebersicht nicht.
  let names = {};
  if (data.topOffender) {
    try {
      names = await api.resolveMembers(guildId, [data.topOffender[0]]);
    } catch {
      names = {};
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Übersicht</h1>
        <p>Was der Bot auf {meta.guild?.name ?? 'diesem Server'} gerade tut.</p>
      </div>
      <Overview
        guildId={guildId}
        data={data}
        guildName={meta.guild?.name}
        channels={meta.channels}
        nowSec={Math.floor(Date.now() / 1000)}
        names={names}
        issues={issues}
      />
    </>
  );
}
