'use client';

import { usePathname } from 'next/navigation';
import { List, Shield, Clock, Play, Gavel, Users, Plus, Wave, Plug, ICON_MAP } from './Icons.js';

/**
 * Die festen Reiter des Grundsystems. Plugins kommen als `plugins` dazu -
 * die stehen nicht hier, weil sie erst zur Laufzeit bekannt sind.
 */
const TABS = [
  { slug: '', label: 'Übersicht', icon: List },
  { slug: 'settings', label: 'Einstellungen', icon: Shield },
  { slug: 'posts', label: 'Posts', icon: Clock },
  { slug: 'youtube', label: 'YouTube', icon: Play },
  { slug: 'wizard', label: 'Wizard', icon: Wave },
  { slug: 'rechte', label: 'Rechte', icon: Shield },
  { slug: 'funktionen', label: 'Funktionen', icon: Plus },
  { slug: 'mitglieder', label: 'Mitglieder', icon: Users },
  { slug: 'infractions', label: 'Verstöße', icon: Gavel },
  { slug: 'befehle', label: 'Befehle', icon: Clock },
  { slug: 'audit', label: 'Audit-Log', icon: List },
];

export function GuildTabs({ guildId, plugins = [] }) {
  const pathname = usePathname();
  const base = `/guild/${guildId}`;

  // Plugin-Reiter kommen hinter denen des Grundsystems, in der Reihenfolge, in
  // der die Ordner gefunden wurden.
  const alle = [
    ...TABS.map((t) => ({ ...t, href: t.slug ? `${base}/${t.slug}` : base })),
    ...plugins.map((p) => ({
      slug: `p/${p.name}`,
      label: p.label,
      // Das Plugin darf sich ein Symbol aus dem Bestand aussuchen.
      icon: ICON_MAP[p.icon] ?? Plug,
      href: `${base}/p/${p.name}`,
    })),
  ];

  return (
    <nav className="tabs">
      {alle.map((t) => {
        const Icon = t.icon;
        return (
          <a key={t.slug} href={t.href} className={pathname === t.href ? 'active' : ''}>
            <Icon width={15} height={15} />
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
