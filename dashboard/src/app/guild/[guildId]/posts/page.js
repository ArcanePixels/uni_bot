import { api, ApiError } from '@/lib/api.js';
import { Alert } from '@/components/Icons.js';
import { ScheduledPosts } from '@/components/ScheduledPosts.js';
import { createScheduledPost, deleteScheduledPost } from '../actions.js';

export default async function PostsPage({ params }) {
  const { guildId } = await params;
  try {
    const [posts, meta] = await Promise.all([api.getScheduled(guildId), api.getMeta(guildId)]);
    return (
      <>
      <div className="page-head">
        <h1>Geplante Posts</h1>
        <p>Nachrichten, die der Bot automatisch sendet.</p>
      </div>
      <ScheduledPosts
        guildId={guildId}
        posts={posts}
        channels={meta.channels}
        createAction={createScheduledPost}
        deleteAction={deleteScheduledPost}
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
