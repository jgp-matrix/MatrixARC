# Project Kanban / Status System

Defines the columns, status colors, and routing logic that drive the project Kanban board in MatrixARC.

## Columns

```js
const order = ["draft","in_progress","evc","active","purchasing"];
const labels = {
  draft: "Draft",
  in_progress: "In Progress",
  evc: "Ready",
  active: "Active (Ready for Purchasing)",
  purchasing: "Purchasing In Progress"
};
```

## Status Colors

```js
statusColColors = {
  Draft: C.muted, "In Progress": C.yellow, Ready: C.green,
  "Active (Ready for Purchasing)": "#38bdf8",
  "Purchasing In Progress": "#f59e0b"
}
```

## Routing Logic

Project placement on the Kanban board is determined by:

- `bcPoStatus === "purchasing"` → **Purchasing In Progress** column
- `bcPoStatus === "Open"` → **Active (Ready for Purchasing)** column
- Otherwise → use the project's `status` field value
