import { api, ApiError } from '@/lib/api.js';
import { List, Alert } from '@/components/Icons.js';

// Rohe Aktionsnamen in lesbare Sätze übersetzen.
const ACTION = {
  'automod.warn': { label: 'Automod: Verwarnung', tone: '' },
  'automod.timeout': { label: 'Automod: Timeout', tone: 'warn' },
  'automod.kick': { label: 'Automod: Kick', tone: 'danger' },
  'automod.ban': { label: 'Automod: Ban', tone: 'danger' },
  'welcome.autorole': { label: 'Rolle beim Beitritt vergeben', tone: 'ok' },
  'scheduler.post': { label: 'Geplanter Post gesendet', tone: '' },
  // Von Hand aus dem Dashboard ausgeloest.
  'mod.warn': { label: 'Verwarnung (von Hand)', tone: '' },
  'mod.timeout': { label: 'Timeout (von Hand)', tone: 'warn' },
  'mod.untimeout': { label: 'Timeout aufgehoben', tone: 'ok' },
  'mod.kick': { label: 'Kick (von Hand)', tone: 'danger' },
  'mod.ban': { label: 'Ban (von Hand)', tone: 'danger' },
  'mod.unban': { label: 'Ban aufgehoben', tone: 'ok' },
};

const ACTOR = { automod: 'Automod', scheduler: 'Scheduler', bot: 'Bot' };

function formatTs(ts) {
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
}

export default async function AuditPage({ params }) {
  const { guildId } = await params;

  let entries;
  try {
    entries = await api.getAudit(guildId, '?limit=100');
  } catch (err) {
    return (
      <div className="notice error">
        <Alert width={15} height={15} />
        <div>{err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.'}</div>
      </div>
    );
  }

  // Betroffene und Ausloeser mit Namen zeigen, soweit auffindbar.
  let names = {};
  try {
    const ids = entries.flatMap((e) => [e.target, e.actor_id]).filter((v) => /^\d{15,}$/.test(v));
    names = await api.resolveMembers(guildId, [...new Set(ids)]);
  } catch {
    names = {};
  }

  return (
    <>
      <div className="page-head">
        <h1>Audit-Log</h1>
        <p>Wer hat wann was ausgelöst. Die letzten 100 Ereignisse.</p>
      </div>

      <div className="card">
        {entries.length === 0 ? (
          <div className="empty">
            <List width={26} height={26} />
            Noch keine Ereignisse aufgezeichnet.
            <div style={{ marginTop: 6 }}>
              Sobald der Bot etwas tut – eine Verwarnung, eine Rolle, ein Post – steht es hier.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Auslöser</th>
                  <th>Ereignis</th>
                  <th>Betrifft</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const meta = ACTION[e.action];
                  return (
                    <tr key={e.id}>
                      <td className="dim nowrap">{formatTs(e.created_at)}</td>
                      <td className="nowrap">
                        {ACTOR[e.actor_id] ??
                          (names[e.actor_id]?.name ?? <code>{e.actor_id}</code>)}
                      </td>
                      <td className="nowrap">
                        {meta ? (
                          <span className={`badge ${meta.tone}`}>{meta.label}</span>
                        ) : (
                          <code>{e.action}</code>
                        )}
                      </td>
                      <td className="nowrap">
                        {e.target
                          ? (names[e.target]?.name ?? <code>{e.target}</code>)
                          : '–'}
                      </td>
                      <td className="dim">{e.detail ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
