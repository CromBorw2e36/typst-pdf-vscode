# Masax Typst PDF Editor

Live PDF preview for `.typ` files in VS Code, powered by [masax-typst-pdf](https://github.com/nickkhanh/draw-pdf).

## Features

- **Live SVG Preview** — Edit `.typ` files in VS Code, see the rendered output update in real-time
- **JSON Data Binding** — Handlebars templates (`{{name}}`) resolved from a JSON data panel
- **PDF Export** — Compile and save PDF directly from VS Code
- **Console Output** — Real-time log/warn/error from the Typst compiler
- **Auto Preview** — Preview opens automatically when you open a `.typ` file
- **HTTPS Image Support** — Images referenced via `https://` are automatically fetched and embedded

## Usage

1. Open any `.typ` file
2. Preview opens automatically beside the editor
3. Use the toolbar icons or keyboard shortcuts:

| Action | Shortcut | Icon |
|---|---|---|
| Open Preview | `Ctrl+Shift+V` | Preview icon in title bar |
| Export PDF | `Ctrl+Shift+E` | PDF icon in title bar |
| JSON Data | — | JSON icon in title bar |

Right-click in the editor or file explorer for context menu options.

## JSON Data Binding

Open the JSON Data panel and enter your data object. The template is re-rendered automatically on every change.

```json
{
  "candidate": {
    "name": "Nguyen Van A",
    "position": "Software Engineer"
  }
}
```

In your `.typ` file, use Handlebars syntax:

```
= {{candidate.name}}
Vị trí: {{candidate.position}}
```

## Requirements

- VS Code 1.85.0+
- Internet connection (Typst WASM compiler loaded from CDN)

## Release Notes

### 0.0.1

Initial release with live preview, JSON data binding, PDF export, and bundled library for consistent rendering.
