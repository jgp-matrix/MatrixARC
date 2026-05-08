// md_to_docx.js — converts a markdown report into a .docx using docx-js + marked.
// Usage: node md_to_docx.js <input.md> <output.docx>

const path = require('path');
const fs = require('fs');

// Resolve global npm modules.
// NOTE: Windows-specific path. On macOS/Linux this would be `/usr/local/lib/node_modules`
// or `~/.npm-global/lib/node_modules` — adjust GLOBAL_NPM (or refactor to use a local
// `tools/package.json` dependency) before running on a non-Windows machine.
const GLOBAL_NPM = 'C:\\Users\\jon\\AppData\\Roaming\\npm\\node_modules';
const { marked } = require(path.join(GLOBAL_NPM, 'marked'));
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak
} = require(path.join(GLOBAL_NPM, 'docx'));

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node md_to_docx.js <input.md> <output.docx>');
  process.exit(1);
}

const md = fs.readFileSync(inputPath, 'utf8');
const tokens = marked.lexer(md);

// ── Style constants ─────────────────────────────────────────
const FONT_BODY = 'Calibri';
const FONT_MONO = 'Consolas';
const COLOR_CODE = '24292E';
const COLOR_CODE_BG = 'F6F8FA';
const COLOR_TABLE_HEAD = 'D9E2F3';
const COLOR_BORDER = 'CCCCCC';

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

// ── Inline-text rendering ───────────────────────────────────
// Walk a marked inline-token list and produce TextRun[].
function renderInline(items, opts = {}) {
  const out = [];
  if (!items) return out;
  for (const t of items) {
    switch (t.type) {
      case 'text':
        // Recurse if marked produced nested tokens (mixed inline content).
        if (t.tokens && t.tokens.length) {
          out.push(...renderInline(t.tokens, opts));
        } else {
          out.push(new TextRun({
            text: t.text,
            bold: opts.bold,
            italics: opts.italics,
            font: opts.code ? FONT_MONO : FONT_BODY,
            color: opts.code ? COLOR_CODE : undefined,
            shading: opts.code ? { type: ShadingType.CLEAR, fill: COLOR_CODE_BG } : undefined,
          }));
        }
        break;
      case 'strong':
        out.push(...renderInline(t.tokens, { ...opts, bold: true }));
        break;
      case 'em':
        out.push(...renderInline(t.tokens, { ...opts, italics: true }));
        break;
      case 'codespan':
        out.push(new TextRun({
          text: t.text,
          font: FONT_MONO,
          color: COLOR_CODE,
          shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG },
          bold: opts.bold,
          italics: opts.italics,
        }));
        break;
      case 'link':
        // Treat as plain underlined text for simplicity.
        out.push(new TextRun({
          text: t.text,
          style: 'Hyperlink',
          font: FONT_BODY,
          color: '0563C1',
          underline: {},
        }));
        break;
      case 'br':
        out.push(new TextRun({ text: '', break: 1 }));
        break;
      case 'del':
        out.push(...renderInline(t.tokens, { ...opts, strike: true }));
        break;
      case 'image':
        out.push(new TextRun({ text: `[image: ${t.text || t.href}]`, italics: true }));
        break;
      case 'html':
        // Strip raw HTML tags — keep just any text content.
        out.push(new TextRun({ text: t.text.replace(/<[^>]*>/g, ''), font: FONT_BODY }));
        break;
      default:
        if (t.text) {
          out.push(new TextRun({ text: t.text, font: FONT_BODY, bold: opts.bold, italics: opts.italics }));
        }
    }
  }
  return out;
}

// ── Block-level rendering ───────────────────────────────────
const children = [];

function pushParagraph(opts) {
  children.push(new Paragraph(opts));
}

function renderHeading(t) {
  const level = t.depth;
  const headingMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };
  const sizeMap = { 1: 36, 2: 30, 3: 26, 4: 22, 5: 20, 6: 20 }; // half-points
  const beforeMap = { 1: 360, 2: 280, 3: 220, 4: 180, 5: 160, 6: 160 };
  const afterMap = { 1: 180, 2: 140, 3: 120, 4: 100, 5: 80, 6: 80 };
  pushParagraph({
    heading: headingMap[level],
    spacing: { before: beforeMap[level], after: afterMap[level] },
    children: renderInline(t.tokens, { bold: true }).map(r => {
      // Ensure all heading runs are bold and the right size.
      try {
        r.options = { ...(r.options || {}), bold: true, size: sizeMap[level], font: FONT_BODY };
      } catch (e) { /* TextRun may be opaque — passthrough */ }
      return r;
    }),
  });
}

function renderParagraph(t) {
  pushParagraph({
    spacing: { after: 120 },
    children: renderInline(t.tokens),
  });
}

