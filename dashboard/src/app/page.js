import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth.js';
import { fetchUserGuilds, AccessError } from '@/lib/guard.js';
import { manageableGuilds } from '@/lib/permissions.js';
import { TopBar } from '@/components/TopBar.js';
import { Alert, Users } from '@/components/Icons.js';

export default async function HomePage() {
  const session = await auth();
  // Wer nicht angemeldet ist, sieht zuerst, worum es ueberhaupt geht -
  // frueher landete man direkt auf einer Login-Karte mit einem Satz.
  if (!session?.user || session.error === 'RefreshFailed') redirect('/willkommen');

  let guilds = null;
  let error = null;
  try {
    guilds = manageableGuilds(await fetchUserGuilds(session.accessToken));
  } catch (err) {
    // Ein Discord-Ausfall soll eine verstaendliche Meldung geben, keinen 500.
    error = err instanceof AccessError ? err.message : 'Unerwarteter Fehler beim Laden.';
  }

  return (
    <>
      <TopBar user={session.user} />
      <div className="container">
        <div className="page-head">
          <h1>Deine Server</h1>
          <p>
            {error
              ? 'Server konnten nicht geladen werden.'
              : `${guilds.length} Server, auf denen du verwalten darfst.`}
          </p>
        </div>

        {error && (
          <div className="notice error">
            <Alert width={15} height={15} />
            <div>{error}</div>
          </div>
        )}

        {!error && guilds.length === 0 && (
          <div className="card">
            <div className="empty">
              <Users width={26} height={26} />
              Auf keinem deiner Server hast du Administrator-Rechte oder „Server verwalten“.
              <div style={{ marginTop: 6 }}>
                Falls du hier einen Server erwartest: Prüfe deine Rolle dort, und melde dich
                danach einmal ab und wieder an.
              </div>
            </div>
          </div>
        )}

        {!error && guilds.length > 0 && (
          <div className="guild-grid">
            {guilds.map((g) => (
              <a key={g.id} href={`/guild/${g.id}`} className="guild-card">
                <span className="guild-icon">
                  {g.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`}
                      alt=""
                      width={42}
                      height={42}
                    />
                  ) : (
                    g.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="name" style={{ display: 'block' }}>
                    {g.name}
                  </span>
                  <span className="role">{g.owner ? 'Inhaber' : 'Administrator'}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
