const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak
} = require("docx");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function heading(text, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Arial",
      size: level === HeadingLevel.HEADING_1 ? 36 : level === HeadingLevel.HEADING_2 ? 28 : 24
    })]
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, font: "Arial", size: 22, ...opts.run })]
  });
}

function bullet(text, ref = "bullets", level = 0) {
  return new Paragraph({
    numbering: { reference: ref, level },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 22 })]
  });
}

function codeLine(text) {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 360 },
    children: [new TextRun({ text, font: "Consolas", size: 20, color: "2E4057" })]
  });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 80 }, children: [] });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1A3A5C" },
        paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E5984" },
        paragraph: { spacing: { before: 240, after: 180 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "3A7AB5" },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers2", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers3", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
      { reference: "numbers4", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ]},
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Claude Dev Team — Quick Start Guide", font: "Arial", size: 18, color: "888888", italics: true })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" })
          ]
        })]
      })
    },
    children: [
      // Title
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: "CLAUDE DEV TEAM", font: "Arial", size: 48, bold: true, color: "1A3A5C" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [new TextRun({ text: "Quick Start Guide", font: "Arial", size: 32, color: "2E5984" })]
      }),

      // Intro
      para("A 3-role workflow for Claude: Implementer (codes), Architect (reviews), Analyst (strategy). Each role runs in its own Claude session. The Implementer orchestrates."),

      // Separator
      new Paragraph({
        spacing: { before: 240, after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E5984", space: 1 } },
        children: []
      }),

      // REQUIREMENTS
      heading("Requirements", HeadingLevel.HEADING_1),
      bullet("Claude Code Desktop or Claude Code Terminal (for the Implementer)"),
      bullet("A second Claude Code session (for the Architect)"),
      bullet("Claude.ai browser (strongly recommended for the Analyst)"),
      emptyLine(),

      // Callout box for analyst recommendation
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({
          children: [new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: "2E5984" },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: "2E5984" },
              left: { style: BorderStyle.SINGLE, size: 8, color: "2E5984" },
              right: { style: BorderStyle.SINGLE, size: 2, color: "2E5984" },
            },
            shading: { fill: "EBF2FA", type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            width: { size: 9360, type: WidthType.DXA },
            children: [
              new Paragraph({ spacing: { after: 80 }, children: [
                new TextRun({ text: "WHY BROWSER FOR THE ANALYST?", font: "Arial", size: 22, bold: true, color: "1A3A5C" })
              ]}),
              new Paragraph({ spacing: { after: 60 }, children: [
                new TextRun({ text: "The Analyst should NOT have direct file access. This separation is intentional — without access to the codebase, the Analyst provides unbiased strategic analysis, catches assumptions the code-facing roles miss, and acts as a genuine third-party perspective.", font: "Arial", size: 20 })
              ]}),
              new Paragraph({ children: [
                new TextRun({ text: "If the Analyst can read the code, they tend to anchor on implementation details instead of questioning them. A Claude Code session CAN be used, but you lose this separation benefit.", font: "Arial", size: 20 })
              ]})
            ]
          })]
        })]
      }),

      bullet("A git repo as your working directory"),
      emptyLine(),

      // FIRST-TIME SETUP
      heading("First-Time Setup", HeadingLevel.HEADING_1),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 },
        children: [new TextRun({ text: "Open Claude Code Desktop (or Terminal) in your project repo.", font: "Arial", size: 22 })] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 },
        children: [
          new TextRun({ text: "Type:  ", font: "Arial", size: 22 }),
          new TextRun({ text: "/team-setup", font: "Consolas", size: 22, bold: true, color: "2E4057" })
        ] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 },
        children: [new TextRun({ text: "Answer the prompts: team name, role names, environments. (Defaults are fine — you can reconfigure anytime with /team-setup)", font: "Arial", size: 22 })] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 120 },
        children: [new TextRun({ text: "The wizard creates .claude/team-config.json and offers to generate template handoff files.", font: "Arial", size: 22 })] }),
      emptyLine(),

      // STARTING A SESSION
      heading("Starting a Session", HeadingLevel.HEADING_1),
      new Paragraph({ numbering: { reference: "numbers2", level: 0 }, spacing: { after: 60 },
        children: [new TextRun({ text: "Open a fresh Claude Code Desktop (or Terminal) session.", font: "Arial", size: 22 })] }),
      new Paragraph({ numbering: { reference: "numbers2", level: 0 }, spacing: { after: 60 },
        children: [
          new TextRun({ text: "Type:  ", font: "Arial", size: 22 }),
          new TextRun({ text: "/team-startup", font: "Consolas", size: 22, bold: true, color: "2E4057" })
        ] }),
      new Paragraph({ numbering: { reference: "numbers2", level: 0 }, spacing: { after: 60 },
        children: [new TextRun({ text: "Follow the checklist:", font: "Arial", size: 22 })] }),
      bullet("Copy the Architect paste → into your Architect’s Claude session", "bullets", 1),
      bullet("Copy the Analyst paste → into your Analyst’s Claude session", "bullets", 1),
      bullet("Confirm both are up", "bullets", 1),
      bullet("Verify all three report the same version + work item", "bullets", 1),
      new Paragraph({ numbering: { reference: "numbers2", level: 0 }, spacing: { after: 120 },
        children: [new TextRun({ text: "Give your first work instruction. You’re live.", font: "Arial", size: 22 })] }),
      emptyLine(),

      // ENDING A SESSION
      heading("Ending a Session", HeadingLevel.HEADING_1),
      new Paragraph({ numbering: { reference: "numbers3", level: 0 }, spacing: { after: 60 },
        children: [
          new TextRun({ text: "In the Implementer session, type:  ", font: "Arial", size: 22 }),
          new TextRun({ text: "/team-closeout", font: "Consolas", size: 22, bold: true, color: "2E4057" })
        ] }),
      new Paragraph({ numbering: { reference: "numbers3", level: 0 }, spacing: { after: 60 },
        children: [new TextRun({ text: "Follow the checklist:", font: "Arial", size: 22 })] }),
      bullet("Commits, merges, deploys happen automatically", "bullets", 1),
      bullet("Approve TODO updates when prompted", "bullets", 1),
      bullet("Approve handoff file updates when prompted", "bullets", 1),
      new Paragraph({ numbering: { reference: "numbers3", level: 0 }, spacing: { after: 60 },
        children: [
          new TextRun({ text: "When all checks pass, type:  ", font: "Arial", size: 22 }),
          new TextRun({ text: "Closed", font: "Consolas", size: 22, bold: true, color: "2E4057" })
        ] }),
      new Paragraph({ numbering: { reference: "numbers3", level: 0 }, spacing: { after: 120 },
        children: [new TextRun({ text: "All sessions are safe to close.", font: "Arial", size: 22 })] }),
      emptyLine(),

      // BETWEEN SESSIONS
      heading("Between Sessions", HeadingLevel.HEADING_1),
      para("Nothing to do. The closeout wrote everything to handoff files. Next /team-startup reads them and everyone picks up where you left off."),
      emptyLine(),

      // TIPS
      heading("Tips", HeadingLevel.HEADING_1),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3200, 6160],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, margins: cellMargins,
              shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: "\"stop handholding\"", font: "Consolas", size: 20 })] })] }),
            new TableCell({ borders, width: { size: 6160, type: WidthType.DXA }, margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: "Turns off guided tips permanently", font: "Arial", size: 20 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, margins: cellMargins,
              shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: "/team-setup", font: "Consolas", size: 20 })] })] }),
            new TableCell({ borders, width: { size: 6160, type: WidthType.DXA }, margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: "Reconfigure names/environments anytime", font: "Arial", size: 20 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, margins: cellMargins,
              shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: "Copy-paste", font: "Arial", size: 20, bold: true })] })] }),
            new TableCell({ borders, width: { size: 6160, type: WidthType.DXA }, margins: cellMargins,
              children: [new Paragraph({ children: [new TextRun({ text: "The human facilitator relays messages between sessions via copy-paste", font: "Arial", size: 20 })] })] }),
          ]}),
        ]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("Claude-Dev-Team-Quick-Start.docx", buffer);
  console.log("Created: Claude-Dev-Team-Quick-Start.docx");
});
