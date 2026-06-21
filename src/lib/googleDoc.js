/** Shared Google Docs helpers. */

/**
 * Pull the document id out of a Google Docs URL
 * (e.g. https://docs.google.com/document/d/<id>/edit → "<id>").
 * Returns "" when the url has no recognisable /document/d/ id.
 */
export function extractDocId(url) {
  return String(url || "").match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] || "";
}
