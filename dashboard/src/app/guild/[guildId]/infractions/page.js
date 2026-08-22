import { api, ApiError } from '@/lib/api.js';
import { Alert } from '@/components/Icons.js';
import { Infractions } from '@/components/Infractions.js';
import { deleteInfraction } from '../actions.js';

export default async function InfractionsPage({ params }) {
  const { guildId } = await params;
  try {
    const entries = await api.getInfractions(guildId, '?limit=100');
    // Namen nachschlagen, damit keine rohen IDs dastehen. Schlaegt das fehl
    // (etwa ohne Bot-Token), bleiben die IDs - kein Grund, die Seite zu kippen.
    let names = {};
    try {
      names = await api.resolveMembers(guildId, [...new Set(entries.map((e) => e.user_id))]);
    } catch {
      names = {};
    }
    return (
      <>
      <div className="page-head">
        <h1>Verstöße</h1>
        <p>Was der Automod erfasst hat.</p>
      </div>
      <Infractions
        guildId={guildId}
        entries={entries}
        deleteAction={deleteInfraction}
        names={names}
      />
      </>
    );
  } catch (err) {
    return (
      <div className="notice error">
        <Alert width={15} height={15} />
        <div>{err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.'}</div>
      </div>
    );
  }
}
