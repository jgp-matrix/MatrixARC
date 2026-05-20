# Quote / Print System

## Architecture
- **No screen preview** — "Print Client Quote" button triggers `window.print()` directly via Edge/Chrome print dialog
- `#quote-doc` is rendered in the DOM but hidden on screen (`height:0;overflow:hidden` wrapper)
- `@media print` CSS makes `#quote-doc` visible, hides everything else
- Quote fields are editable via compact dark-themed form (inside QuoteView), state stored in `project.quote`
- QuoteView still accessible for Budgetary Quote tab and field editing
- Auto-print flow: button sets `view="quote"` + `autoPrint=true` → useEffect triggers `window.print()` after 400ms render delay → returns to panels view

## Print CSS Rules
- `@page{size:8.5in 11in;margin:0}` — zero CSS margins, content padding provides visual margins
- `.qd-page` uses `page-break-after:always` (last page excluded) — avoids blank pages between quote and T&C
- All `qd-*` font sizes are duplicated in `@media print` with `!important` to ensure print matches
- `#quote-doc` print override: `position:absolute;top:0;left:0;width:100%`
- Inputs/textareas styled as plain text in print (no borders, transparent background)

## Font Sizes
Quote form sizes (+20% from original) and one-page T&C sizes are tabulated in `docs/quote-print-fonts.md`. Update that doc when changing sizes in `src/app.jsx`.

## Quote Numbering
- Format: `MTX-Q######` (e.g. `MTX-Q202000`), auto-assigned on first print via `getNextQuoteNumber()`
- Firestore transaction increments `users/{uid}/config/quoteCounter.next`
- Validation regex: `/^MTX-Q\d{6}$/`
- Quote revision (`project.quoteRev`) auto-bumps when BOM hash changes since last print
- `computeBomHash()` uses djb2 hash of part numbers + quantities

## BC Drawing Upload Filename
- Format: `[QUOTED] CustomerDWG#-MTX-Q######.pdf`
- Fallback: `[QUOTED] NoCust#-MTX-Q######.pdf` if no drawing number extracted
- `bcCheckAttachmentExists` checks for any PDF attachment (not exact filename match)

## Key Constraints
- T&C must fit on exactly one printed page
- Quote content may span multiple physical pages — page break logic handles this
- Total row: white background, dark text, blue amount, top border
- Print preview = source of truth (screen preview was removed to avoid mismatch)
- `firebase.json` has `Cache-Control: no-cache` headers for HTML files
