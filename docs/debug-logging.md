# Debug Logging System (v1.19.584+)

Client-side error capture and user-reported issue pipeline for MatrixARC. Captures uncaught errors, promise rejections, and `console.error` / `console.warn` calls automatically; users can also file reports via a floating Report Issue button. Admins view the resulting log stream in **Settings → Debug Logs**.

## Storage

| Path | Notes |
|------|-------|
| `companies/{companyId}/debugLogs/{entryId}` | Primary location — admin-readable, member-writable, **immutable** (no update/delete). |
| `users/{uid}/debugLogs/{entryId}` | Fallback for users without a company; only the writer can read. |

Firestore rules block all updates and deletes — logs are append-only by design.

## Entry schema

```js
{
  createdAt, createdBy (uid), userEmail, userName,
  severity: "error" | "warn" | "user_reported",
  source: "uncaught" | "promise_rejection" | "console_error" | "manual" | "module",
  message, stack, url, userAgent, appVersion,
  projectId, panelId,            // null if none open
  breadcrumbs: [{t, type, message}],  // last ~30 events
  description                     // set for user-reported issues
}
```

## Client capture

Implemented in `public/index.html` and `public/modules/shared.js`:

- `addBreadcrumb(type, message)` — rolling in-memory buffer, max 30 entries.
- `console.error` / `console.warn` are wrapped — each call adds a breadcrumb and (for `error`) auto-emits a log entry.
- `window.addEventListener('error', …)` — uncaught errors → emit.
- `window.addEventListener('unhandledrejection', …)` → emit.
- **Dedup:** the same `source + message` within 60s is skipped.
- **Self-error flag:** if `logDebugEntry()` itself throws, emits are disabled for 30s to prevent loops.
- **Pre-auth:** writes are dropped silently when `fbAuth.currentUser` is null.
- **Tracked context globals:** `_currentProjectId`, `_currentPanelId` are set by `ProjectView` mount and the `selectedPanelId` effect; both are attached to every entry.

## UI surfaces

- **Floating `🐛 Report Issue` button** — bottom-right of every page (main app and all `/modules/` routes). Dismissible per session.
- **`ReportIssueModal`** — textarea + submit. Writes an entry with `severity: "user_reported"` and auto-attaches the last 30 breadcrumbs.
- **`DebugLogsModal`** (admin only, opened from Settings) — table of recent logs with range filters (24h / 7d / 30d / All), severity filter, and user filter. Click a row to see a detail panel with stack, breadcrumbs, and device info.

## Retention

Logs are kept forever for v1. If retention becomes a concern, add a scheduled Cloud Function that deletes entries where `createdAt < Date.now() - N * day`.
