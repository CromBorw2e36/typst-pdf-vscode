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

		this.panel.webview.html = this.getHtml(initialState.jsonData);

		this.panel.webview.onDidReceiveMessage(
			(msg) => {
				if (msg.command === 'dataChanged') {
					this.onDataChange(msg.data);
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

	dispose() {
		this.panel.dispose();
		// disposables are cleaned up in onDidDispose handler
	}

	private getHtml(initialJson: string): string {
		const nonce = getNonce();
		const escapedJson = initialJson
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

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
		}
		.toolbar button {
			padding: 2px 10px; border:none; border-radius:2px; cursor:pointer;
			font-size: 0.75rem;
			background: var(--vscode-button-background); color: var(--vscode-button-foreground);
		}
		.toolbar button:hover { background: var(--vscode-button-hoverBackground); }
		#json-editor {
			flex:1; width:100%; border:none; resize:none; padding: 10px;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: var(--vscode-editor-font-size, 13px);
			outline: none; tab-size: 2;
		}
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
			<span>JSON Data (Handlebars context)</span>
			<button id="btn-format">Format</button>
		</div>
		<div id="error-msg"></div>
		<textarea id="json-editor" spellcheck="false">${escapedJson}</textarea>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const editor = document.getElementById('json-editor');
		const errorMsg = document.getElementById('error-msg');

		let debounceTimer;

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
				vscode.postMessage({ command: 'dataChanged', data: editor.value });
			} catch (e) {
				errorMsg.textContent = e.message;
				errorMsg.classList.add('visible');
			}
		});

		// Handle tab key for indentation
		editor.addEventListener('keydown', (e) => {
			if (e.key === 'Tab') {
				e.preventDefault();
				const start = editor.selectionStart;
				const end = editor.selectionEnd;
				editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
				editor.selectionStart = editor.selectionEnd = start + 2;
			}
		});

		validate();
	</script>
</body>
</html>`;
	}
}
