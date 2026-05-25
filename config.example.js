// Copy this file to `config.js` and fill in your own values.
// `config.js` is gitignored so your keys never get committed.
//
// Find both values at: Supabase dashboard → Project Settings → API
//
// The publishable key is safe to expose in client code — Row Level Security
// (set up by schema.sql) is what actually guards your data. NEVER paste
// the `service_role` / `secret` key here.

window.HUNT_CONFIG = {
  SUPABASE_URL: 'PASTE_YOUR_SUPABASE_URL_HERE',
  SUPABASE_KEY: 'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE',
};
