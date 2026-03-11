# MatrixARC — Printable Form Template Reference

Use this pattern to create new form types (RFQ, Invoice, etc.) that match the Quote form layout.

---

## Page Structure

```
#quote-doc (or #{form}-doc)
├── .qd-print-footer          ← position:fixed in print, hidden on screen
│     └── company name/address left, phone/email right
├── .qd-page (Page 1)
│     ├── .qd-header           ← full header (page 1 only)
│     │     ├── .qd-brand      ← logo + company name + address
│     │     └── .qd-hdr-right  ← doc type label + doc number + date + page #
│     ├── .qd-info-grid        ← 2-column: left party + right party
│     │     ├── left: label + name + detail (company, address, phone)
│     │     └── right: label + name + detail
│     ├── .qd-proj             ← 3-column key-value row
│     ├── .qd-terms            ← highlighted banner (editable text + note)
│     ├── .qd-items            ← line items section
│     │     └── .qd-li         ← repeatable line item card
│     │           ├── .qd-li-hdr     ← line # + part #
│     │           ├── .qd-li-body    ← title, specs grid, notes
│     │           └── .qd-li-pricing ← 5-column pricing row
│     ├── .qd-totals-bar       ← right-aligned totals box
│     ├── .qd-footer-info      ← 2-column info (e.g. salesperson, valid date)
│     └── .qd-bottom-bar       ← screen footer (hidden in print)
└── .qd-page (Page 2+)
      ├── .qd-header-cont      ← compact header: company left, date+page right
      ├── [page content]
      └── .qd-bottom-bar       ← screen footer (hidden in print)
```

---

## CSS Classes Reference

### Container
| Class | Purpose |
|-------|---------|
| `#quote-doc` | Outer wrapper. `font-family:Inter; color:#1e293b; line-height:1.5` |
| `.qd-page` | One logical page. `width:8.5in; min-height:11in`. Gets `page-break-after:always` in print (`:last-child` auto) |

### Headers
| Class | Purpose |
|-------|---------|
| `.qd-header` | Full header (page 1). Light gray bg, blue bottom border, flex row |
| `.qd-brand` | Logo + company name (flex, gap:16) |
| `.qd-brand h1` | Company name. 29px/24px(print), bold, blue |
| `.qd-brand .qd-addr` | Address. 14px/12px(print), gray |
| `.qd-hdr-right` | Right side: doc label + number + meta |
| `.qd-qlabel` | Doc type label ("Quote", "RFQ", "Invoice"). 13px uppercase gray |
| `.qd-qnum` | Doc number. 34px/28px(print), bold |
| `.qd-qmeta` | Date + page number. 14px/12px(print), gray |
| `.qd-header-cont` | Compact header (pages 2+). Half height, company left, date+page right |
| `.qd-hc-name` | Company name in compact header. 18px bold blue |
| `.qd-hc-right` | Date/page in compact header. 12px gray |

### Content Sections
| Class | Purpose |
|-------|---------|
| `.qd-info-grid` | 2-column grid. Padding 28px/14px(print) 44px/32px(print) |
| `.qd-info-label` | Section label. 12px/11px(print) uppercase blue |
| `.qd-info-name` | Primary name. 18px/15px(print) bold |
| `.qd-info-detail` | Detail text. 15px/13px(print) gray |
| `.qd-proj` | 3-column key-value strip |
| `.qd-proj-label` | Field label. 12px/10px(print) uppercase gray |
| `.qd-proj-value` | Field value. 17px/14px(print) bold |
| `.qd-terms` | Highlighted banner. Blue tint bg, 14px/12px(print) |
| `.qd-tnote` | Note within terms. 13px/11px(print) gray |

### Line Items
| Class | Purpose |
|-------|---------|
| `.qd-items` | Container. Padding 28px/14px(print) |
| `.qd-items-heading` | Section title with blue bar before. 17px/14px(print) |
| `.qd-li` | Line item card. Bordered, rounded |
| `.qd-li-hdr` | Card header. Light bg, flex row |
| `.qd-li-num` | Line number pill. Blue on blue-tint |
| `.qd-li-part` | Part number. Bold |
| `.qd-li-body` | Card body content |
| `.qd-li-title` | Item title. 16px/13px(print) bold |
| `.qd-specs` | 2-column spec grid |
| `.qd-spec` | Single spec. `<b>Label:</b> Value` |
| `.qd-li-notes` | Notes bar. Yellow-tinted left-border |
| `.qd-li-pricing` | 5-column pricing footer in card |
| `.qd-plabel` | Pricing column label. 10px/9px(print) uppercase |
| `.qd-pval` | Pricing value. 14px/12px(print) bold |
| `.qd-pval.qd-total-val` | Blue highlighted total |

### Totals
| Class | Purpose |
|-------|---------|
| `.qd-totals-bar` | Right-aligned container |
| `.qd-totals-box` | Bordered box (280px wide) |
| `.qd-totals-row` | Flex row: label left, amount right. 16px/13px(print) |
| `.qd-totals-row.qd-grand` | Grand total. White bg, dark text, blue amount, top border |
| `.qd-amt` | Amount span in grand total (blue) |

