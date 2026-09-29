import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppBindings, Env, User } from '../env';
import { AppError } from '../errors';

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksByTeam.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, set);
  }
  return set;
}

function normalizeTeamDomain(value: string): string {
  const withScheme = value.startsWith('https://') ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}

async function toUser(email: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const id = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { id, email: normalized };
}

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'You are not logged in.');

// Access already checks the login, but verify its JWT here too so the API
// stays closed if Access is ever switched off.
async function authenticate(request: Request, env: Env): Promise<User> {
  const { hostname } = new URL(request.url);
  if (env.DEV_USER_EMAIL && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return toUser(env.DEV_USER_EMAIL);
  }

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new AppError(503, 'INTERNAL_ERROR', 'Login is not configured on the server yet.');
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw unauthorized();

  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  try {
    const { payload } = await jwtVerify(token, jwks(teamDomain), {
      issuer: teamDomain,
      audience: env.ACCESS_AUD,
    });
    if (typeof payload.email !== 'string') throw unauthorized();
    return toUser(payload.email);
  } catch {
    throw unauthorized();
  }
}

export const requireUser = createMiddleware<AppBindings>(async (c, next) => {
  c.set('user', await authenticate(c.req.raw, c.env));
  await next();
});
