import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';

/**
 * Holt einen abgelaufenen Access-Token per Refresh-Token neu.
 * Ohne diesen Schritt bekaeme der Nutzer nach Ablauf einen rohen Serverfehler
 * statt eines Re-Login-Hinweises - das war in der Vorversion ein offener Punkt.
 */
async function refreshAccessToken(token) {
  try {
    const res = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      // Discord schickt nicht immer einen neuen Refresh-Token mit.
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    // Der Fehler wird an die Session durchgereicht, damit die Oberflaeche
    // zum erneuten Login auffordern kann statt zu crashen.
    return { ...token, error: 'RefreshFailed' };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: 'identify guilds' } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      // Noch gueltig? Dann unveraendert weiterreichen (60s Puffer).
      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 60) return token;
      if (!token.refreshToken) return { ...token, error: 'RefreshFailed' };
      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      // token.sub muss explizit uebernommen werden - sonst bleibt die User-ID
      // in Auth.js v5 leer und das Audit-Log haette dauerhaft "unknown".
      session.user.id = token.sub;
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