function renderList(t) {
  const reference = t.ordered ? 'numbers' : 'bullets';
  for (const item of t.items) {
    // Each item.tokens contains paragraph tokens. First paragraph gets the bullet.
    let firstPara = true;
    for (const subT of item.tokens) {
      if (subT.type === 'text') {
        // 'text' inside a list item — render its tokens inline.
        pushParagraph({
          numbering: firstPara ? { reference, level: 0 } : undefined,
          spacing: { after: 60 },
          children: renderInline(subT.tokens || [{ type: 'text', text: subT.text }]),
        });
        firstPara = false;
      } else if (subT.type === 'list') {
        // Nested list — for simplicity, indent with level 1.
        for (const subItem of subT.items) {
          for (const sub2 of subItem.tokens) {
            if (sub2.type === 'text') {
              pushParagraph({
                numbering: { reference: subT.ordered ? 'numbers' : 'bullets', level: 1 },
                spacing: { after: 40 },
                children: renderInline(sub2.tokens || [{ type: 'text', text: sub2.text }]),
              });
            }
          }
        }
      } else if (subT.type === 'paragraph') {
        pushParagraph({
          numbering: firstPara ? { reference, level: 0 } : undefined,
          indent: firstPara ? undefined : { left: 720 },
          spacing: { after: 60 },
          children: renderInline(subT.tokens),
        });
        firstPara = false;
      } else if (subT.type === 'code') {
        renderCode(subT, /*inList*/true);
      }
    }
  }
}

function renderCode(t, inList = false) {
  // Preserve the line breaks. Each line becomes its own Paragraph for proper rendering.
  const lines = t.text.split('\n');
  for (const line of lines) {
    pushParagraph({
      indent: { left: inList ? 1440 : 360 },
      spacing: { before: 0, after: 0 },
      shading: { type: ShadingType.CLEAR, fill: COLOR_CODE_BG },
      children: [new TextRun({
        text: line || ' ',
        font: FONT_MONO,
        size: 18,
        color: COLOR_CODE,
      })],
    });
  }
  // Add a small spacing after the block.
  pushParagraph({ spacing: { after: 80 }, children: [new TextRun({ text: '' })] });
}

function renderBlockquote(t) {
  for (const sub of t.tokens) {
    if (sub.type === 'paragraph') {
      pushParagraph({
        indent: { left: 360 },
        spacing: { after: 100 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } },
        children: renderInline(sub.tokens, { italics: true }),
      });
    } else if (sub.type === 'space') {
      // skip
    } else if (sub.tokens) {
      pushParagraph({
        indent: { left: 360 },
        spacing: { after: 100 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } },
        children: renderInline(sub.tokens, { italics: true }),
      });
    }
  }
}

function renderTable(t) {
  const headerRow = t.header || [];
  const bodyRows = t.rows || [];
  const colCount = headerRow.length;
  if (colCount === 0) return;

  const totalWidth = 9360; // US Letter content width @ 1" margins
  const colW = Math.floor(totalWidth / colCount);
  const columnWidths = Array(colCount).fill(colW);
  // Distribute rounding remainder to first column
  columnWidths[0] += totalWidth - colW * colCount;

  const buildCell = (cell, isHead) => new TableCell({
    width: { size: columnWidths[Math.min(cell.__col, colCount - 1)], type: WidthType.DXA },
    borders: cellBorders,
    shading: isHead ? { type: ShadingType.CLEAR, fill: COLOR_TABLE_HEAD } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      spacing: { after: 0 },
      children: renderInline(cell.tokens, { bold: isHead }),
    })],
  });

  const headerCells = headerRow.map((c, i) => {
    c.__col = i;
    return buildCell(c, true);
  });

  const tableRows = [new TableRow({ tableHeader: true, children: headerCells })];

  for (const row of bodyRows) {
    const rowCells = row.map((c, i) => {
      c.__col = i;
      return buildCell(c, false);
    });
    tableRows.push(new TableRow({ children: rowCells }));
  }

  children.push(new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths,
    rows: tableRows,
  }));
  // Spacing after table
  pushParagraph({ spacing: { after: 120 }, children: [new TextRun({ text: '' })] });
}

function renderHr() {
  pushParagraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: '' })],
  });
}

// ── Walk top-level tokens ───────────────────────────────────
for (const t of tokens) {
  switch (t.type) {
    case 'heading': renderHeading(t); break;
    case 'paragraph': renderParagraph(t); break;
    case 'list': renderList(t); break;
    case 'code': renderCode(t); break;
    case 'blockquote': renderBlockquote(t); break;
    case 'table': renderTable(t); break;
    case 'hr': renderHr(); break;
    case 'space': break;
    case 'html':
      // Skip HTML chunks (we're rendering markdown).
      break;
    default:
      if (t.text) {
        pushParagraph({ children: [new TextRun({ text: t.text, font: FONT_BODY })] });
      }
  }
}

// ── Build document ──────────────────────────────────────────
const baseFile = path.basename(inputPath);
const doc = new Document({
  creator: 'MatrixARC Diagnostic',
  title: baseFile.replace(/\.md$/, ''),
  styles: {
    default: {
      document: { run: { font: FONT_BODY, size: 22 } }, // 11pt body
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT_BODY, size: 36, bold: true, color: '1F3864' },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT_BODY, size: 30, bold: true, color: '2F5496' },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT_BODY, size: 26, bold: true, color: '2F5496' },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 },
      },
      {
        id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT_BODY, size: 22, bold: true, italics: true, color: '2F5496' },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 3 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
      {
        reference: 'numbers',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: baseFile.replace(/\.md$/, ''), italics: true, size: 18, color: '666666' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
            new TextRun({ text: ' of ', size: 18, color: '666666' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '666666' }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log('Wrote', outputPath, '(' + buf.length + ' bytes)');
}).catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
