import * as vscode from 'vscode';
import { getNonce, getTypstImportMap, CDN_BASE } from './shared';
import type { MasaxState } from '../extension';
import { outputChannel } from '../extension';

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
			outputChannel?.appendLine(`[Masax] Preview not ready yet, queuing update...`);
			this.pendingState = state;
			return;
		}
		const content = state.resolvedTypst || state.typstContent;
		const imgCount = state.localImages?.length || 0;
		outputChannel?.appendLine(`[Masax] → Sending to webview: ${content.length} chars, ${imgCount} image(s)`);
		this.panel.webview.postMessage({
			command: 'update',
			typstContent: content,
			localImages: state.localImages,
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
				outputChannel?.appendLine(`[Masax] Webview WASM compiler ready.`);
				this.ready = true;
				if (this.pendingState) {
					outputChannel?.appendLine(`[Masax] Flushing queued state to webview...`);
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
					outputChannel?.appendLine(`[Masax] PDF saved: ${uri.fsPath} (${buffer.byteLength} bytes)`);
					vscode.window.showInformationMessage(`PDF saved: ${uri.fsPath}`);
				}
				break;
			}

			case 'log':
				if (outputChannel) {
					outputChannel.appendLine(`[Webview] ${msg.text}`);
				}
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
		script-src 'nonce-${nonce}' ${webview.cspSource} ${CDN_BASE} 'wasm-unsafe-eval' 'unsafe-eval';
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

		/* Console area hidden — logs go to Output Channel "Masax Typst" */

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
		<!-- Logs go to Output Channel "Masax Typst" -->
	</div>

	${getTypstImportMap(nonce)}

	<script nonce="${nonce}" type="module">
		// Import compiler functions directly — template is already resolved by extension (Node.js) via injectData()
		import { initCompiler, compileTypstToSvg, compileTypstToPdf, preloadAsset, clearPreloadedAssets } from "${libUri}";

		const vscode = acquireVsCodeApi();
		const previewArea = document.getElementById('preview-area');
		const statusMsg = document.getElementById('status-msg');
		const loading = document.getElementById('loading');

		let currentTypst = '';

		// ---- Console capture → Output Channel ---- //
		function sendLog(type, text) {
			vscode.postMessage({ command: 'log', text: '[' + type.toUpperCase() + '] ' + text });
		}

		const origLog = console.log;
		const origWarn = console.warn;
		const origError = console.error;
		const origInfo = console.info;
		console.log = (...args) => { origLog.apply(console, args); sendLog('log', args.join(' ')); };
		console.warn = (...args) => { origWarn.apply(console, args); sendLog('warn', args.join(' ')); };
		console.error = (...args) => { origError.apply(console, args); sendLog('error', args.join(' ')); };
		console.info = (...args) => { origInfo.apply(console, args); sendLog('info', args.join(' ')); };

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
		let localImageCache = [];

		function applyLocalImages(images) {
			clearPreloadedAssets();
			for (const img of images || []) {
				try {
					const binaryStr = atob(img.data);
					const bytes = new Uint8Array(binaryStr.length);
					for (let i = 0; i < binaryStr.length; i++) {
						bytes[i] = binaryStr.charCodeAt(i);
					}
					preloadAsset(img.originalPath, bytes);
				} catch (e) {
					console.warn('Failed to preload image:', img.originalPath, e.message);
				}
			}
		}

		let renderTimer;
		async function renderPreview() {
			if (!currentTypst) {
				previewArea.innerHTML = '<div style="color:var(--vscode-descriptionForeground)">Open a .typ file and run "Masax: Open Live PDF Preview"</div>';
				return;
			}
			statusMsg.textContent = 'Rendering...';
			console.info('MasaxTypst: Starting SVG preview render...');
			try {
				applyLocalImages(localImageCache);
				const pages = await compileTypstToSvg(currentTypst);
				const pageArray = Array.isArray(pages) ? pages : [pages];

				previewArea.innerHTML = '';
				pageArray.forEach((pageSvg, i) => {
					const sanitized = sanitizeSvg(pageSvg);
					const pageContainer = document.createElement('div');
					pageContainer.style.cssText = 'position:relative; margin-bottom:20px;';
					pageContainer.innerHTML = sanitized;

					const svg = pageContainer.querySelector('svg');
					if (svg) {
						svg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
						svg.style.backgroundColor = '#fff';
						svg.style.display = 'block';
						svg.style.maxWidth = '100%';
					}

					// Page label
					const label = document.createElement('div');
					label.textContent = 'Page ' + (i + 1) + ' / ' + pageArray.length;
					label.style.cssText = 'text-align:center; font-size:0.7rem; color:var(--vscode-descriptionForeground); margin-top:4px; margin-bottom:12px;';
					pageContainer.appendChild(label);

					previewArea.appendChild(pageContainer);
				});

				statusMsg.textContent = pageArray.length + ' page(s) — Ready';
				console.info('MasaxTypst: SVG preview rendered successfully. ' + pageArray.length + ' page(s).');
			} catch (err) {
				statusMsg.textContent = 'Render error';
				console.error('MasaxTypst: Render failed:', err.message);
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
			console.info('MasaxTypst: Starting PDF export...');
			try {
				applyLocalImages(localImageCache);
				const pdfBlob = await compileTypstToPdf(currentTypst);
				const reader = new FileReader();
				reader.onload = () => {
					const base64 = reader.result.split(',')[1];
					vscode.postMessage({ command: 'savePDF', data: base64 });
					statusMsg.textContent = 'PDF exported';
					console.info('MasaxTypst: PDF export complete.');
				};
				reader.readAsDataURL(pdfBlob);
			} catch (err) {
				statusMsg.textContent = 'Export failed';
				console.error('MasaxTypst: PDF export error:', err.message);
			}
		});

		// ---- Handle messages from extension ---- //
		window.addEventListener('message', (event) => {
			const msg = event.data;
			switch (msg.command) {
				case 'update':
					console.info('MasaxTypst: Received update from extension.');
					currentTypst = msg.typstContent || currentTypst;
					localImageCache = msg.localImages || localImageCache;
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
