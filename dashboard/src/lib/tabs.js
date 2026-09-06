/**
 * Die Reiter des Dashboards, in Gruppen.
 *
 * Bewusst ohne React, damit sich die Einteilung direkt testen laesst - und
 * damit die Regel, wo ein Plugin landet, an einer Stelle steht.
 *
 * Vorher standen alle Reiter nebeneinander. Mit jedem Plugin wurde die Zeile
 * laenger, und auf dem Handy war sie nicht mehr benutzbar.
 */

/**
 * Die Gruppen des Grundsystems.
 *
 * `inhalte` ist die Gruppe, in der auch Plugins landen - dort passen
 * YouTube, Twitch und die Regeln thematisch zusammen.
 */
export const GRUPPEN = [
  {
    key: 'moderation',
    label: 'Moderation',
    icon: 'shield',
    tabs: [
      { slug: 'settings', label: 'Einstellungen', icon: 'shield' },
      { slug: 'mitglieder', label: 'Mitglieder', icon: 'users' },
      { slug: 'infractions', label: 'Verstöße', icon: 'gavel' },
      { slug: 'audit', label: 'Audit-Log', icon: 'list' },
    ],
  },
  {
    key: 'inhalte',
    label: 'Inhalte',
    icon: 'clock',
    tabs: [
      { slug: 'posts', label: 'Posts', icon: 'clock' },
      { slug: 'youtube', label: 'YouTube', icon: 'play' },
      { slug: 'befehle', label: 'Befehle', icon: 'hash' },
    ],
  },
  {
    key: 'server',
    label: 'Server',
    icon: 'plus',
    tabs: [
      { slug: 'wizard', label: 'Wizard', icon: 'wave' },
      { slug: 'rechte', label: 'Rechte', icon: 'shield' },
      { slug: 'funktionen', label: 'Funktionen', icon: 'plus' },
    ],
  },
];

/** Die Übersicht steht allein, sie ist der Einstieg. */
export const UEBERSICHT = { slug: '', label: 'Übersicht', icon: 'list' };

/**
 * Baut die vollstaendige Reiterliste.
 *
 * Plugins kommen in die Gruppe „Inhalte" - dort gehoeren sie fast immer hin
 * (Regeln, Twitch, YouTube-artiges). Ein Plugin kann das mit `group` in
 * seiner plugin.json aber selbst bestimmen.
 */
export function baueTabs(guildId, plugins = []) {
  const base = `/guild/${guildId}`;
  const href = (slug) => (slug ? `${base}/${slug}` : base);

  const gruppen = GRUPPEN.map((g) => ({
    ...g,
    tabs: g.tabs.map((t) => ({ ...t, href: href(t.slug) })),
  }));

  for (const p of plugins) {
    const ziel = gruppen.find((g) => g.key === p.group) ?? gruppen.find((g) => g.key === 'inhalte');
    ziel.tabs.push({
      slug: `p/${p.name}`,
      label: p.label,
      icon: p.icon ?? 'plug',
      href: `${base}/p/${p.name}`,
      istPlugin: true,
    });
  }

  // Innerhalb einer Gruppe alphabetisch. Sonst haengt die Reihenfolge davon
  // ab, wie die Plugin-Ordner gelesen wurden - und Verwandtes stand
  // auseinander: YouTube und Twitch tun dasselbe, standen aber getrennt,
  // weil "Befehle" dazwischenlag.
  for (const g of gruppen) {
    g.tabs.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }

  return { uebersicht: { ...UEBERSICHT, href: href('') }, gruppen };
}

/**
 * Welche Gruppe ist gerade offen?
 *
 * Damit die richtige Gruppe aufgeklappt ist, wenn jemand einen Link direkt
 * aufruft oder die Seite neu laedt.
 */
export function aktiveGruppe(pathname, gruppen) {
  for (const g of gruppen) {
    if (g.tabs.some((t) => t.href === pathname)) return g.key;
  }
  return null;
}

/** Ist dieser Reiter der aktuelle? */
export function istAktiv(href, pathname) {
  return href === pathname;
}
