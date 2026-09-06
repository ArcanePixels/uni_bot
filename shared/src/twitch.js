/**
 * Twitch-Anbindung: Zugangstoken, Streamabfrage, Webhook-Pruefung.
 *
 * Bewusst ohne Discord- oder Express-Abhaengigkeiten, damit sich alles direkt
 * testen laesst - Signaturpruefung und Token-Handhabung sind die Stellen, an
 * denen ein Fehler teuer ist.
 *
 * Zwei Wege, dieselben Daten:
 * - Abfrage im Intervall: laeuft ueberall, Verzoegerung rund eine Minute
 * - Webhook (EventSub): Twitch meldet sich selbst, Verzoegerung Sekunden -
 *   braucht aber einen oeffentlich erreichbaren HTTPS-Endpunkt auf Port 443
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const API = 'https://api.twitch.tv/helix';
const EVENTSUB = `${API}/eventsub/subscriptions`;

/** Twitch erlaubt bis zu 100 Kanaele je Abfrage. */
export const MAX_PER_QUERY = 100;

export class TwitchError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'TwitchError';
    this.status = status;
  }
}

/**
 * Holt und haelt das App-Zugangstoken.
 *
 * Twitch-Tokens laufen nach rund 60 Tagen ab. Wir erneuern deutlich frueher,
 * damit ein Token nicht mitten in einer Abfrage ungueltig wird.
 */
export function createTokenProvider({ clientId, clientSecret, fetchImpl = fetch }) {
  let token = null;
  let gueltigBis = 0;
  let laufend = null;

  const hole = async () => {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });

    let res;
    try {
      res = await fetchImpl(AUTH_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new TwitchError(`Twitch nicht erreichbar: ${err.message}`, 503);
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      // Falsche Zugangsdaten - erneutes Versuchen hilft nicht.
      throw new TwitchError(
        'Twitch weist die Zugangsdaten ab. Stimmen TWITCH_CLIENT_ID und TWITCH_CLIENT_SECRET?',
        401,
      );
    }
    if (!res.ok) throw new TwitchError(`Twitch antwortete mit HTTP ${res.status}`, res.status);

    const daten = await res.json();
    if (!daten.access_token) throw new TwitchError('Twitch lieferte kein Zugangstoken', 502);

    token = daten.access_token;
    // Eine Stunde Sicherheitsabstand vor dem echten Ablauf.
    const sekunden = Number(daten.expires_in ?? 0);
    gueltigBis = Date.now() + Math.max(0, sekunden - 3600) * 1000;
    return token;
  };

  return {
    async get() {
      if (token && Date.now() < gueltigBis) return token;
      // Parallele Aufrufe sollen sich eine Anfrage teilen.
      if (laufend) return laufend;
      laufend = hole().finally(() => {
        laufend = null;
      });
      return laufend;
    },
    /** Verwirft das Token - nach einem 401 sinnvoll. */
    invalidate() {
      token = null;
      gueltigBis = 0;
    },
  };
}

