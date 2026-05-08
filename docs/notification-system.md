# Notification System

In-app and push notifications for MatrixARC. Drives the bell icon in the toolbar, push delivery via FCM, optional Microsoft Teams channel posting, and the Engineering Questions workflow.

## Firestore

Notifications are stored at `users/{uid}/notifications/{id}`:

```js
{
  type: "supplier_quote",        // notification type
  title: "New Quote from {vendor}",
  body: "...",
  createdAt: Date.now(),
  read: false,
  projectId: string,
  rfqUploadId: token,
  rfqNum: string,
  vendorName: string,
  projectName: string
}
```

## Frontend

- The `App` component listens to unread notifications via `onSnapshot`.
- The bell icon turns amber and shows a red badge count when unread notifications exist.
- The bell dropdown lists notifications with timestamp; supplier-quote notifications are clickable.
- Clicking a supplier-quote notification navigates to the project and auto-opens `PortalSubmissionsModal` via the `autoOpenPortal` prop.
- "Mark all read" button is in the dropdown.
- Push-notification toggle sits at the bottom of the bell dropdown.

## PWA + Push Notifications (v1.18.154+)

- **PWA manifest:** `public/manifest.json` — Edge/Chromium can install MatrixARC to the taskbar / Start Menu.
- **Service worker:** `public/sw.js` + `public/firebase-messaging-sw.js` — push-notification handling only (no caching/offline).
- **FCM tokens:** stored at `users/{uid}/fcmTokens/{tokenHash}` in Firestore.
- **Push toggle:** in bell dropdown, persisted to localStorage `arc_push_{uid}`.
- **Persistent notifications:** all push notifications use `requireInteraction: true` — they stay until the user dismisses them.
- **Push triggers:** supplier-quote submissions (`onSupplierQuoteSubmitted`) and engineer-question emails (`sendEngineerQuestionEmail`).
- **Teams webhook:** the `postToTeams()` helper sends Adaptive Cards to a Teams channel via a Power Automate workflow.
- **Icons:** `public/icons/icon-192.png` and `icon-512.png` (generated from the app logo).

## Engineering Questions System (v1.18.153+)

- **Data:** `panel.engineeringQuestions[]` — unified array for BOM and compliance questions.
- **Statuses:** `open`, `answered`, `skipped`, `on_quote`.
- **Sources:** `bom` (from extraction) and `compliance` (from `runComplianceReview`).
- **Modal:** `EngineeringQuestionsModal` — answer / skip / include-on-quote per question.
- **Pulsing badge:** panels with open questions show a pulsing yellow badge in QUOTE SUMMARY.
- **Print warning:** `handlePrintQuote` warns about unanswered questions before printing.
- **Questions for Customer:** questions with `status: "on_quote"` appear on the printed quote.
- **Email engineer:** the `sendEngineerQuestionEmail` Cloud Function sends a formatted email + push notification.
