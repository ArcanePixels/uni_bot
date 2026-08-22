'use client';

import { usePathname } from 'next/navigation';
import { List, Shield, Clock, Play, Gavel, Users, Plus, Wave } from './Icons.js';

/**
 * Die Reiter. Ein neuer Bereich kommt hier als ein Eintrag dazu - passend zum
 * Plugin-Gedanken des Bots.
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

export function GuildTabs({ guildId }) {
  const pathname = usePathname();
  const base = `/guild/${guildId}`;

  return (
    <nav className="tabs">
      {TABS.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const Icon = t.icon;
        return (
          <a key={t.slug} href={href} className={pathname === href ? 'active' : ''}>
            <Icon width={15} height={15} />
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