/** Baut einen Client fuer die Twitch-API. */
export function createTwitchClient({ clientId, clientSecret, fetchImpl = fetch }) {
  const tokens = createTokenProvider({ clientId, clientSecret, fetchImpl });

  /** Ruft die API auf und erneuert das Token bei Bedarf einmal. */
  const call = async (url, zweiterVersuch = false) => {
    const token = await tokens.get();
    let res;
    try {
      res = await fetchImpl(url, {
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new TwitchError(`Twitch nicht erreichbar: ${err.message}`, 503);
    }

    // Abgelaufenes Token: einmal erneuern und wiederholen.
    if (res.status === 401 && !zweiterVersuch) {
      tokens.invalidate();
      return call(url, true);
    }
    if (res.status === 429) {
      throw new TwitchError('Twitch drosselt gerade die Anfragen.', 429);
    }
    if (!res.ok) throw new TwitchError(`Twitch antwortete mit HTTP ${res.status}`, res.status);
    return res.json();
  };

  return {
    tokens,

    /**
     * Welche der genannten Kanaele sind gerade live?
     *
     * Gibt eine Map login -> Streamdaten zurueck. Wer nicht live ist, fehlt
     * darin - Twitch liefert nur laufende Streams.
     */
    async getStreams(logins) {
      const namen = [...new Set(logins.map((l) => normalizeLogin(l)).filter(Boolean))];
      const treffer = new Map();

      // In Bloecken zu 100 - mehr erlaubt Twitch je Abfrage nicht.
      for (let i = 0; i < namen.length; i += MAX_PER_QUERY) {
        const block = namen.slice(i, i + MAX_PER_QUERY);
        const query = block.map((n) => `user_login=${encodeURIComponent(n)}`).join('&');
        const daten = await call(`${API}/streams?${query}`);
        for (const s of daten.data ?? []) {
          treffer.set(s.user_login.toLowerCase(), {
            id: s.id,
            login: s.user_login.toLowerCase(),
            name: s.user_name,
            title: s.title,
            game: s.game_name,
            viewers: s.viewer_count,
            startedAt: s.started_at,
            thumbnail: thumbnailUrl(s.thumbnail_url),
            url: `https://twitch.tv/${s.user_login}`,
          });
        }
      }
      return treffer;
    },

    /** Nutzerdaten (u. a. die ID, die EventSub braucht). */
    async getUsers(logins) {
      const namen = [...new Set(logins.map((l) => normalizeLogin(l)).filter(Boolean))];
      const treffer = new Map();
      for (let i = 0; i < namen.length; i += MAX_PER_QUERY) {
        const block = namen.slice(i, i + MAX_PER_QUERY);
        const query = block.map((n) => `login=${encodeURIComponent(n)}`).join('&');
        const daten = await call(`${API}/users?${query}`);
        for (const u of daten.data ?? []) {
          treffer.set(u.login.toLowerCase(), {
            id: u.id,
            login: u.login.toLowerCase(),
            name: u.display_name,
            avatar: u.profile_image_url,
          });
        }
      }
      return treffer;
    },

    /** Legt eine EventSub-Anmeldung an (stream.online). */
    async subscribe({ userId, callbackUrl, secret, type = 'stream.online' }) {
      const token = await tokens.get();
      const res = await fetchImpl(EVENTSUB, {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          version: '1',
          condition: { broadcaster_user_id: String(userId) },
          transport: { method: 'webhook', callback: callbackUrl, secret },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 409) return { ok: true, schonVorhanden: true };
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new TwitchError(`Anmeldung abgelehnt (HTTP ${res.status}): ${text}`, res.status);
      }
      const daten = await res.json();
      return { ok: true, id: daten.data?.[0]?.id ?? null };
    },

    /** Listet bestehende EventSub-Anmeldungen. */
    async listSubscriptions() {
      const daten = await call(EVENTSUB);
      return (daten.data ?? []).map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        userId: s.condition?.broadcaster_user_id ?? null,
        callback: s.transport?.callback ?? null,
      }));
    },

    /** Entfernt eine Anmeldung. */
    async unsubscribe(id) {
      const token = await tokens.get();
      const res = await fetchImpl(`${EVENTSUB}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      // 404 heisst: gibt es nicht mehr - fuer uns dasselbe wie geloescht.
      if (!res.ok && res.status !== 404) {
        throw new TwitchError(`Abmeldung fehlgeschlagen (HTTP ${res.status})`, res.status);
      }
      return { ok: true };
    },
  };
}

/**
 * Macht aus dem, was jemand eintippt, einen Kanalnamen.
 *
 * Leute geben mal die URL an, mal den Namen, mal mit Grossbuchstaben - alles
 * soll funktionieren.
 */
export function normalizeLogin(eingabe) {
  const s = String(eingabe ?? '').trim();
  if (!s) return null;

  // Volle URL oder nur der Pfad.
  const ausUrl = s.match(/(?:^|\/\/)(?:www\.)?twitch\.tv\/([^/?#\s]+)/i);
  const roh = ausUrl ? ausUrl[1] : s;

  const name = roh.replace(/^@/, '').trim().toLowerCase();
  // Twitch erlaubt Buchstaben, Ziffern und _, 4 bis 25 Zeichen.
  return /^[a-z0-9_]{3,25}$/.test(name) ? name : null;
}

/**
 * Setzt die Platzhalter der Vorschau-Adresse.
 *
 * Twitch liefert sie mit {width} und {height} - so wie sie kommt, ist sie
 * unbrauchbar.
 */
export function thumbnailUrl(vorlage, breite = 640, hoehe = 360) {
  if (!vorlage) return null;
  return vorlage.replace('{width}', String(breite)).replace('{height}', String(hoehe));
}

/**
 * Prueft die Signatur einer Webhook-Anfrage.
 *
 * Ohne diese Pruefung koennte jeder gefaelschte Live-Meldungen schicken - der
 * Endpunkt ist ja oeffentlich erreichbar.
 *
 * `rawBody` muss der unveraenderte Text der Anfrage sein. Ist er schon durch
 * JSON.parse gegangen und wieder zusammengesetzt, stimmt die Signatur nicht.
 */
export function verifySignature({ secret, messageId, timestamp, rawBody, signature }) {
  if (!secret || !messageId || !timestamp || !signature) return false;

  // Alte Nachrichten abweisen: Sonst koennte jemand eine mitgeschnittene
  // gueltige Anfrage spaeter erneut abschicken.
  const alter = Math.abs(Date.now() - Date.parse(timestamp));
  if (!Number.isFinite(alter) || alter > 10 * 60_000) return false;

  const erwartet =
    'sha256=' +
    createHmac('sha256', secret)
      .update(messageId + timestamp + (rawBody ?? ''))
      .digest('hex');

  const a = Buffer.from(erwartet);
  const b = Buffer.from(String(signature));
  // Gleiche Laenge ist Voraussetzung fuer den zeitkonstanten Vergleich.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Die Kopfzeilen, die Twitch bei einem Webhook mitschickt. */
export const HEADERS = {
  id: 'twitch-eventsub-message-id',
  timestamp: 'twitch-eventsub-message-timestamp',
  signature: 'twitch-eventsub-message-signature',
  type: 'twitch-eventsub-message-type',
  subscriptionType: 'twitch-eventsub-subscription-type',
};

/** Die drei Nachrichtenarten, die Twitch schickt. */
export const MESSAGE_TYPES = {
  VERIFICATION: 'webhook_callback_verification',
  NOTIFICATION: 'notification',
  REVOCATION: 'revocation',
};
