# Masax Typst PDF Editor

Live PDF preview for `.typ` files in VS Code, powered by [typst-pdf](https://github.com/CromBorw2e36/typst-pdf-vscode).

## Features

- **Live SVG Preview** — Edit `.typ` files, preview updates in real-time beside the editor
- **JSON Data Injection** — Use `{{DATA}}` placeholder + Typst-native scripting (`#if`, `#for`, `#let`)
- **Realtime JSON File Watch** — Link a `.json` file on disk; preview auto-updates whenever the file changes
- **Local Image Support** — Images referenced via relative paths (`./logo.png`) are read from disk and embedded automatically
- **HTTPS Image Support** — Images referenced via `https://` are fetched and embedded (with CORS proxy fallback)
- **PDF Export** — Compile and save PDF directly from VS Code
- **Output Channel Logging** — All logs go to the "Masax Typst" Output Channel (View → Output)
- **Auto Preview** — Preview opens automatically when you open a `.typ` file
- **Cross-platform** — Same `injectData()` logic works in any engine (Flutter, .NET, Java...)

## Architecture

```
.typ template + JSON data
       │
       ▼
  injectData(template, json)     ← Extension host (Node.js)
  = template.replace("{{DATA}}", escapedJson)
       │
       ▼
  Pure Typst markup              ← No Handlebars, no eval()
       │
       ▼
  Typst WASM compile → SVG/PDF  ← Webview
```

1. **Data injection** runs in the Node.js extension host — simple string replace, no `eval()` or `new Function()`
2. **Typst WASM compilation** runs in the webview — receives pure Typst markup, compiles to SVG/PDF
3. **Local images** are read from disk by the extension host, base64-encoded, and preloaded into the WASM virtual filesystem
4. **HTTPS images** are fetched by the extension host (Node.js — no CORS restrictions), base64-encoded, and preloaded into VFS
5. **Image errors never break compilation** — if an image fetch fails (e.g. HTTP 522, timeout), it is skipped with a warning log
6. **Detailed logging** — full pipeline logged to Output Channel "Masax Typst" (`[Masax]` for host, `[Webview]` for WASM)

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

### Template Syntax

Templates use Typst-native scripting with a `{{DATA}}` placeholder for JSON injection:

```typst
#let data = json(bytes("{{DATA}}"))
#let candidate = data.candidate

= #candidate.name
Position: #candidate.position

#if candidate.salary > 20000000 [
  *Senior level*
]

#for skill in data.skills [
  - #skill \
]
```

### JSON Data Binding

Open the JSON Data panel, then either:

**A) Type directly** in the textarea:
```json
{
  "candidate": {
    "name": "Nguyen Van A",
    "position": "Software Engineer",
    "salary": 25000000
  },
  "skills": ["JavaScript", "Typst", "Rust"]
}
```

**B) Load a `.json` file** — click **Load File**, select a file. The panel shows a green watch bar:

```
● data.json          [Unwatch]
```

The preview auto-updates every time the file is saved. Click **Unwatch** to stop.

### What you can do in Typst templates

| Feature | Example |
|---|---|
| Variables | `#data.name` |
| Conditions | `#if data.score > 20 [Pass] else [Fail]` |
| Loops | `#for item in data.items [#item.name]` |
| Math | `#(data.price * data.qty)` |
| AND/OR | `#if data.a and data.b [...]` |
| Comparison | `#if data.age >= 18 [Adult]` |
| Default values | `#data.at("name", default: "N/A")` |
| Functions | `#let total = data.items.map(i => i.price).sum()` |

### Local Images

```typst
#image("./logo.png")
#image("assets/photo.jpg")
```

### HTTPS Images

```typst
#image("https://example.com/banner.png")
```

External images are fetched automatically. If CORS blocks direct access, a proxy is used as fallback.

### Logging

All logs go to **"Masax Typst"** Output Channel:

1. Open Output panel: `Ctrl+Shift+U`
2. Select **"Masax Typst"** from the dropdown

Example output:
```
[Masax] --- Update from editor: candidate-evaluation.typ ---
[Masax] Document dir: K:\Project\templates
[Masax] Template length: 5832 chars
[Masax] Resolving images from: K:\Project\templates
[Masax] Image fetched: https://cdn.com/logo.png (15234 bytes)
[Masax] Local image loaded: ./photo.png (8421 bytes)
[Masax] Resolved 2 image(s) total.
[Masax] Resolving template... (JSON data: 1245 chars)
[Masax] Injecting JSON data into template...
[Masax] Data injected successfully.
[Masax] Resolved Typst length: 6890 chars
[Masax] → Sending to webview: 6890 chars, 2 image(s)
[Masax] Webview WASM compiler ready.
[Webview] [INFO] MasaxTypst: Resolving images...
[Webview] [LOG] MasaxTypst: Using preloaded asset -> https://cdn.com/logo.png
[Webview] [LOG] MasaxTypst: Using preloaded asset -> ./photo.png
[Webview] [INFO] MasaxTypst: Image resolution complete.
[Webview] [INFO] MasaxTypst: Compiling Typst → SVG...
[Webview] [INFO] MasaxTypst: SVG preview rendered successfully.
[Masax] PDF saved: K:\output.pdf (45678 bytes)
```

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
### 0.0.5

- Zero runtime dependencies
- Fixed `json.decode` deprecation — switched to `json(bytes("{{DATA}}"))` (Typst 0.15+ compatible)
- HTTPS images now fetched by extension host (Node.js) — no CORS issues, no project root restriction
- Detailed pipeline logging: template resolution, image fetching, data injection, compilation — all in Output Channel

### 0.0.4

- Removed Handlebars — switched to Typst-native data injection via `{{DATA}}` placeholder
- No more `unsafe-eval` CSP issues
- Cross-platform: same `injectData()` logic works in any engine
- Bundle size reduced: vsix from 1.4MB to 270KB, full.js from 751KB to 605KB

### 0.0.3

- Output Channel logging — all logs go to "Masax Typst" Output Channel
- Robust image error handling
- Extension icon

### 0.0.2

- Output Channel logging
- Robust image error handling
- Extension icon

### 0.0.1

- Live SVG preview with auto-open on `.typ` files
- JSON data panel
- Local image embedding
- HTTPS image support with CORS proxy fallback
- PDF export
- XSS-safe SVG rendering
