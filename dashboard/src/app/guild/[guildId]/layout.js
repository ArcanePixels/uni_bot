import { redirect } from 'next/navigation';
import { requireGuildAccess, AccessError } from '@/lib/guard.js';
import { api } from '@/lib/api.js';
import { TopBar } from '@/components/TopBar.js';
import { GuildTabs } from '@/components/GuildTabs.js';
import { getPluginList } from '@/lib/plugin-cache.js';
import { AccentStyle } from '@/components/AccentStyle.js';
import { Alert } from '@/components/Icons.js';

/**
 * Wacht ueber alle Unterseiten eines Servers. Die Pruefung laeuft hier
 * serverseitig bei jedem Aufruf - nicht nur einmal auf der Startseite.
 */
export default async function GuildLayout({ children, params }) {
  const { guildId } = await params;

  let session, guild;
  try {
    ({ session, guild } = await requireGuildAccess(guildId));
  } catch (err) {
    if (err instanceof AccessError && err.status === 401) redirect('/login');
    return (
      <div className="container">
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{err instanceof AccessError ? err.message : 'Zugriff nicht möglich.'}</div>
        </div>
        <a href="/" className="btn">
          Zurück zur Übersicht
        </a>
      </div>
    );
  }

  // Die Reiter der Plugins. Zwischengespeichert, weil das Layout bei jedem
  // Aufruf laeuft.
  const plugins = await getPluginList();

  // Akzentfarbe aus dem Server-Icon. Faellt das aus, bleibt die Markenfarbe -
  // deshalb bewusst ohne Fehlerbehandlung nach aussen.
  let accent = null;
  try {
    accent = (await api.getAccent(guildId))?.accent ?? null;
  } catch {
    accent = null;
  }

  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
    : null;

  return (
    <>
      <AccentStyle color={accent} />
      <TopBar user={session.user} guildName={guild.name} guildIcon={iconUrl} />
      <div className="container">
        <GuildTabs guildId={guildId} plugins={plugins} />
        {children}
      </div>
    </>
  );
}
