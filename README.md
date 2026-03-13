# Masax Typst PDF Editor

Live PDF preview for `.typ` files in VS Code, powered by [masax-typst-pdf](https://github.com/nickkhanh/draw-pdf).

## Features

- **Live SVG Preview** — Edit `.typ` files, preview updates in real-time beside the editor
- **JSON Data Binding** — Handlebars templates (`{{name}}`) resolved from a JSON data panel
- **Realtime JSON File Watch** — Link a `.json` file on disk; preview auto-updates whenever the file changes
- **Local Image Support** — Images referenced via relative paths (`./logo.png`) are read from disk and embedded automatically
- **HTTPS Image Support** — Images referenced via `https://` are fetched and embedded (with CORS proxy fallback)
- **PDF Export** — Compile and save PDF directly from VS Code
- **Console Output** — Real-time log/warn/error from the Typst WASM compiler
- **Auto Preview** — Preview opens automatically when you open a `.typ` file

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
    "position": "Software Engineer"
  }
}
```

**B) Load a `.json` file** — click **📂 Load File**, select a file. The panel shows a green watch bar:

```
● data.json          [Unwatch]
```

The preview auto-updates every time the file is saved. Click **Unwatch** to stop.

In your `.typ` file, use Handlebars syntax:

```typst
= {{candidate.name}}
Vị trí: {{candidate.position}}
```

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

## Release Notes

### 0.0.1

- Live SVG preview with auto-open on `.typ` files
- JSON data panel with Handlebars template resolution
- Realtime JSON file watch (`📂 Load File`)
- Local image embedding via VS Code filesystem API
- HTTPS image support with CORS proxy fallback
- PDF export with save dialog
- Real-time console output panel
- XSS-safe SVG rendering (strips `<script>` and `on*` attributes)
