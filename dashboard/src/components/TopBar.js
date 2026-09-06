import { signOut } from '@/lib/auth.js';
import { Logo } from './Icons.js';

export function TopBar({ user, guildName = null, guildIcon = null }) {
  return (
    <header className="topbar">
      <div className="inner">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Logo width={20} height={20} />
          </span>
          ArcanePixels
        </a>

        {guildName && (
          <>
            <span className="crumb">/</span>
            <span className="crumb-name" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {guildIcon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guildIcon} alt="" width={20} height={20} style={{ borderRadius: 6 }} />
              )}
              {guildName}
            </span>
          </>
        )}

        <span className="spacer" />

        {user && (
          <>
            <span className="user-chip">
              {user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" width={22} height={22} />
              )}
              {user.name}
            </span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button type="submit" className="ghost small">
                Abmelden
              </button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
