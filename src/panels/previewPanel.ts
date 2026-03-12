import * as vscode from 'vscode';
import { getNonce, getTypstImportMap, CDN_BASE } from './shared';
import type { MasaxState } from '../extension';

export class PreviewPanel {
	static readonly viewType = 'masaxPreview';

	private panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];
	private ready = false;
	private pendingState: MasaxState | undefined;

	constructor(
		private context: vscode.ExtensionContext,
		initialState: MasaxState,
		private onDispose: (panel: PreviewPanel) => void,
		existingPanel?: vscode.WebviewPanel,
	) {
		if (existingPanel) {
			this.panel = existingPanel;
		} else {
			this.panel = vscode.window.createWebviewPanel(
				PreviewPanel.viewType,
				'Typst Preview',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						vscode.Uri.joinPath(context.extensionUri, 'media'),
					],
				}
			);
		}

		this.panel.webview.html = this.getHtml(this.panel.webview);

		this.panel.webview.onDidReceiveMessage(
			(msg) => this.handleMessage(msg),
			undefined,
			this.disposables,
		);

		this.panel.onDidDispose(() => {
			this.disposables.forEach(d => d.dispose());
			this.disposables = [];
			this.onDispose(this);
		}, null, this.disposables);

		this.pendingState = initialState;
	}

	reveal() {
		this.panel.reveal(vscode.ViewColumn.Beside);
	}

	update(state: MasaxState) {
		if (!this.ready) {
			this.pendingState = state;
			return;
		}
		this.panel.webview.postMessage({
			command: 'update',
			typstContent: state.typstContent,
			jsonData: state.jsonData,
		});
	}

	requestExport() {
		if (this.ready) {
			this.panel.webview.postMessage({ command: 'exportPDF' });
		}
	}

	dispose() {
		this.panel.dispose();
		// disposables are cleaned up in onDidDispose handler
	}

	private async handleMessage(msg: { command: string; data?: string; text?: string }) {
		switch (msg.command) {
			case 'ready':
				this.ready = true;
				if (this.pendingState) {
					this.update(this.pendingState);
					this.pendingState = undefined;
				}
				break;

			case 'savePDF': {
				const uri = await vscode.window.showSaveDialog({
					filters: { 'PDF Files': ['pdf'] },
					defaultUri: vscode.Uri.file('output.pdf'),
				});
				if (uri && msg.data) {
					const buffer = Buffer.from(msg.data, 'base64');
					await vscode.workspace.fs.writeFile(uri, buffer);
					vscode.window.showInformationMessage(`PDF saved: ${uri.fsPath}`);
				}
				break;
			}

			case 'log':
				console.log('[Masax Webview]', msg.text);
				break;
		}
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();

		// Load thư viện từ local media (bundled với extension) thay vì CDN
		// Đảm bảo extension dùng cùng version code với browser (bao gồm tất cả fix)
		const libUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'masax-typst-pdf.full.js')
		);

		return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		script-src 'nonce-${nonce}' ${webview.cspSource} ${CDN_BASE};
		style-src 'unsafe-inline';
		font-src ${CDN_BASE} data:;
		connect-src ${CDN_BASE} https://api.allorigins.win;
		img-src ${webview.cspSource} https: data:;
		worker-src blob:;
		child-src blob:;
	" />
	<style>
		* { box-sizing: border-box; }
		html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden;
			background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
		}
		#root { display:flex; flex-direction:column; height:100vh; }

		/* Preview area */
		#preview-area {
			flex: 3; overflow:auto; padding: 20px;
			background: var(--vscode-editorWidget-background, #1e1e1e);
			display: flex; flex-direction: column; align-items: center;
		}
		#preview-area svg {
			box-shadow: 0 2px 8px rgba(0,0,0,0.3); margin-bottom: 16px;
			background: #fff; max-width: 100%;
		}

		/* Status bar */
		#status-bar {
			padding: 4px 12px;
			background: var(--vscode-statusBar-background);
			color: var(--vscode-statusBar-foreground);
			font-size: 0.75rem; display:flex; justify-content:space-between; align-items:center;
			border-top: 1px solid var(--vscode-panel-border);
			flex-shrink: 0;
		}
		#status-bar button {
			padding: 2px 10px; border:none; border-radius: 2px; cursor:pointer;
			font-size: 0.75rem;
			background: var(--vscode-button-background); color: var(--vscode-button-foreground);
		}
		#status-bar button:hover { background: var(--vscode-button-hoverBackground); }

		/* Console */
		#console-area {
			flex: 1; overflow:auto; min-height: 80px; max-height: 200px;
			background: var(--vscode-panel-background);
			border-top: 1px solid var(--vscode-panel-border);
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.75rem;
		}
		.console-row { padding: 2px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
		.console-row.error { color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground); }
		.console-row.warn { color: var(--vscode-editorWarning-foreground); }
		.console-row.info { color: var(--vscode-editorInfo-foreground); }

		/* Loading overlay */
		#loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
			background: var(--vscode-editor-background); z-index: 100; font-size: 0.9rem;
			color: var(--vscode-descriptionForeground);
		}
		#loading.hidden { display: none; }

		/* Error state */
		.preview-error {
			color: var(--vscode-errorForeground);
			background: var(--vscode-inputValidation-errorBackground);
			padding: 12px; border-radius: 4px; white-space: pre-wrap; max-width: 600px;
		}
	</style>
