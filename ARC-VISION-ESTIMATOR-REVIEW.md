# ARC Vision — The Estimator's-Eye Cross-Check Workflow

**Status:** Vision / future milestone. NOT current scope.
**Priority:** HIGH (for future resurfacing)
**Captured:** 2026-06-05, from Jon
**Origin:** Surfaced during the Q3 extraction-accuracy investigation. Distinct from
the near-term Required-BOM-Region feature; this is the larger direction ARC is
ultimately built toward.

## The Core Idea

ARC today extracts a BOM from a drawing. A 30-year estimator does something far
larger: they read the entire drawing package as an interconnected system, cross-
checking BOM against layout, enclosure, and schematic, and applying customer-
specific knowledge to catch what a single-document extraction never could. This
document captures that workflow as the target intelligence for ARC's future.

The near-term work (Required-BOM-Region + high-DPI render + per-customer structural
fingerprinting) is the foundation. This vision is what that foundation eventually
enables once the other three region types (Layout, Enclosure, Schematic) graduate
from their current primal state into full functionality.

## Jon's Quoting Workflow (the model to encode)

### Step 1 — Customer identification drives everything
The first question is "who is the customer?", because customer identity unlocks a
body of learned knowledge:
- WHERE the BOM lives in the package (e.g., FLS BOMs are usually near the back)
- The customer's specific BOM column structure
- Which items habitually need crossing (e.g., FLS routinely specs discontinued
  items that require a cross)
- Which items are customer-supplied (usually the same recurring items)
This is the per-customer fingerprint, applied to quoting decisions — not just region
detection. NOTE: keep this STRUCTURAL and business-rule based (where things are,
what columns exist, which items are customer-supplied/crossed). Do NOT learn part-
number content and bias OCR toward it — that is the C5 failure mode.

### Step 2 — Layout and enclosure scan (buildability + high-cost flags)
Scan layout and enclosure for:
- Back-panel density: is it full or spacious? Would a builder hate building it?
- Flag high-cost items to verify later: PLCs, enclosures, anything over ~$350
  estimated cost
- Note WHERE those high-cost items sit on the back panel

### Step 3 — Schematic scan (wire integrity + cost-tie)
Read the schematic for:
- Wire integrity and connection points — can a builder actually wire it?
- Component tags; tie high-cost items (>$350) back to the BOM
- Dead or empty connections
- Power and ground properly connected and shown

### Step 4 — BOM outlier analysis (the cross-check payoff)
With the layout/enclosure/schematic context in hand, read the BOM and ask:
- Does anything stand out as an outlier given the visual scan?
- Are there BOM items NOT shown in schematic or layout? (Air conditioners, fans,
  door-mounted devices, disconnect switches are the usual suspects)
- Verify the enclosure part # and dimensions (from description) against the layout
  and back panel — does the size match?
- Compare the PLC against processor, modules, end caps — are all I/O represented?

### Step 5 — Manual entry (the pain ARC was built to remove)
Historically, enter the BOM by hand into the old system. ARC was created to
eliminate exactly this step — and this vision extends ARC from "eliminate manual
entry" to "perform the expert cross-check that surrounds the entry."

## What This Implies for ARC's Architecture (future)

1. Multi-region intelligence: Layout, Enclosure, Schematic become first-class
   extracted/analyzed regions, not just BOM.
2. Cross-document reasoning: BOM items reconciled against schematic component tags
   and layout placement; flag BOM-only items and schematic-only items.
3. Cost-aware verification: auto-flag items over a cost threshold (~$350) for human
   verification, with their physical location noted.
4. Enclosure/dimension validation: enclosure PN + dimensions checked against layout
   footprint.
5. PLC I/O completeness: processor/module/endcap/I/O reconciliation.
6. Per-customer profile feeding all of the above (structural + business rules).

## Boundary

This is the destination, not the next sprint. It depends on the three non-BOM
region types maturing and on the near-term extraction-accuracy foundation being
solid first. Resurface when BOM extraction is stable and the other region types are
ready to graduate.
