# ARC by APEX — User Training Manual
### Matrix Systems, Inc. | Internal Use Only

**Version:** ARC v1.17.x
**Last Updated:** March 2026

---

## Table of Contents

1. [What Is ARC?](#1-what-is-arc)
2. [Getting Started — Login & Setup](#2-getting-started--login--setup)
3. [The Dashboard — Projects View](#3-the-dashboard--projects-view)
4. [Creating a New Project](#4-creating-a-new-project)
5. [Uploading Drawings & Page Detection](#5-uploading-drawings--page-detection)
6. [Running Extraction](#6-running-extraction)
7. [Working with the BOM](#7-working-with-the-bom)
8. [Validation — Schematic & Layout](#8-validation--schematic--layout)
9. [Pricing & Labor Estimation](#9-pricing--labor-estimation)
10. [Generating a Quote](#10-generating-a-quote)
11. [RFQ — Requesting Quotes from Vendors](#11-rfq--requesting-quotes-from-vendors)
12. [Supplier Portal — How Vendors Submit Quotes](#12-supplier-portal--how-vendors-submit-quotes)
13. [Business Central Integration](#13-business-central-integration)
14. [Settings & Company Configuration](#14-settings--company-configuration)
15. [Team Management](#15-team-management)
16. [Tips, Shortcuts & Best Practices](#16-tips-shortcuts--best-practices)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. What Is ARC?

**ARC** (Automated Review & Costing) is Matrix Systems' internal platform for automating the electrical panel quoting workflow. It replaces hours of manual BOM transcription, labor estimation, and quote generation with AI-powered extraction from UL508A drawing sets.

### What ARC Does

| Task | Without ARC | With ARC |
|------|-------------|----------|
| BOM extraction from drawings | Manual transcription | AI reads PDF, extracts in minutes |
| Labor estimation | Spreadsheet calculations | Auto-calculated from AI analysis |
| Schematic cross-reference | Manual check | AI cross-references device tags |
| Vendor RFQ distribution | Manual email drafting | One-click send with supplier portal |
| Quote generation | Word/Excel template | Formatted PDF with live pricing |
| Business Central sync | Manual data entry | One-click push to BC |

### The Typical Workflow

```
Create Project → Upload Drawings → AI Extraction → Edit BOM →
Validate → Price → Generate Quote → Send RFQs → Import Supplier Prices →
Sync to Business Central
```

---

## 2. Getting Started — Login & Setup

### 2.1 Accessing ARC

Open a browser (Edge or Chrome recommended) and navigate to:
**https://matrix-arc.web.app**

### 2.2 Signing In

You can sign in three ways:

**Option A — Email & Password**
1. Enter your Matrix Systems email address
2. Enter your password
3. Click **Sign In**

**Option B — Sign in with Google**
1. Click **Continue with Google**
2. Select your @matrixsystems.com account

**Option C — Sign in with Microsoft**
1. Click **Continue with Microsoft**
2. Log in with your Microsoft 365 / Azure AD account
3. This also enables Business Central connectivity

> **Note:** If you're a new user, contact an ARC admin to be added to the team workspace. You will receive an invitation email.

### 2.3 First-Time Connection Check

After login, ARC will display a **connection quality indicator** in the top menu bar if your connection is slow or offline. This appears as:
- **Yellow pill:** "Slow Connection" — the app is working but may take longer
- **Red pill:** "Offline" — check your internet connection before proceeding

---

## 3. The Dashboard — Projects View

After login, you land on the **Projects Dashboard**. This is your home screen.

### 3.1 Dashboard Layout

```
[ ARC Logo ]  [ + New Project ]  [ Settings ⚙ ]  [ Team 👥 ]  [ Sign Out ]
─────────────────────────────────────────────────────────────────────────────
[ Search projects... ]                               [ Active ▼ ] [ Sort ▼ ]
─────────────────────────────────────────────────────────────────────────────
 ┌─────────────────────┐  ┌─────────────────────┐
 │ SMITH AUTOMATION    │  │ JONES FOODS MCC     │
 │ Panel 1, Panel 2    │  │ Panel 1             │
 │ Status: Costed      │  │ Status: Draft       │
 │ Updated: 2h ago     │  │ Updated: yesterday  │
 └─────────────────────┘  └─────────────────────┘
```

### 3.2 Project Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| Draft | Orange | Just created, no drawings yet |
| In Progress | Yellow | Drawings uploaded, extraction running or complete |
| Extracted | Blue | AI extraction done, BOM ready for review |
| Validated | Teal | Schematic cross-reference complete |
| Costed | Purple | Pricing applied, labor estimated |
| Quoted | Green | Quote generated |

### 3.3 Opening a Project

Click any project card to open it. You'll go directly to the **Panel List** for that project.

### 3.4 Archiving & Restoring

- To archive a completed project: open it, then use the **archive** option (keeps it out of the active list)
- To view archived projects: use the **filter dropdown** → select "Archived"
- To restore: open an archived project and click **Restore**

---

## 4. Creating a New Project

### 4.1 Step-by-Step: New Project

1. Click **+ New Project** in the top right of the dashboard
2. The **New Project** form appears

**Required Fields:**
- **Customer** — Start typing a customer name or number; select from the Business Central dropdown
- **Project Name** — Enter a descriptive name (e.g., "Smith Automation - MCC Panel")

**Optional Fields:**
- **BC Project Number** — If a BC job already exists, enter the job number here
- **Drawing Number** — Panel drawing reference (e.g., 2024-0145)
- **Revision** — Drawing revision letter (A, B, C…)

3. Click **Create Project**
4. You'll be taken to the **Panel List** for this project

### 4.2 Adding Panels

Each project can have one or more **panels** (separate electrical assemblies). Most jobs have one panel. Multi-panel jobs (e.g., a Motor Control Center with multiple sections) use multiple panels.

1. Click **+ Add Panel**
2. Enter a panel name (e.g., "Panel 1", "MCC Section A", "Control Panel")
3. Click **Add**

The panel appears in the list with status **Draft**.

> **Tip:** Use descriptive panel names that match your drawing title block. These names appear in quotes and BC planning lines.

---

## 5. Uploading Drawings & Page Detection

### 5.1 Opening a Panel

From the Panel List, click the panel name or the **Open** button to enter the panel workspace.

### 5.2 Adding Drawing Files

1. Click **+ Add Files** (or drag and drop files onto the panel)
2. Select one or more **PDF or image files** (JPG, PNG supported)
3. ARC uploads the files and automatically begins **page type detection**

### 5.3 Automatic Page Type Detection

ARC uses AI to classify each page of your drawing set:

| Page Type | What It Is | Used For |
|-----------|------------|----------|
| **BOM** | Bill of Materials table | Part extraction |
| **Schematic** | Electrical wiring diagram | Device tag cross-reference, wire count |
| **Backpanel** | Panel layout (components on back plate) | Device count, DIN rail, duct estimation |
| **Enclosure** | Enclosure/door layout | Door cutouts, panel dimensions |
| **P&ID** | Process & Instrumentation Diagram | Reference only |

> **What you'll see:** Each uploaded page gets a colored label badge showing its detected type. The detection usually takes 10–30 seconds per page.

### 5.4 Correcting Page Types

If AI incorrectly classifies a page:

1. Click on the page thumbnail
2. Use the **page type selector** to change the classification
3. ARC saves this correction to the **learning database** — future similar pages will be classified correctly

### 5.5 Page Management Tips

- **Multiple BOMs:** If your drawing set has a BOM on page 1 and a revised BOM on page 15, keep only the most current one tagged as BOM
- **Detail views:** If a page is a zoomed-in detail of a component already shown elsewhere, you can exclude it
- **Thumbnails:** Click any thumbnail to zoom in and view the full page

---

## 6. Running Extraction

### 6.1 What Extraction Does

When you click **Extract** (or **Run Validation**), ARC runs all AI analysis tasks:

1. **BOM Extraction** — Reads the BOM table(s) and extracts every line item
2. **Schematic Analysis** — Counts internal wire connections and identifies device tags
3. **Layout Analysis** — Analyzes the backpanel and enclosure pages for labor estimation
4. **Part Crosses** — Automatically applies any saved part number substitutions
5. **Corrections** — Automatically fixes any saved OCR/formatting corrections

### 6.2 Step-by-Step: Running Extraction

1. Verify all page types are correct
2. Click **Extract** or **Run Extraction**
3. A **progress indicator** appears showing each step
4. When complete, the BOM table populates and the panel status changes to **Extracted**

> **Timing:** Extraction takes 1–5 minutes depending on the drawing set complexity. You can leave the tab open in the background.

### 6.3 What to Review After Extraction

Once extraction completes, check:

1. **BOM row count** — Does the item count roughly match what you'd expect?
2. **Part numbers** — Spot-check a few items against the drawing
3. **Quantities** — Verify key items (breakers, terminals, wire duct)
4. **Labor rows** — The first 3 rows (CUT, LAYOUT, WIRE) are auto-generated from the analysis

### 6.4 Re-Extraction

If you upload a revised drawing or need to re-run extraction:
1. You can re-run at any time — ARC will prompt you before overwriting
2. **Manual edits** (rows with `priceSource: manual` or `priceSource: bc`) are **preserved** during re-extraction

---

## 7. Working with the BOM

The **Bill of Materials** is the core of every panel project. ARC presents it as an interactive table.

### 7.1 BOM Table Columns

| Column | Description |
|--------|-------------|
| **#** | Line item number |
| **Qty** | Quantity needed |
| **Part Number** | Catalog/manufacturer part number |
| **Manufacturer** | Brand (e.g., Allen-Bradley, Square D) |
| **Description** | Part description |
| **Notes** | Reference designators (CB1, M1, etc.) from schematic |
| **Unit Price** | Cost per unit |
| **Ext. Price** | Qty × Unit Price |
| **Priced** | Date/status of last price update |

### 7.2 Editing BOM Cells

- **Click any cell** to edit it directly
- Press **Enter** or click away to save
- Changes are saved to Firestore in real time

### 7.3 Adding BOM Rows

- Click **+ Add Row** at the bottom of the BOM table
- A new blank row appears — fill in the part number, description, and qty

### 7.4 Deleting BOM Rows

- Hover a row to see the row actions (right side)
- Click the **trash icon** to delete

### 7.5 Crossing a Part Number (Substitutions)

When you need to substitute one part for another (e.g., a superseded catalog number):

1. Hover the row → click **Cross Part** (⇄ icon)
2. Enter the **replacement part number**
3. Toggle **Auto-replace** if you want this substitution applied automatically in all future projects
4. Click **Save Cross**

The row will show a strikethrough on the old part number and highlight the new one.

### 7.6 Getting Prices from Business Central

For rows without pricing:

1. Click **Get Pricing** (or the price cell itself)
2. ARC searches BC for the part number
3. If found, the unit price populates automatically and the **Priced** column shows today's date in green

**Price Source Indicators:**
- **Green + bold date** — Priced within 60 days (current and valid)
- **Red + bold date** — Priced more than 60 days ago (should be refreshed)
- **No date** — Never priced from BC

### 7.7 BC Item Browser

To search BC for a specific part:

1. Click the **magnifying glass icon** next to a BOM row
2. The **BC Item Browser** opens
3. Search by part number or description
4. Click **USE** to populate the row with BC pricing and vendor info

### 7.8 Part Verification

ARC can check whether extracted part numbers are valid:

- **Verified** (green) — Confirmed match in BC or known database
- **Plausible** (yellow) — Looks like a valid part number format
- **Suspect** (red) — Unusual format or likely an OCR error

Click **Verify Parts** to run this check on all unverified rows.

### 7.9 Row Highlighting

- **Red background** — Row has qty = 0 or unit price = $0 (needs attention)
- **Yellow background** — Part is flagged as suspect
- **Green background** — Recently priced from BC

### 7.10 Labor Rows (CUT, LAYOUT, WIRE)

The first three BOM rows are auto-generated **labor estimate rows**:

| Row | Represents |
|-----|------------|
| **CUT** | Panel cutting/machining labor |
| **LAYOUT** | Panel layout and assembly labor |
| **WIRE** | Panel wiring labor |

These are calculated automatically from the schematic and layout analysis. They appear in the BOM for reference but are handled separately in the pricing section.

---

## 8. Validation — Schematic & Layout

### 8.1 What Validation Checks

After extraction, ARC performs cross-reference checks:

1. **Schematic Tags vs BOM Notes** — Every device tag in the schematic (CB1, M1, PB1…) should have a corresponding entry in the BOM's Notes column
2. **Wire Count** — Internal wire connections are counted for labor estimation
3. **Layout Analysis** — Door cutouts and backpanel devices are counted

### 8.2 Reading the Validation Summary

Open a panel → scroll to the **Validation** section. You'll see:

```
Schematic Analysis
─────────────────────────────────────
✓ Matched:    42 items   (tags found in BOM)
⚠ Missing:    3 items    (tags in schematic, not in BOM)
? Unaccounted: 5 items   (in BOM notes, not in schematic)

Internal Wires: 187 connections
```

### 8.3 Resolving Missing Items

For items flagged as **Missing** (in schematic but not in BOM):

1. Click the item to expand details
2. Options:
   - **Add to BOM** — Creates a new BOM row for this item
   - **Accept Missing** — Acknowledges the item is intentionally absent (e.g., customer-supplied)
   - **Ignore** — Skips without recording

### 8.4 Layout Analysis Results

After layout analysis, ARC shows:

```
Layout Analysis
─────────────────────────────────────
Enclosure:  48" W × 36" H × 12" D
Door:       8 cutouts  (3 pushbuttons, 2 pilot lights, 1 HMI, 1 e-stop, 1 selector)
Backpanel:  24 devices
Wire Duct:  ~85 linear feet
DIN Rail:   ~32 linear feet
```

> **Note:** If the AI layout count differs from what you see on the drawing, you can manually correct it. These corrections are saved to the learning database to improve future accuracy.

### 8.5 Confidence Score

The panel workspace shows an overall **confidence score** (0–100%). This reflects:
- How many BOM items are priced
- How complete the schematic cross-reference is
- Whether layout data was found

Aim for a confidence score above **80%** before generating a quote.

---

## 9. Pricing & Labor Estimation

### 9.1 Labor Estimation Overview

ARC automatically estimates labor from the schematic and layout analysis:

| Labor Category | Basis |
|---------------|-------|
| Wire count | Internal connections × minutes/point |
| Door devices | Device count × minutes/device |
| Panel holes | Cutout count × minutes/hole |
| Device mounting | Backpanel devices × minutes/device |
| Wire duct | Linear feet × minutes/foot |
| DIN rail | Linear feet × minutes/foot |
| Project management | Fixed minutes per session |

Labor rates are configured in **Settings → Pricing Configuration**.

### 9.2 Viewing the Labor Breakdown

In the panel workspace, scroll to the **Pricing** section:

```
Labor Estimate
─────────────────────────────────────
Wiring        14.5 hrs    ████████████░░
Door Devices   3.2 hrs    ███░░░░░░░░░░░
Panel Holes    1.8 hrs    ██░░░░░░░░░░░░
Assembly       5.1 hrs    █████░░░░░░░░░
─────────────────────────────────────
Total:        24.6 hrs
```

### 9.3 Pricing Breakdown

The full project pricing is visible in the **Quote** section (also accessible from the panel list):

| Line | Value |
|------|-------|
| BOM Total | Sum of all priced items |
| Labor | Hrs × labor rate |
| BOM Contingency | Default $1,500 (configurable) |
| Consumables | Default $400 (configurable) |
| Subtotal | BOM + Labor + Contingencies |
| Markup (30%) | Subtotal × markup % |
| **Sell Price** | Subtotal + Markup |

> **Adjusting Markup:** The markup percentage can be changed per-project in the Quote editor.

---

## 10. Generating a Quote

### 10.1 Opening the Quote Editor

From the Panel List:
1. Click **Print Quote** (or open the **Quote** tab at the top)
2. The Quote editor opens

### 10.2 Quote Fields

Fill in or verify the following before printing:

**Header Information:**
- **Quote Number** — Auto-generated (can override)
- **Project Number** — BC job number
- **Project Name** — Customer-facing project description
- **Customer Name** — Pulled from BC
- **Salesperson** — Your name
- **Quote Date** — Auto-fills today's date
- **Ship Date** — Requested delivery date

**Pricing:**
- Review BOM total, labor, contingencies
- Adjust **markup %** if needed
- The **Sell Price** auto-calculates

### 10.3 Printing the Quote

1. Review all fields in the Quote editor
2. Click **Print Quote**
3. Your browser's **print dialog** opens
4. Choose your printer or **Save as PDF**
5. Click **Print**

The printed document includes:
- Matrix Systems header with logo
- Customer and project information
- Labor summary with visual breakdown bars
- BOM table (all parts, prices hidden for customer-facing quotes unless configured)
- Terms & Conditions page

> **Tip:** Use **Edge or Chrome** for the best print formatting. The quote is designed for 8.5" × 11" paper.

### 10.4 Quote Layout for Multi-Panel Projects

For projects with multiple panels, the quote automatically summarizes all panels. Each panel's labor and BOM total is broken out separately with a combined total.

### 10.5 PO Received

When a customer issues a Purchase Order:

1. From the Panel List, click **PO Received**
2. Enter the **PO Number**
3. Set **ship dates per panel** (if applicable)
4. Click **Submit PO**

This pushes the PO number and ship dates directly to Business Central.

---

## 11. RFQ — Requesting Quotes from Vendors

### 11.1 What Is an RFQ in ARC?

An **RFQ (Request for Quote)** is a document you send to suppliers asking for pricing on the parts in your BOM. ARC automates this by:
- Grouping BOM items by vendor
- Generating formatted RFQ documents
- Emailing them with a direct upload link for the supplier

### 11.2 Opening the RFQ Modal

From the Panel List:
1. Click **Send RFQ** (envelope icon)
2. The **RFQ Email Modal** opens

### 11.3 RFQ Modal Layout

```
RFQ — Smith Automation Panel 1
─────────────────────────────────────────────────────────
Vendor               Items    Preview    Action
─────────────────────────────────────────────────────────
ABB / Royal Wholesale  12     👁 Preview  📧 Send Email
Allen-Bradley (direct)  8     👁 Preview  📧 Send Email
Square D               5     👁 Preview  📧 Send Email
─────────────────────────────────────────────────────────
```

### 11.4 Previewing an RFQ

1. Click **👁 Preview** next to any vendor
2. A full-size preview of the RFQ document opens
3. Review the header, item list, and blank price/lead time columns
4. Close the preview and return to the modal

### 11.5 Sending an RFQ via Email

1. Click **📧 Send Email** next to a vendor
2. ARC sends an email to the vendor's address on file with:
   - The RFQ as a PDF attachment
   - A direct link for the supplier to upload their quote (no login required)
3. The send is logged in **RFQ History**

> **Requirements:** You must be signed in with Microsoft 365 to send via email (uses your Outlook account).

### 11.6 Printing an RFQ

If you prefer to print and fax/mail:
1. Click **👁 Preview**
2. Use **Ctrl+P** to print from the preview

### 11.7 RFQ Numbers

Each RFQ is assigned a unique number in the format:
**PROJ-VND-YYYYMMDD**
(e.g., `SMITH-ROY-20260315`)

This number appears on the RFQ document and is used to track responses.

---

## 12. Supplier Portal — How Vendors Submit Quotes

### 12.1 What the Supplier Sees

When a supplier receives your RFQ email, they get:
1. A PDF of the RFQ (for reference)
2. A **"Upload Your Quote →"** button linking to the supplier portal

The supplier portal is a **web page** that requires no login. The link contains a unique token that expires in 30 days.

### 12.2 Supplier Portal Workflow

**Step 1 — Upload Phase**
The supplier sees:
- Project name and your company header
- A table of items that were requested (part numbers, descriptions, quantities)
- A **drag-and-drop zone** to upload their PDF quote

**Step 2 — AI Extraction (Analyzing Phase)**
After uploading a PDF:
- A loading screen appears: "AI is reading your quote and extracting prices…"
- AI scans up to 8 pages of the PDF
- Extracts unit prices AND lead times per line item

**Step 3 — Review Phase**
The supplier sees:
- A table of all requested items
- AI-extracted prices pre-filled with **confidence badges** (HIGH / MEDIUM / LOW)
- Items AI couldn't price are flagged with **⚠ Missing**
- The supplier can correct any prices and fill in any blanks
- A **Lead Time (days)** column per item
- **"← Start Over"** if they want to upload a different file
- **"✓ Confirm & Submit Quote"** to finalize

### 12.3 Viewing Submitted Supplier Quotes in ARC

Once a supplier submits their quote, ARC notifies you:

1. The **"📥 Upload Quote"** button on the Panel List shows a badge with the count (e.g., `📥 Upload Quote (2)`)
2. Click the button to open **Submitted Supplier Quotes**
3. You'll see a list of all submitted quotes with:
   - Vendor name and RFQ number
   - Submitted date
   - Items with prices and lead times
   - Confidence indicators from AI extraction

### 12.4 Applying Supplier Prices to the BOM

1. In the **Submitted Supplier Quotes** modal, click **Apply Prices to BOM**
2. ARC will:
   - Match items to BOM rows by part number
   - Update unit prices
   - Mark rows as `priceSource: bc` with today's date (so "Get Pricing" warnings don't appear)
   - Push the `Unit_Cost` to the BC item card in Business Central
3. The **Priced** column on those rows will turn green

> **Note:** Rows manually priced by you (`priceSource: manual`) are never overwritten by supplier prices.

---

## 13. Business Central Integration

### 13.1 Connecting to Business Central

ARC integrates with BC via your **Microsoft 365 account**:

1. Sign in to ARC with Microsoft (top right → **Sign in with Microsoft**)
2. ARC automatically discovers your BC environment
3. Once connected, a **BC indicator** appears in the panel workspace

> **Prerequisite:** Your Microsoft account must have access to the Matrix Systems BC environment. Contact IT if you don't have BC access.

### 13.2 Creating a BC Project from ARC

When creating a new project:
1. After selecting a customer, check **Create BC Project**
2. ARC will create a new BC Job with:
   - Customer number from BC
   - Project name
   - Panel task hierarchy
3. The BC job number is saved to the ARC project automatically

### 13.3 Syncing BOM to BC Planning Lines

After pricing is complete:

1. Open a panel → click **Push to BC**
2. ARC creates/updates **BC Job Planning Lines** for:
   - Progress billing line (panel sell price)
   - Labor lines (CUT, LAYOUT, WIRE hours)
   - All BOM items (quantity and unit cost)

### 13.4 BC Item Lookup

To find a BC item while editing the BOM:
1. Click the **search icon** on any BOM row
2. Type a part number or description
3. Results show with description, vendor, and last known price
4. Click **USE** to apply to the BOM row

### 13.5 Pushing Panel End Dates

When a PO is received with ship dates per panel:
1. Click **PO Received** from the Panel List
2. Enter per-panel ship dates
3. ARC pushes `Ending_Date` to the corresponding BC planning lines

---

## 14. Settings & Company Configuration

### 14.1 Opening Settings

Click the **⚙ Settings** icon in the top right menu bar.

### 14.2 Pricing Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| BOM Contingency | $1,500 | Extra allowance for miscellaneous BOM items |
| Consumables | $400 | Wire, zip ties, labels, heat shrink |
| Budgetary Contingency % | 20% | Hidden additional margin for early-stage quotes |
| Default Markup % | 30% | Applied to all new projects |

### 14.3 Labor Rates

Labor rates are set in **minutes per unit**:

| Rate | Default | Applied To |
|------|---------|------------|
| Wire Time | 8 min/point | Internal wire connections |
| Door Device Wiring | 25 min/device | Door-mounted devices |
| Device Mounting | 10 min/device | Backpanel devices |
| Wire Duct | 2 min/ft | Wire duct linear footage |
| DIN Rail | 1 min/ft | DIN rail linear footage |
| Panel Holes | 15 min/hole | Door cutouts requiring machining |
| Project Management | 60 min/session | Fixed per project |

> **Tip:** Labor rates are company-wide and affect all projects. Changes take effect immediately for new labor calculations.

### 14.4 Default BOM Items

You can configure **items that are automatically added to every BOM** after extraction. These are typically consumables or standard accessories:

1. Go to Settings → **Default BOM Items**
2. Search for BC items or add manually
3. Set quantities
4. These items append to every new extraction

### 14.5 Anthropic API Key

ARC uses the **Anthropic Claude API** for AI extraction. Your key is stored securely in your user profile:

1. Settings → **API Configuration**
2. Enter your Anthropic API key
3. Click **Save**

> The API key is stored encrypted in Firestore under your user account. It is never shared with other users.

### 14.6 Company Logo

1. Settings → scroll to **Company Logo**
2. Click **Upload Logo**
3. Select a PNG, JPG, or SVG file
4. The logo appears on printed quotes

---

## 15. Team Management

### 15.1 User Roles

| Role | Can Do |
|------|--------|
| **Admin** | Everything — create/delete projects, manage team, change settings |
| **Edit** | Create and edit projects, run extraction, generate quotes |
| **View** | Read-only access — view projects, BOM, and quotes but cannot modify |

### 15.2 Inviting a New Team Member

1. Click **👥 Team** in the top menu
2. Click **+ Invite Member**
3. Enter the person's email address
4. Select their role (Edit or View)
5. Click **Send Invite**

The invitee receives an email with a join link. When they click it and sign in, they're added to the workspace.

> **Note:** The invite link expires after 7 days. Resend if the invitee doesn't accept in time.

### 15.3 Changing a Member's Role

1. Team modal → find the member
2. Click the **role dropdown** next to their name
3. Select the new role
4. Change takes effect immediately

### 15.4 Removing a Team Member

1. Team modal → find the member
2. Click the **Remove** button (trash icon)
3. Confirm removal

> **Note:** Removing a member does not delete their work. All projects they created remain in the workspace.

---

## 16. Tips, Shortcuts & Best Practices

### 16.1 Drawing Upload Best Practices

- **Upload complete drawing sets** — Include all pages in one upload rather than individual files. ARC benefits from seeing all pages together.
- **Use PDF format** when possible — Image-based PDFs (scanned drawings) work, but vector PDFs produce significantly better extraction results.
- **Ensure drawing quality** — Blurry or low-contrast scans reduce extraction accuracy. 150 DPI minimum; 300 DPI preferred.
- **Remove unnecessary pages** — Cut sheets, specification pages, and general notes don't help extraction and slow it down.

### 16.2 BOM Accuracy Tips

- **Review labor rows first** — The CUT, LAYOUT, WIRE rows are the first things customers notice on a quote. Verify the labor estimate looks reasonable.
- **Cross parts proactively** — If you regularly substitute one brand for another, set up the cross in ARC so it applies automatically to future projects.
- **Check zero-price rows** — Red rows (qty=0 or price=$0) need attention before pricing is complete.
- **Use BC Item Browser** for custom searches — If "Get Pricing" doesn't find an item, use the browser to search by description.

### 16.3 Workflow Efficiency

- **Run extraction before pricing meetings** — Even a rough extraction gives you a BOM to work from immediately.
- **Use Fast Quote** for budgetary estimates — When a customer needs a rough number quickly, Fast Quote generates an estimate with less detail.
- **Monitor the confidence score** — Below 70% usually means missing prices or unresolved schematic issues.
- **Don't archive prematurely** — Keep projects active until the order is received and pushed to BC.

### 16.4 RFQ Best Practices

- **Preview before sending** — Always use 👁 Preview to verify the RFQ looks correct before emailing.
- **Send one vendor at a time** — If a vendor has issues (wrong email, old contact), you can fix it before sending the others.
- **Set realistic response deadlines** — The default is 14 days. For urgent projects, note this in the email body.
- **Follow up on portal submissions** — The badge counter on the Upload Quote button shows when suppliers have responded.

### 16.5 Business Central Tips

- **Connect BC before creating projects** — Sign in with Microsoft first so ARC can pull customer lists and auto-create BC jobs.
- **Verify the BC job number** — After creating a BC project from ARC, open BC to confirm the job was created correctly.
- **Push to BC once pricing is stable** — Avoid pushing planning lines multiple times, as it creates duplicate entries.

---

## 17. Troubleshooting

### "AI Extraction took too long"

- **Cause:** Large drawing set or slow internet connection
- **Solution:** Try re-running extraction. If it continues to fail, try uploading pages individually.

### "Part numbers look wrong after extraction"

- **Cause:** Handwritten or low-quality drawings can confuse OCR
- **Solution:** Manually correct the affected rows, then use **Add Correction** to teach ARC the fix for future extractions.

### "BC Item Browser shows no results"

- **Cause:** BC connection expired or part number not in BC
- **Solution:** Sign out and sign back in with Microsoft to refresh the BC token. If the part genuinely isn't in BC, add it manually.

### "RFQ email failed to send"

- **Cause:** Microsoft 365 session expired
- **Solution:** Click **Sign in with Microsoft** again and retry. If the error persists, copy the upload link and send manually via Outlook.

### "Supplier portal link expired"

- **Cause:** Portal links expire after 30 days
- **Solution:** Re-send the RFQ email from ARC to generate a new token. Old portal links cannot be reactivated.

### "Quote prints with blank pages"

- **Cause:** Browser print settings
- **Solution:** In the print dialog, uncheck "Print headers and footers" and set margins to "None" or "Default". Use Edge or Chrome.

### "Connection quality is showing yellow/red"

- **Cause:** Slow network or Firestore latency
- **Solution:** The app will continue working but saves may take longer. Wait for the indicator to clear before making large changes. Avoid starting a new extraction while offline.

### "I accidentally deleted a BOM row"

- **Cause:** User error
- **Solution:** Re-run extraction to restore the row, or manually re-add it. ARC does not have undo for BOM deletions — this is a known limitation.

---

## Quick Reference Card

### Keyboard & UI Shortcuts

| Action | How |
|--------|-----|
| Save a cell edit | Press Enter or click away |
| Open BC Item Browser | Click 🔍 next to any part number |
| Preview RFQ | Click 👁 in RFQ modal |
| Print Quote | Click Print Quote → browser print dialog |
| Add BOM row | Click + Add Row at bottom of BOM |
| Delete BOM row | Hover row → click 🗑 |
| Cross a part | Hover row → click ⇄ |
| View page full size | Click any page thumbnail |

### Status Flow Summary

```
Draft → Upload Drawings → In Progress
In Progress → Run Extraction → Extracted
Extracted → Edit BOM + Validate → Validated
Validated → Add Pricing → Costed
Costed → Generate Quote → Quoted
Quoted → Send RFQs / PO Received → Pushed to BC
```

### Key Contact for ARC Issues

For questions, bugs, or training support, contact the ARC admin on the Matrix Systems team.

---

*ARC Training Manual v1.0 — March 2026*
*Matrix Systems, Inc. — Internal Use Only*
