import { api, ApiError } from '@/lib/api.js';
import { Alert } from '@/components/Icons.js';
import { YoutubeFeeds } from '@/components/YoutubeFeeds.js';
import { createYoutubeFeed, deleteYoutubeFeed, checkYoutubeNow } from '../actions.js';

export default async function YoutubePage({ params }) {
  const { guildId } = await params;
  try {
    const [feeds, meta] = await Promise.all([api.getYoutube(guildId), api.getMeta(guildId)]);
    return (
      <>
      <div className="page-head">
        <h1>YouTube</h1>
        <p>Neue Uploads automatisch ankündigen.</p>
      </div>
      <YoutubeFeeds
        guildId={guildId}
        feeds={feeds}
        channels={meta.channels}
        createAction={createYoutubeFeed}
        deleteAction={deleteYoutubeFeed}
        checkAction={checkYoutubeNow}
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
