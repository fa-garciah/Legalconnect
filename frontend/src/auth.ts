/**
 * T057 — NextAuth (Auth.js v5). research.md D1.
 *
 * IT VERIFIES NOTHING. `authorize()` calls the NestJS API and returns whatever
 * the API decides. Credential verification, TOTP verification and backup-code
 * consumption all execute inside the API, because each touches material the
 * frontend must never see and each must be audited in the same transaction as
 * the state change it causes.
 *
 * NO DATABASE ADAPTER AND NO NEXTAUTH SESSION STRATEGY beyond the cookie. None
 * of NextAuth's own tables exist. The product's `session` table is the only
 * session store, and every API request re-validates against it (FR-034).
 *
 * The constitution is what forces this shape: it names NextAuth as the identity
 * provider AND requires that "the API MUST validate every request against this
 * product's own session state, never against a bearer token's signature and
 * expiry alone." Those are only compatible if NextAuth is not an authority.
 * Letting it hold a parallel notion of validity would recreate exactly the
 * divergence the v1.5.0 amendment claims self-hosting removes — except the
 * second system would be one we built.
 *
 * So what it holds is an OPAQUE PAYLOAD: the API's access and refresh tokens,
 * inside an encrypted httpOnly cookie. The cookie is transport, not proof.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authorizeEnrollmentHandoff } from '@/session/enrollment-handoff';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

interface ApiSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // JWT rather than a database session, because the "database session" this
  // product has is the API's own table and NextAuth must not shadow it.
  session: { strategy: 'jwt' },
  pages: { signIn: '/ingresar' },
  providers: [
    Credentials({
      id: 'legalconnect',
      name: 'LegalConnect',
      credentials: {
        challengeToken: { type: 'text' },
        code: { type: 'text' },
      },
      /**
       * Called ONLY at the second step. The credential step happens on the
       * sign-in screen and emits no session, so there is nothing for NextAuth
       * to hold until the factor has been satisfied — which is FR-003 showing
       * up in the shape of this integration rather than only in the API.
       */
      async authorize(raw) {
        const challengeToken = typeof raw?.challengeToken === 'string' ? raw.challengeToken : '';
        const code = typeof raw?.code === 'string' ? raw.code : '';
        if (!challengeToken || !code) return null;

        const response = await fetch(`${API_BASE_URL}/auth/factor`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ challengeToken, code }),
        });
        if (!response.ok) return null;

        const session = (await response.json()) as ApiSession;
        // `id` is required by NextAuth's User shape and is deliberately NOT the
        // identity id: the API's response carries no identity, and inventing a
        // client-visible one here would be a second source of truth for who
        // somebody is.
        return { id: 'api-session', ...session };
      },
    }),
    /**
     * The enrollment handoff. `POST /auth/enrollment/confirm` already minted a session —
     * this is the only way it reaches the cookie, because the confirm call has to stay in
     * the component so the ten backup codes can be shown before they are gone forever.
     *
     * It verifies rather than trusts: `authorizeEnrollmentHandoff` presents the token to
     * the API and keeps it only if the API resolves it. See that module for why this is not
     * a hole.
     */
    Credentials({
      id: 'enrollment-handoff',
      name: 'LegalConnect (enrollment)',
      credentials: {
        accessToken: { type: 'text' },
        refreshToken: { type: 'text' },
        expiresAt: { type: 'text' },
      },
      authorize: (raw) => authorizeEnrollmentHandoff(raw as Record<string, unknown>),
    }),
  ],
  callbacks: {
    /** Carries the API's tokens into the cookie, and nothing else. */
    jwt({ token, user }) {
      if (user) {
        const session = user as unknown as ApiSession;
        token.accessToken = session.accessToken;
        token.refreshToken = session.refreshToken;
        token.expiresAt = session.expiresAt;
      }
      return token;
    },
    /**
     * Exposes NO token to the client. `useSession()` gets an expiry and nothing
     * usable — the credential stays in the httpOnly cookie, which is the whole
     * reason FR-051 can say nothing is written to browser storage.
     */
    session({ session }) {
      return session;
    },
  },
});
