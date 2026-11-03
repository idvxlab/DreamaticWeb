// Editable GrapesJS canvas never executes scripts. Live previews use an opaque
// sandbox (allow-scripts WITHOUT allow-same-origin), with no network/API access.
export const EDITOR_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
export const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
