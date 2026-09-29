export interface Env {
  /** Caches TrackResult JSON per tracking number. */
  TRACKING_CACHE: KVNamespace;
  /** Comma-separated list of origins allowed to call the API. */
  ALLOWED_ORIGIN: string;
  /** Gemini model ID used for tracking analysis. */
  GEMINI_MODEL: string;
  /** Model tried when GEMINI_MODEL is overloaded or rate-limited. */
  GEMINI_FALLBACK_MODEL: string;
  /** Secret: set via `wrangler secret put` or `.dev.vars`. */
  GEMINI_API_KEY: string;
  /** Secret: set via `wrangler secret put` or `.dev.vars`. */
  TRACKINGMORE_API_KEY: string;
}

export interface AppBindings {
  Bindings: Env;
}
