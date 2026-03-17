# Masax Typst PDF Editor

Live PDF preview for `.typ` files in VS Code, powered by [masax-typst-pdf](https://github.com/nickkhanh/draw-pdf).

## Features

- **Live SVG Preview** — Edit `.typ` files, preview updates in real-time beside the editor
- **JSON Data Binding** — Handlebars templates (`{{name}}`) resolved from a JSON data panel, with built-in helpers (`formatCurrency`, `formatDate`, `eq`, `neq`)
- **Realtime JSON File Watch** — Link a `.json` file on disk; preview auto-updates whenever the file changes
- **Local Image Support** — Images referenced via relative paths (`./logo.png`) are read from disk and embedded automatically
- **HTTPS Image Support** — Images referenced via `https://` are fetched and embedded (with CORS proxy fallback)
- **PDF Export** — Compile and save PDF directly from VS Code
- **Console Output** — Real-time log/warn/error from the Typst WASM compiler
- **Auto Preview** — Preview opens automatically when you open a `.typ` file

## Architecture

The extension uses the same `masax-typst-pdf` library as the web version:

1. **Handlebars resolution** runs in the Node.js extension host (not in the webview) — template + JSON data are merged before sending to the preview
2. **Typst WASM compilation** runs in the webview — receives pure Typst markup (no Handlebars syntax), compiles to SVG/PDF
3. **Local images** are read from disk by the extension, base64-encoded, and preloaded into the WASM virtual filesystem
4. **HTTPS images** are fetched directly by the webview (with CORS proxy fallback via `allorigins.win`)

## Usage

### Preview

1. Open any `.typ` file — preview opens automatically beside the editor
2. Or use the keyboard shortcut / command palette:

| Action | Shortcut |
|---|---|
| Open Live Preview | `Ctrl+Shift+V` |
| Export PDF | `Ctrl+Shift+E` |
| Open JSON Data Panel | Command Palette |

Right-click in the editor or file explorer for context menu options.

### JSON Data Binding

Open the JSON Data panel, then either:

**A) Type directly** in the textarea:
```json
{
  "candidate": {
    "name": "Nguyen Van A",
    "position": "Software Engineer",
    "salary": 25000000
  }
}
```

**B) Load a `.json` file** — click **Load File**, select a file. The panel shows a green watch bar:

```
● data.json          [Unwatch]
```

The preview auto-updates every time the file is saved. Click **Unwatch** to stop.

In your `.typ` file, use Handlebars syntax:

```typst
= {{candidate.name}}
Vi tri: {{candidate.position}}
Luong: {{formatCurrency candidate.salary}}
```

#### Built-in Helpers

| Helper | Usage | Output |
|---|---|---|
| `formatCurrency` | `{{formatCurrency 25000000}}` | `25.000.000 ₫` |
| `formatDate` | `{{formatDate "2024-01-15"}}` | `15/1/2024` |
| `eq` | `{{#if (eq status "active")}}...{{/if}}` | Conditional block |
| `neq` | `{{#if (neq status "draft")}}...{{/if}}` | Conditional block |

### Local Images

Images referenced with relative paths are read directly from disk — no extra configuration needed:

```typst
#image("./logo.png")
#image("assets/photo.jpg")
```

### HTTPS Images

```typst
#image("https://example.com/banner.png")
```

External images are fetched automatically. If CORS blocks direct access, a proxy is used as fallback.

## Requirements

- VS Code 1.85.0+
- Internet connection (Typst WASM compiler loaded from CDN on first use)

## Development

```bash
# Build the web library first
cd draw-pdf
npm run build

# Then package the extension
cd typst-pdf-vscode
npm run package

# Install in VS Code: Ctrl+Shift+P → "Install from VSIX"
```

## Release Notes

### 0.0.1

- Live SVG preview with auto-open on `.typ` files
- JSON data panel with Handlebars template resolution (Node.js-side)
- Built-in Handlebars helpers: `formatCurrency`, `formatDate`, `eq`, `neq`
- Realtime JSON file watch (Load File)
- Local image embedding via VS Code filesystem API
- HTTPS image support with CORS proxy fallback
- PDF export with save dialog
- Real-time console output panel
- XSS-safe SVG rendering (strips `<script>` and `on*` attributes)
