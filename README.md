# Masax Typst PDF Editor

Live PDF preview for `.typ` files in VS Code, powered by [masax-typst-pdf](https://github.com/nickkhanh/draw-pdf).

## Features

- **Live SVG Preview** — Edit `.typ` files in VS Code, see the rendered output update in real-time
- **JSON Data Binding** — Handlebars templates (`{{name}}`) resolved from a JSON data panel
- **PDF Export** — Compile and save PDF directly from VS Code
- **Console Output** — Real-time log/warn/error from the Typst compiler
- **Auto Preview** — Preview opens automatically when you open a `.typ` file

## Usage

1. Open any `.typ` file
2. Preview opens automatically beside the editor
3. Use the toolbar icons or keyboard shortcuts:

| Action | Shortcut | Icon |
|---|---|---|
| Open Preview | `Ctrl+Shift+V` | Preview icon in title bar |
| Export PDF | `Ctrl+Shift+E` | PDF icon in title bar |
| JSON Data | Command Palette | JSON icon in title bar |

Right-click in the editor or file explorer for context menu options.

## Requirements

- VS Code 1.110.0+
- Internet connection (Typst WASM compiler loaded from CDN)

## Release Notes

### 0.0.1

Initial release with live preview, JSON data binding, and PDF export.
