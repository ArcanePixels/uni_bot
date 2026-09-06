import { signIn, auth } from '@/lib/auth.js';
import { Logo, Discord, Check, ICON_MAP, Shield } from '@/components/Icons.js';
import { FUNKTIONEN, UNTERSCHIEDE } from '@/lib/vorteile.js';

/**
 * Die Startseite fuer alle, die den Bot noch nicht kennen.
 *
 * Vorher landete man direkt auf einer Login-Karte mit einem Satz - ohne zu
 * erfahren, was der Bot ueberhaupt tut. Wer den Bot weitergibt, kann diese
 * Adresse jetzt einfach verschicken.
 *
 * Was hier steht, kommt aus `lib/vorteile.js` - dort nennt jeder Punkt die
 * Datei, in der die Funktion steckt, und ein Test prueft, dass es sie gibt.
 * Eine Seite, die etwas verspricht, das nie gebaut wurde, kostet Vertrauen.
 */
export const metadata = {
  title: 'Discord Allrounder',
  description: 'Discord-Bot ohne Abo-Zwang, auf eigener Hardware.',
};

export default async function WillkommenPage() {
  const session = await auth();
  const angemeldet = Boolean(session?.user && !session.error);

  const Anmeldeknopf = ({ gross = false }) => (
    <form
      action={async () => {
        'use server';
        await signIn('discord', { redirectTo: '/' });
      }}
    >
      <button type="submit" className={gross ? '' : 'klein'}>
        <Discord />
        {angemeldet ? 'Zu meinen Servern' : 'Mit Discord anmelden'}
      </button>
    </form>
  );

  return (
    <div className="willkommen">
      <header className="wk-kopf">
        <span className="brand">
          <span className="brand-mark">
            <Logo width={20} height={20} />
          </span>
          Discord Allrounder
        </span>
        <Anmeldeknopf />
      </header>

      <section className="wk-einstieg">
        <h1>
          Ein Discord-Bot, der <span className="hervor">alles kann</span> – ohne Abo.
        </h1>
        <p className="wk-lead">
          Moderation, Willkommensnachrichten, geplante Posts, Tickets, Twitch- und
          YouTube-Meldungen. Alles im Browser einstellbar, alles auf eigener Hardware.
        </p>
        <div className="wk-aktion">
          <Anmeldeknopf gross />
          <span className="help">
            Anmeldung über Discord. Du siehst danach nur Server, auf denen du selbst
            Administrator bist.
          </span>
        </div>
      </section>

      <section className="wk-unterschiede">
        {UNTERSCHIEDE.map((u) => (
          <div key={u.titel} className="wk-karte">
            <h3>
              <Check width={16} height={16} /> {u.titel}
            </h3>
            <p>{u.text}</p>
          </div>
        ))}
      </section>

      <section className="wk-funktionen">
        <h2>Was drinsteckt</h2>
        <div className="wk-raster">
          {FUNKTIONEN.map((g) => {
            const Icon = ICON_MAP[g.icon] ?? Shield;
            return (
              <div key={g.gruppe} className="wk-gruppe">
                <h3>
                  <Icon width={16} height={16} /> {g.gruppe}
                </h3>
                <ul>
                  {g.punkte.map((p) => (
                    <li key={p.text}>{p.text}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="wk-abschluss">
        <h2>Selbst betreiben</h2>
        <p>
          Der Bot läuft in drei Containern auf eigener Hardware – ein NAS oder ein kleiner
          Server genügt. Der Quelltext liegt offen, die Einrichtung ist beschrieben.
        </p>
        <a
          className="btn secondary"
          href="https://github.com/ArcanePixels/uni_bot"
          target="_blank"
          rel="noopener noreferrer"
        >
          Quelltext und Anleitung ansehen
        </a>
      </section>

      <footer className="wk-fuss">
        {/* Hier steht das volle Logo samt Schriftzug - der Platz reicht, damit
            er lesbar bleibt. In der Kopfzeile waere er nur ein grauer Streifen. */}
        <Logo width={104} height={104} variante="voll" />
        <span>ein Werkzeug von ArcanePixels</span>
      </footer>
    </div>
  );
}
