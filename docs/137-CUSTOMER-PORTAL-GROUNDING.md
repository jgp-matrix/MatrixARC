# Freddy — technical grounding for the #137 Brief (Customer Portal: Quoted BOM approval)

From: Marc (Masdev) · 2026-06-16 · against v1.20.130

You're drafting the Brief for **#137 — Customer Portal for digital Quoted BOM approval**. This is the
customer-facing continuation of #133 (which shipped the *email send* of the Quoted BOM). Here's the
code-grounded reality so the Brief is accurate — not the way I'd design it, just what exists today.

---

## 1. The hook #133 already left for you: `bomApprovalRequests[]`

Every time a Quoted BOM is sent (standalone via `handleBomSend`, or bundled via the QuoteSendModal
toggle), #133 appends a record to `project.bomApprovalRequests[]`:

```js
{
  id:       "bar_" + base36(Date.now()) + random4,   // "bar_" prefix = DESIGNED as the future portal write-back key
  sentAt:   <ms timestamp>,
  sentTo:   <customer email>,
  sentBy:   <ARC user email | uid>,
  mode:     "standalone" | "bundled",
  panels:   [<stable panel IDs>],                     // which panels the approval covers
  quoteRev: <number>,                                 // project.quoteRev at send time
  status:   "sent"                                    // CURRENTLY write-once — never advances past "sent"
}
```

Code anchors (for Coach/me, not you — you have no repo): `src/app.jsx:32577` (standalone) and `:32089`
(bundled). PDF builder is `generateTravelerBomPdf` (`:7576`) — internal name retained; customer-facing
title is "Quoted BOM" via `opts.documentTitle`.

**The gap #137 fills:** today `status` is write-once `"sent"`. There is no path for the customer to
*respond*. #137 is the portal + write-back that advances that status (e.g. `sent → viewed →
approved/rejected/changes-requested`) and surfaces the response back in ARC.

## 2. Architectural precedent you should mirror: the RFQ supplier portal

ARC already has a working external-party portal — the **RFQ / Supplier Portal**. #137 should almost
certainly mirror its shape rather than invent a new one. Key facts:

- A Firestore doc keyed by an unguessable **token** (`rfqUploads/{token}`) holds the session state for
  the external party. The external user opens `?rfqUpload=TOKEN` — no login.
- A **Cloud Function Firestore trigger** (`onSupplierQuoteSubmitted`) fires when the supplier flips
  `status → "submitted"`: it creates an in-app notification + emails the ARC user.
- The bell badge in the ARC toolbar lights amber; clicking the notification deep-links to the project
  and auto-opens a submissions modal (`PortalSubmissionsModal`).
- The portal Cloud Functions are **cost-attack hardened** (per-token call counter, spend ledger,
  hard caps, status guards). Any new customer-facing callable inherits this requirement.

The parallel for #137:
| RFQ portal | #137 customer portal (proposed) |
|---|---|
| `rfqUploads/{token}` | a new token doc (e.g. `bomApprovals/{token}`) referencing project + `bar_` id |
| supplier uploads a quote PDF | customer approves / rejects / requests changes |
| `status: submitted` trigger → notify ARC | `status: approved/rejected` trigger → notify ARC |
| `PortalSubmissionsModal` | a customer-response surface in QUOTE SUMMARY |

## 3. Questions the Brief needs to resolve (open design decisions — your call to frame, Jon's to decide)

1. **Token model** — new `bomApprovals/{token}` doc vs. extending `rfqUploads`? (RFQ token is
   supplier-scoped; this is customer-scoped — likely a new collection.)
2. **Status lifecycle** — what states past `"sent"`? Minimum: `viewed`, `approved`, `rejected`. Does
   "changes requested" carry a free-text reason / line-level comments?
3. **Write-back into `bomApprovalRequests[]`** — the portal updates the token doc; a Cloud Function
   mirrors the result back onto the matching `bar_` record (status + respondedAt + respondedBy +
   optional comments). Preserve write-once history — append/patch, never overwrite the `sent` record.
4. **Quote-rev coupling** — the record stores `quoteRev` at send. If the quote is revised after send,
   is an outstanding approval invalidated? (Likely yes — surface "approval is for Qv.NN, current is
   Qv.MM".)
5. **Customer identity / security** — token-only (like RFQ) vs. email-verified? Cost-attack hardening
   is mandatory on any new callable regardless.
6. **ARC-side surfacing** — notification + badge (reuse notification system) + where the
   approved/rejected state shows in QUOTE SUMMARY and on the project tile.
7. **Multi-panel / partial approval** — `panels[]` lists covered panels. Can a customer approve some
   panels and reject others, or is it all-or-nothing per request?

## 4. What's reusable vs. net-new (rough, for sizing the Brief)

- **Reusable:** notification system + bell badge, deep-link-to-project pattern, portal token pattern,
  cost-attack hardening boilerplate, `generateTravelerBomPdf` for the document the customer reviews.
- **Net-new:** customer portal page/route, `bomApprovals` token collection + rules, the response
  Cloud Function trigger, the write-back-to-`bar_` logic, the ARC-side response surface, quote-rev
  invalidation handling.

## 5. Constraints to honor (non-negotiable, from CLAUDE.md)

- Data retention: never remove/rename Firestore fields; `bomApprovalRequests[]` history is append-only.
- Multi-project assumption: any async write-back must be project-scoped (capture projectId + the
  `bar_` id at send time; never write to "whatever project is open").
- Any new Cloud Function callable: `maxInstances` cap + cost-attack hardening.

---

Marc's recommendation on sequencing: this is a real Brief → Supplement → Detailed Plan → implement
pipeline. The single biggest design fork is **#1 (token model)** and **#2 (status lifecycle)** —
pin those first and the rest follows. I can pull any additional code detail you need (RFQ portal
internals, notification schema, rules) on request.
