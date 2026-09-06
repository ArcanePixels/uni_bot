import { api, ApiError } from '@/lib/api.js';
import { Members } from '@/components/Members.js';
import { Alert } from '@/components/Icons.js';
import { requireGuildAccess } from '@/lib/guard.js';
import { moderateMember } from '../actions.js';

export default async function MembersPage({ params }) {
  const { guildId } = await params;

  // Die eigene Discord-ID, damit die API erkennt, wer gerade zusieht - sonst
  // koennte man sich selbst bannen.
  const { session } = await requireGuildAccess(guildId);
  const actorId = session?.user?.id ?? '';

  let daten, meta, infractions;
  try {
    [daten, meta, infractions] = await Promise.all([
      api.getMembers(guildId, `?limit=1000&actorId=${encodeURIComponent(actorId)}`),
      api.getMeta(guildId),
      api.getInfractions(guildId, '?limit=200'),
    ]);
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.';
    return (
      <>
        <div className="page-head">
          <h1>Mitglieder</h1>
        </div>
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>
            {msg}
            {err?.status === 503 && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Für die Mitgliederliste braucht die API den Bot-Token. Prüfe, ob
                <code> DISCORD_TOKEN</code> in der <code>.env</code> steht und der
                API-Container danach neu gestartet wurde.
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // Verstöße je Mitglied zusammenzählen - zeigt Auffällige zuerst.
  const infractionCounts = infractions.reduce((acc, i) => {
    acc[i.user_id] = (acc[i.user_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="page-head">
        <h1>Mitglieder</h1>
        <p>Verwarnen, stummschalten, kicken oder bannen – direkt von hier aus.</p>
      </div>
      <Members
        guildId={guildId}
        members={daten.members}
        roles={daten.roles}
        channels={meta.channels}
        infractionCounts={infractionCounts}
        moderateAction={moderateMember}
      />
    </>
  );
}
