import * as vscode from 'vscode';
import { getNonce } from './shared';
import type { MasaxState } from '../extension';

export class DataPanel {
	static readonly viewType = 'masaxData';

	private panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private context: vscode.ExtensionContext,
		initialState: MasaxState,
		private onDispose: (panel: DataPanel) => void,
		private onDataChange: (json: string) => void,
		private onLoadFile: () => void,
		private onUnwatchFile: () => void,
		existingPanel?: vscode.WebviewPanel,
	) {
		if (existingPanel) {
			this.panel = existingPanel;
		} else {
			this.panel = vscode.window.createWebviewPanel(
				DataPanel.viewType,
				'Typst JSON Data',
				vscode.ViewColumn.Beside,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				}
			);
		}

		this.panel.webview.html = this.getHtml(initialState.jsonData, initialState.watchedJsonFile);

		this.panel.webview.onDidReceiveMessage(
			(msg) => {
				if (msg.command === 'dataChanged') {
					this.onDataChange(msg.data);
				} else if (msg.command === 'loadFile') {
					this.onLoadFile();
				} else if (msg.command === 'unwatchFile') {
					this.onUnwatchFile();
				}
			},
			undefined,
			this.disposables,
		);

		this.panel.onDidDispose(() => {
			this.disposables.forEach(d => d.dispose());
			this.disposables = [];
			this.onDispose(this);
		}, null, this.disposables);
	}

	reveal() {
		this.panel.reveal(vscode.ViewColumn.Beside);
	}

	/** Cập nhật nội dung JSON từ file đang được watch */
	setData(json: string, watchedFile?: string) {
		this.panel.webview.postMessage({ command: 'setData', data: json, watchedFile });
	}

	dispose() {
		this.panel.dispose();
	}

	private getHtml(initialJson: string, watchedFile?: string): string {
		const nonce = getNonce();
		const escapedJson = initialJson
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		const escapedFile = (watchedFile || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

		return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		script-src 'nonce-${nonce}';
		style-src 'unsafe-inline';
	" />
	<style>
		* { box-sizing: border-box; }
		html, body { margin:0; padding:0; width:100%; height:100%;
			background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
		}
		#root { display:flex; flex-direction:column; height:100vh; }
		.toolbar {
			padding: 6px 10px; display:flex; justify-content:space-between; align-items:center;
			background: var(--vscode-sideBarSectionHeader-background);
			border-bottom: 1px solid var(--vscode-panel-border);
			flex-shrink: 0; font-size: 0.8rem; font-weight: 600;
			gap: 6px;
		}
		.toolbar-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.toolbar-actions { display:flex; gap: 6px; flex-shrink: 0; }
		.toolbar button {
			padding: 2px 10px; border:none; border-radius:2px; cursor:pointer;
			font-size: 0.75rem;
			background: var(--vscode-button-background); color: var(--vscode-button-foreground);
			white-space: nowrap;
		}
		.toolbar button:hover { background: var(--vscode-button-hoverBackground); }
		.toolbar button.secondary {
			background: var(--vscode-button-secondaryBackground, #3a3d41);
			color: var(--vscode-button-secondaryForeground, #cccccc);
		}
		.toolbar button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
		#watch-bar {
			padding: 4px 10px; font-size: 0.72rem; display: none; flex-shrink: 0;
			align-items: center; gap: 8px;
			background: var(--vscode-diffEditor-insertedTextBackground, rgba(0,128,0,0.15));
			border-bottom: 1px solid var(--vscode-panel-border);
			color: var(--vscode-foreground);
		}
		#watch-bar.visible { display: flex; }
		#watch-bar .dot { width:7px; height:7px; border-radius:50%; background:#4ec94e; flex-shrink:0; }
		#watch-bar .filepath { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:0.8; }
		#watch-bar button {
			padding: 1px 8px; border:none; border-radius:2px; cursor:pointer; font-size:0.7rem;
			background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
			flex-shrink: 0;
		}
		#json-editor {
			flex:1; width:100%; border:none; resize:none; padding: 10px;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: var(--vscode-editor-font-size, 13px);
			outline: none; tab-size: 2;
		}
		#json-editor.readonly { opacity: 0.75; cursor: default; }
		#error-msg {
			padding: 4px 10px; font-size: 0.75rem;
			color: var(--vscode-errorForeground);
			background: var(--vscode-inputValidation-errorBackground);
			display: none; flex-shrink: 0;
		}
		#error-msg.visible { display: block; }
	</style>
</head>
<body>
	<div id="root">
		<div class="toolbar">
			<span class="toolbar-title">JSON Data</span>
			<div class="toolbar-actions">
				<button id="btn-load">📂 Load File</button>
				<button id="btn-format" class="secondary">Format</button>
			</div>
		</div>
		<div id="watch-bar" class="${escapedFile ? 'visible' : ''}">
			<span class="dot"></span>
			<span class="filepath" id="watch-path" title="${escapedFile}">${escapedFile}</span>
			<button id="btn-unwatch">Unwatch</button>
		</div>
		<div id="error-msg"></div>
		<textarea id="json-editor" spellcheck="false">${escapedJson}</textarea>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const editor = document.getElementById('json-editor');
		const errorMsg = document.getElementById('error-msg');
		const watchBar = document.getElementById('watch-bar');
		const watchPath = document.getElementById('watch-path');

		let isWatching = ${watchedFile ? 'true' : 'false'};
		let debounceTimer;

		function setWatching(filePath) {
			isWatching = !!filePath;
			editor.classList.toggle('readonly', isWatching);
			editor.readOnly = isWatching;
			if (filePath) {
				watchPath.textContent = filePath;
				watchPath.title = filePath;
				watchBar.classList.add('visible');
			} else {
				watchBar.classList.remove('visible');
			}
		}

		function validate() {
			try {
				JSON.parse(editor.value);
				errorMsg.classList.remove('visible');
				return true;
			} catch (e) {
				errorMsg.textContent = e.message;
				errorMsg.classList.add('visible');
				return false;
			}
		}

		editor.addEventListener('input', () => {
			if (isWatching) { return; }
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				if (validate()) {
					vscode.postMessage({ command: 'dataChanged', data: editor.value });
				}
			}, 500);
		});

		document.getElementById('btn-format').addEventListener('click', () => {
			try {
				const obj = JSON.parse(editor.value);
				editor.value = JSON.stringify(obj, null, 2);
				errorMsg.classList.remove('visible');
				if (!isWatching) {
					vscode.postMessage({ command: 'dataChanged', data: editor.value });
				}
			} catch (e) {
				errorMsg.textContent = e.message;
				errorMsg.classList.add('visible');
			}
		});

		document.getElementById('btn-load').addEventListener('click', () => {
			vscode.postMessage({ command: 'loadFile' });
		});

		document.getElementById('btn-unwatch').addEventListener('click', () => {
			setWatching(null);
			vscode.postMessage({ command: 'unwatchFile' });
		});

		// Handle tab key for indentation
		editor.addEventListener('keydown', (e) => {
			if (e.key === 'Tab' && !isWatching) {
				e.preventDefault();
				const start = editor.selectionStart;
				const end = editor.selectionEnd;
				editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
				editor.selectionStart = editor.selectionEnd = start + 2;
			}
		});

		// Handle messages from extension (file content update)
		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg.command === 'setData') {
				editor.value = msg.data;
				setWatching(msg.watchedFile || null);
				validate();
			}
		});

		validate();
	</script>
</body>
</html>`;
	}
}
