# UI Action Button Rules

This project uses a strict action-button pattern for consistency and faster scanning.

## 1) Where `icon-only` is required
- Table row actions (view, copy, retry, delete).
- Pagination controls (`previous`, `next`).
- Compact utility actions in tight layouts (close, quick tools).

Requirements:
- Add `aria-label` and `title`.
- Keep touch target at least `36x36`.

## 2) Where `icon + text` is required
- Primary actions (`save`, `create`, `publish`, `dispatch`, `refresh`, `connect`).
- Destructive or state-changing actions (`disable`, `activate`, `delete`, `retry`).
- Toolbar actions above lists/tables/forms.

## 3) Allowed text-only exceptions
- Segmented controls and tabs (example: `Conversions API`, `Meta Pixel`).
- Binary mode toggles where label itself is the state value.
- Very short inline links (non-button navigation text links).

## 4) Visual semantics
- Use semantic tokens only (`--success*`, `--warning*`, `--danger*`, `--info*`, `--brand*`).
- Avoid hardcoded color classes or hex values for action states.

## 5) Accessibility
- Icons must be decorative (`aria-hidden=\"true\"`) when text exists.
- Icon-only buttons must have explicit accessible name (`aria-label`).

