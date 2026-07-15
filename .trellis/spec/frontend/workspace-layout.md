# Adaptive Workspace Layout

## 1. Scope / Trigger

Use this contract when adding, removing, reordering, resizing, collapsing, or persisting assistant workspace regions.

## 2. Signatures

```typescript
type WorkspaceFocusMode =
  | "balanced"
  | "camera-first"
  | "conversation-first";

type WorkspaceLayout = {
  version: 1;
  focusMode: WorkspaceFocusMode;
  panelOrder: readonly ["session" | "vision", "session" | "vision"];
  sessionWidthPercent: number;
  panelVisibility: {
    cost: boolean;
    usage: boolean;
    visualContext: boolean;
  };
};
```

The storage key is `assistant-workspace-layout-v1`.

## 3. Contracts

- Validate stored JSON at runtime before applying it.
- Panel order must contain each supported region exactly once.
- Session width is bounded to 28-55 percent.
- Stored layout data may contain presentation preferences only.
- Never store prompts, transcripts, images, audio, provider URLs, API keys, or session credentials with layout preferences.
- Desktop may support pointer drag and resizing; layouts at 980px or narrower use deterministic stacked regions.
- Every pointer-only layout operation needs a semantic button or range-input alternative.
- Storage read/write failure must fall back safely without blocking the assistant.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing storage | Use the default layout |
| Malformed JSON | Use the default layout |
| Unsupported version | Use the default layout |
| Duplicate or unknown panel ID | Use the default layout |
| Width below/above bounds | Clamp interactive updates; reject invalid stored objects |
| Storage denied or quota exceeded | Keep the in-memory layout and continue without persistence |
| Narrow viewport | Ignore freeform dragging and use the fixed stacked order |

## 5. Good / Base / Bad Cases

- Good: a desktop user selects conversation focus, resizes the control region with either pointer or keyboard, reloads, and receives the validated saved layout.
- Base: a first-time user receives the balanced default layout with all auxiliary panels visible.
- Bad: a mobile user must drag panels to reach session controls, or layout storage contains conversation content.

## 6. Tests Required

- Missing and malformed storage return the default.
- Duplicate panel IDs and unsupported versions are rejected.
- Width updates clamp to the documented range.
- Panel swaps are deterministic.
- UI verification covers focus-mode switching, panel visibility, reset, desktop resize/reorder, and narrow-screen fallback.

## 7. Wrong vs Correct

### Wrong

```typescript
const layout = JSON.parse(localStorage.getItem("layout") ?? "{}");
localStorage.setItem("layout", JSON.stringify({ layout, transcript }));
```

### Correct

```typescript
const layout = parseStoredWorkspaceLayout(
  localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY),
);

localStorage.setItem(
  WORKSPACE_LAYOUT_STORAGE_KEY,
  JSON.stringify(layout),
);
```
