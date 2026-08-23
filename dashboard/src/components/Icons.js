/**
 * Schlanke Inline-Icons. Bewusst ohne Icon-Bibliothek - das waeren mehrere
 * hundert Kilobyte fuer eine Handvoll Symbole.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const Shield = (p) => (
  <svg {...base} {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const Wave = (p) => (
  <svg {...base} {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </svg>
);

export const Clock = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Play = (p) => (
  <svg {...base} {...p}>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12s0-3.2-.4-4.8z" />
    <path d="M10 15l5-3-5-3z" />
  </svg>
);

export const Gavel = (p) => (
  <svg {...base} {...p}>
    <path d="M14 13l-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10" />
    <path d="M15 6l3 3M12 9l6-6 3 3-6 6z" />
    <path d="M9 21h11" />
  </svg>
);

export const List = (p) => (
  <svg {...base} {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

export const Check = (p) => (
  <svg {...base} {...p}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const Alert = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

export const Info = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

export const Plus = (p) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Users = (p) => (
  <svg {...base} {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const Hash = (p) => (
  <svg {...base} {...p}>
    <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
  </svg>
);

export const Discord = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} {...p}>
    <path d="M20.3 4.5A19 19 0 0 0 15.6 3l-.2.4a13 13 0 0 1 4.1 2 15.6 15.6 0 0 0-13.2 0 13 13 0 0 1 4.1-2L10.2 3a19 19 0 0 0-4.7 1.5C2.5 9 1.7 13.4 2.1 17.7a19 19 0 0 0 5.7 2.9l1.2-1.9c-.8-.3-1.5-.7-2.2-1.1l.5-.4a13.6 13.6 0 0 0 11.6 0l.5.4c-.7.4-1.4.8-2.2 1.1l1.2 1.9a19 19 0 0 0 5.7-2.9c.5-5-.8-9.4-3.8-13.2zM8.7 15.1c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3zm6.6 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3z" />
  </svg>
);

export const Logo = (p) => (
  <svg viewBox="0 0 24 24" fill="none" width={15} height={15} {...p}>
    {/* Stilisiertes "A" aus Bildpunkten - passend zum Namen ArcanePixels. */}
    <path d="M12 4l7 16h-3.5l-1.2-3H9.7l-1.2 3H5l7-16z" fill="#fff" opacity="0.95" />
    <rect x="10.6" y="12" width="2.8" height="2.8" fill="#fff" opacity="0.55" />
  </svg>
);

/** Stecker - der Standard fuer Plugins ohne eigenes Symbol. */
export const Plug = (p) => (
  <svg {...base} {...p}>
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" />
    <path d="M12 17v5" />
  </svg>
);

export const Scroll = (p) => (
  <svg {...base} {...p}>
    <path d="M8 3h9a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H7" />
    <path d="M5 3a2 2 0 0 0-2 2v2h5V5a2 2 0 0 0-2-2z" />
    <path d="M16 21a3 3 0 0 1-3-3v-2h8v2a3 3 0 0 1-3 3" />
  </svg>
);

export const Trash = (p) => (
  <svg {...base} {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

/**
 * Symbole, die ein Plugin in seinem Manifest per Namen waehlen kann.
 * Was hier nicht steht, bekommt den Stecker.
 */
export const ICON_MAP = {
  shield: Shield,
  wave: Wave,
  clock: Clock,
  play: Play,
  list: List,
  users: Users,
  gavel: Gavel,
  plus: Plus,
  hash: Hash,
  scroll: Scroll,
  plug: Plug,
};