</head>
<body>
	<div id="root">
		<div id="loading">Loading Typst WASM compiler...</div>
		<div id="preview-area"></div>
		<div id="status-bar">
			<span id="status-msg">Initializing...</span>
			<button id="btn-export">Export PDF</button>
		</div>
		<div id="console-area"></div>
	</div>

	${getTypstImportMap(nonce)}

	<script nonce="${nonce}" type="module">
		// Import the core library (generator only, no UI)
		import { MasaxTypstPDF, initCompiler, defaultResolver } from "${libUri}";

		const vscode = acquireVsCodeApi();
		const previewArea = document.getElementById('preview-area');
		const consoleArea = document.getElementById('console-area');
		const statusMsg = document.getElementById('status-msg');
		const loading = document.getElementById('loading');

		const generator = new MasaxTypstPDF();
		let currentTypst = '';
		let currentJson = '{}';

		// ---- Console capture ---- //
		function appendConsole(type, text) {
			const row = document.createElement('div');
			row.className = 'console-row ' + type;
			row.textContent = '[' + type.toUpperCase() + '] ' + text;
			consoleArea.appendChild(row);
			consoleArea.scrollTop = consoleArea.scrollHeight;
			// Keep max 200 rows
			while (consoleArea.children.length > 200) {
				consoleArea.removeChild(consoleArea.firstChild);
			}
		}

		const origLog = console.log;
		const origWarn = console.warn;
		const origError = console.error;
		const origInfo = console.info;
		console.log = (...args) => { origLog.apply(console, args); appendConsole('log', args.join(' ')); };
		console.warn = (...args) => { origWarn.apply(console, args); appendConsole('warn', args.join(' ')); };
		console.error = (...args) => { origError.apply(console, args); appendConsole('error', args.join(' ')); };
		console.info = (...args) => { origInfo.apply(console, args); appendConsole('info', args.join(' ')); };

		// ---- Sanitize SVG ---- //
		function sanitizeSvg(svgString) {
			const doc = new DOMParser().parseFromString('<div>' + svgString + '</div>', 'text/html');
			doc.querySelectorAll('script').forEach(el => el.remove());
			doc.querySelectorAll('*').forEach(el => {
				Array.from(el.attributes).forEach(attr => {
					if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
				});
			});
			return doc.body.querySelector('div').innerHTML;
		}

		// ---- Render preview ---- //
		let renderTimer;
		async function renderPreview() {
			if (!currentTypst) {
				previewArea.innerHTML = '<div style="color:var(--vscode-descriptionForeground)">Open a .typ file and run "Masax: Open Live PDF Preview"</div>';
				return;
			}
			statusMsg.textContent = 'Rendering...';
			try {
				// Resolve Handlebars data
				const data = JSON.parse(currentJson);
				const resolved = defaultResolver.resolve(currentTypst, data);

				generator.loadBlueprint({ typstTemplate: resolved });
				const svgResult = await generator.generateSVG({});

				const sanitized = sanitizeSvg(svgResult);
				previewArea.innerHTML = sanitized;

				// Style each SVG page
				previewArea.querySelectorAll('svg').forEach(svg => {
					svg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
					svg.style.marginBottom = '16px';
					svg.style.backgroundColor = '#fff';
				});
				statusMsg.textContent = 'Ready';
			} catch (err) {
				statusMsg.textContent = 'Render error';
				const errDiv = document.createElement('div');
				errDiv.className = 'preview-error';
				errDiv.textContent = err.message;
				previewArea.innerHTML = '';
				previewArea.appendChild(errDiv);
			}
		}

		function scheduleRender() {
			clearTimeout(renderTimer);
			renderTimer = setTimeout(renderPreview, 100);
		}

		// ---- Init ---- //
		try {
			await initCompiler();
			loading.classList.add('hidden');
			statusMsg.textContent = 'WASM ready';
			console.info('Typst WASM compiler ready');
			vscode.postMessage({ command: 'ready' });
		} catch (err) {
			loading.textContent = 'Failed to load Typst WASM: ' + err.message;
			console.error('Init failed:', err.message);
		}

		// ---- Export PDF ---- //
		document.getElementById('btn-export').addEventListener('click', async () => {
			statusMsg.textContent = 'Exporting PDF...';
			try {
				const data = JSON.parse(currentJson);
				const resolved = defaultResolver.resolve(currentTypst, data);
				generator.loadBlueprint({ typstTemplate: resolved });
				const pdfBlob = await generator.generatePDF({});
				const reader = new FileReader();
				reader.onload = () => {
					const base64 = reader.result.split(',')[1];
					vscode.postMessage({ command: 'savePDF', data: base64 });
					statusMsg.textContent = 'PDF exported';
				};
				reader.readAsDataURL(pdfBlob);
			} catch (err) {
				statusMsg.textContent = 'Export failed';
				console.error('PDF export error:', err.message);
			}
		});

		// ---- Handle messages from extension ---- //
		window.addEventListener('message', (event) => {
			const msg = event.data;
			switch (msg.command) {
				case 'update':
					currentTypst = msg.typstContent || currentTypst;
					currentJson = msg.jsonData || currentJson;
					scheduleRender();
					break;
				case 'exportPDF':
					document.getElementById('btn-export').click();
					break;
			}
		});
	</script>
</body>
</html>`;
	}
}
