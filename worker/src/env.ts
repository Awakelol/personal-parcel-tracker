export interface Env {
  TRACKING_CACHE: KVNamespace;
  USER_DATA: KVNamespace;
  GEMINI_MODEL: string;
  GEMINI_FALLBACK_MODEL: string;
  /** e.g. https://yourteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;

  // Secrets
  GEMINI_API_KEY: string;
  SEVENTEENTRACK_API_KEY: string;
  /** Local dev only: skip Access and act as this user. */
  DEV_USER_EMAIL?: string;
}

export interface User {
  /** sha256 of the lowercased email */
  id: string;
  email: string;
}

export interface AppBindings {
  Bindings: Env;
  Variables: { user: User };
}
