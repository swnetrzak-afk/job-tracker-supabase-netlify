# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-18

### Added
- JD extraction now retries transient Anthropic API errors (429, 503, 529) and
  network blips with exponential backoff, so a momentary API hiccup no longer
  fails an extract.
- Placeholder company names returned by the model (e.g. "Confidential", "N/A")
  are blanked, so the form leaves the Company field empty for you to fill in
  rather than saving a placeholder.

### Changed
- JD extraction reads the last text block of the model response instead of the
  first, keeping it robust if pointed at a thinking-capable model.

### Fixed
- Failed extractions now include the model's `stop_reason` in the error
  response, making problems (e.g. truncated output) diagnosable.

## [1.0.0] — 2026-09-18

### Added
- Initial public release: a self-hosted, single-page job application tracker
  backed by Supabase (Postgres + magic-link auth) and Netlify, with Claude-powered
  extraction of fields from pasted job descriptions.
