import { api, ApiError } from '@/lib/api.js';
import { Features } from '@/components/Features.js';
import { Alert } from '@/components/Icons.js';
import {
  createReactionPanel,
  deleteReactionPanel,
  createPoll,
  closePoll,
  createTicketPanel,
} from '../actions.js';

export default async function FeaturesPage({ params }) {
  const { guildId } = await params;

  let panels, polls, tickets, meta, settings;
  try {
    [panels, polls, tickets, meta, settings] = await Promise.all([
      api.getReactionRoles(guildId),
      api.getPolls(guildId),
      api.getTickets(guildId),
      api.getMeta(guildId),
      api.getSettings(guildId),
    ]);
  } catch (err) {
    return (
      <>
        <div className="page-head">
          <h1>Funktionen</h1>
        </div>
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.'}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Funktionen</h1>
        <p>Rollen zum Selbstvergeben, Umfragen und das Ticket-System.</p>
      </div>
      <Features
        guildId={guildId}
        panels={panels}
        polls={polls}
        tickets={tickets}
        channels={meta.channels}
        roles={meta.roles}
        ticketsEnabled={Boolean(settings.tickets?.enabled)}
        createPanelAction={createReactionPanel}
        deletePanelAction={deleteReactionPanel}
        createPollAction={createPoll}
        closePollAction={closePoll}
        createTicketPanelAction={createTicketPanel}
      />
    </>
  );
}
