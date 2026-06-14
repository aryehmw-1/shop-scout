// Front-end feature flags. Toggling a flag here hides/show a feature in the UI
// WITHOUT deleting any implementation — the backend, API routes, and handlers
// stay intact so a feature can be re-enabled with a one-line change.

/**
 * Photo search (upload a product photo → identify it → search).
 *
 * Currently DISABLED in the public UI per product decision. The full
 * implementation is preserved and untouched:
 *   - UI handlers: handlePhoto in ChatApp.tsx and TypewriterInput.tsx
 *   - Client:      src/lib/vision/identify-client.ts
 *   - API route:   src/app/api/vision/identify/route.ts
 *   - Model glue:  src/lib/ai/gemini.ts
 *
 * TO RE-ENABLE: set this to `true` (or wire it to an env var). No other change
 * is required — the "+" photo button and its file input render again and the
 * existing pipeline handles the upload exactly as before.
 */
export const PHOTO_SEARCH_ENABLED = false;
