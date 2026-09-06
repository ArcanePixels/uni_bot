'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { List, Plug, ICON_MAP } from './Icons.js';
import { baueTabs, aktiveGruppe, istAktiv } from '@/lib/tabs.js';

/**
 * Die Reiter, in Gruppen.
 *
 * Vorher standen alle nebeneinander. Mit jedem Plugin wurde die Zeile laenger,
 * und auf dem Handy war sie nicht mehr benutzbar. Jetzt gibt es vier
 * Einstiege; die Unterpunkte erscheinen darunter, sobald eine Gruppe offen ist.
 *
 * Welche Gruppe wo hingehoert, steht in `lib/tabs.js` - dort auch die Regel,
 * in welche Gruppe ein Plugin faellt.
 */
export function GuildTabs({ guildId, plugins = [] }) {
  const pathname = usePathname();
  const { uebersicht, gruppen } = baueTabs(guildId, plugins);

  // Die Gruppe, in der man gerade steht, ist offen. Klickt man eine andere an,
  // wechselt die Ansicht - ohne dass die Seite neu geladen wird.
  const offenAusPfad = aktiveGruppe(pathname, gruppen);
  const [offen, setOffen] = useState(null);
  const aktuelleGruppe = offen ?? offenAusPfad;

  const gezeigt = gruppen.find((g) => g.key === aktuelleGruppe);
  const symbol = (name) => ICON_MAP[name] ?? Plug;

  return (
    <>
      <nav className="tabs">
        <a
          href={uebersicht.href}
          className={istAktiv(uebersicht.href, pathname) ? 'active' : ''}
          onClick={() => setOffen(null)}
        >
          <List width={15} height={15} />
          {uebersicht.label}
        </a>

        {gruppen.map((g) => {
          const Icon = symbol(g.icon);
          const istOffen = g.key === aktuelleGruppe;
          // Steht man in dieser Gruppe, ist sie hervorgehoben - auch dann,
          // wenn die Uebersicht daneben liegt.
          return (
            <button
              key={g.key}
              type="button"
              className={`tab-group ${istOffen ? 'open' : ''}`}
              onClick={() => setOffen(istOffen ? null : g.key)}
              aria-expanded={istOffen}
            >
              <Icon width={15} height={15} />
              {g.label}
              <span className="caret" aria-hidden="true">
                {istOffen ? '▾' : '▸'}
              </span>
            </button>
          );
        })}
      </nav>

      {gezeigt && (
        <nav className="tabs sub">
          {gezeigt.tabs.map((t) => {
            const Icon = symbol(t.icon);
            return (
              <a key={t.slug} href={t.href} className={istAktiv(t.href, pathname) ? 'active' : ''}>
                <Icon width={14} height={14} />
                {t.label}
              </a>
            );
          })}
        </nav>
      )}
    </>
  );
}