### Footer
| Class | Purpose |
|-------|---------|
| `.qd-footer-info` | 2-column info row above bottom bar |
| `.qd-footer-label` | Info label. 12px/10px(print) uppercase gray |
| `.qd-footer-value` | Info value. 16px/13px(print) |
| `.qd-bottom-bar` | Screen footer. Hidden in print (`display:none!important`) |
| `.qd-foot-left` | Left: company name + address |
| `.qd-foot-right` | Right: phone + email |
| `.qd-print-footer` | Print-only footer. `position:fixed;bottom:0` in print, `display:none` on screen |

### T&C (Terms & Conditions)
| Class | Purpose |
|-------|---------|
| `.qd-tc` | T&C wrapper. Padding 36px 44px |
| `.qd-tc-title` | Title. 18px bold uppercase centered |
| `.qd-tc-sub` | Subtitle. 12px gray centered |
| `.qd-tc-body` | 2-column layout (`columns:2; column-gap:30px`) |
| `.qd-tc-item` | Single clause. `break-inside:avoid` |
| `.qd-tc-item h4` | Clause heading. 10.5px bold uppercase blue |
| `.qd-tc-item p` | Clause text. 10px, line-height 1.6, justified |

### Data-Specific (Quote only — omit for other forms)
| Class | Purpose |
|-------|---------|
| `.qd-crossed` | Crossed/superseded parts section |
| `.qd-crossed-title` | Section title |
| `.qd-crossed-row` | Individual crossed item |
| `.qd-missing` | Missing data section |
| `.qd-missing-title` | Section title |
| `.qd-missing-sub` | Subsection label |

---

## Print System

### Key Rules
1. `@page { size:8.5in 11in; margin:0 }` — zero CSS margins, content padding provides visual margins
2. `.qd-page` gets `page-break-after:always` in print; `:last-child` gets `page-break-after:auto`
3. `.qd-print-footer` must be the **first child** of the doc container (before any `.qd-page`) so `:last-child` correctly matches the last page
4. `.qd-bottom-bar` is `display:none` in print — `.qd-print-footer` (`position:fixed;bottom:0`) replaces it
5. All font sizes are duplicated in `@media print` with `!important` (print sizes are ~75-80% of screen sizes for compactness)
6. Inputs/textareas styled as plain text in print (no borders, transparent bg)
7. `print-color-adjust:exact` on `#quote-doc` and descendants for background colors

### Auto-Print Flow (React)
```javascript
const [autoPrint, setAutoPrint] = useState(false);

useEffect(() => {
  if (autoPrint && view === "quote") {
    const t = setTimeout(() => {
      window.print();
      setAutoPrint(false);
      setView("panels");
    }, 400);
    return () => clearTimeout(t);
  }
}, [autoPrint, view]);

// Button triggers:
onPrintQuote={() => { setAutoPrint(true); setView("quote"); }}

// QuoteView wrapper when autoPrint:
<div style={autoPrint ? {height:0, overflow:"hidden"} : undefined}>
  <QuoteView ... />
</div>
```

### Screen vs Print Font Sizes
| Element | Screen | Print |
|---------|--------|-------|
| Brand h1 | 29px | 24px |
| Address | 14px | 12px |
| Doc label | 13px | 11px |
| Doc number | 34px | 28px |
| Info label | 12px | 11px |
| Info name | 18px | 15px |
| Info detail | 15px | 13px |
| Proj label | 12px | 10px |
| Proj value | 17px | 14px |
| Terms text | 14px | 12px |
| Items heading | 17px | 14px |
| Line item title | 16px | 13px |
| Specs | 13px | 11px |
| Pricing label | 10px | 9px |
| Pricing value | 14px | 12px |
| Totals row | 16px | 13px |
| Grand total | 19px | 16px |

---

## Adapting for New Form Types

### RFQ (Request for Quote)
1. Change `.qd-qlabel` text from "Quote" → "Request for Quote"
2. Replace "Prepared By" with "Requested By"
3. Replace line item pricing section with requested specs/quantities
4. Remove totals section (no pricing on RFQ)
5. Replace `.qd-footer-info` content (no "Prices Valid Until")
6. Adapt T&C page or replace with submission instructions

### Invoice
1. Change `.qd-qlabel` text from "Quote" → "Invoice"
2. Replace "Prepared By" with "Bill To" / "Ship To"
3. Add PO number to `.qd-proj` row
4. Add "Due Date" and "Invoice Date" fields
5. Totals section: add tax calculation, payment terms
6. Replace `.qd-footer-info` with payment instructions
7. T&C page: replace with payment terms or remittance info

### General Steps
1. Copy the CSS classes (all `qd-*` styles work as-is)
2. Copy the page structure (header → content → footer)
3. Swap section content as needed
4. Keep `.qd-print-footer` as first child for print footer
5. Keep `.qd-header-cont` for pages 2+
6. Ensure content fits one physical page (use compact print sizes)
