import * as vscode from 'vscode';
import { PreviewPanel } from './panels/previewPanel';
import { DataPanel } from './panels/dataPanel';

/** Shared state between panels */
export interface MasaxState {
	typstContent: string;
	jsonData: string;
}

const state: MasaxState = {
	typstContent: '',
	jsonData: '{}',
};

let previewPanel: PreviewPanel | undefined;
let dataPanel: DataPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
	// ---- Webview Serializers (restore panels from previous session) ---- //
	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer(PreviewPanel.viewType, {
			async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
				previewPanel = new PreviewPanel(context, state, () => {
					previewPanel = undefined;
				}, panel);
			}
		})
	);

	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer(DataPanel.viewType, {
			async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
				dataPanel = new DataPanel(context, state, () => {
					dataPanel = undefined;
				}, (newJson) => {
					state.jsonData = newJson;
					previewPanel?.update(state);
				}, panel);
			}
		})
	);

	// ---- Command: Open Live Preview (beside editor) ---- //
	context.subscriptions.push(
		vscode.commands.registerCommand('masax.openPreview', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				state.typstContent = editor.document.getText();
			}

			if (previewPanel) {
				previewPanel.reveal();
			} else {
				previewPanel = new PreviewPanel(context, state, (panel) => {
					previewPanel = undefined;
				});
			}
			previewPanel.update(state);
		})
	);

	// ---- Command: Open JSON Data Panel ---- //
	context.subscriptions.push(
		vscode.commands.registerCommand('masax.openDataEditor', () => {
			if (dataPanel) {
				dataPanel.reveal();
			} else {
				dataPanel = new DataPanel(context, state, (panel) => {
					dataPanel = undefined;
				}, (newJson) => {
					state.jsonData = newJson;
					previewPanel?.update(state);
				});
			}
		})
	);

	// ---- Command: Export PDF ---- //
	context.subscriptions.push(
		vscode.commands.registerCommand('masax.exportPDF', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.fileName.endsWith('.typ')) {
				vscode.window.showWarningMessage('Please open a .typ file first.');
				return;
			}
			state.typstContent = editor.document.getText();

			// Ensure preview panel is open
			if (!previewPanel) {
				previewPanel = new PreviewPanel(context, state, (panel) => {
					previewPanel = undefined;
				});
			}
			previewPanel.update(state);
			previewPanel.requestExport();
		})
	);

	// ---- Watch active editor changes for live preview ---- //
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (!previewPanel) {return;}
			if (!e.document.fileName.endsWith('.typ')) {return;}

			// Only track the active editor
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor || activeEditor.document !== e.document) {return;}

			state.typstContent = e.document.getText();

			// Debounce 400ms
			if (debounceTimer) {clearTimeout(debounceTimer);}
			debounceTimer = setTimeout(() => {
				previewPanel?.update(state);
			}, 400);
		})
	);

	// When user switches to a different .typ file, update preview
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!editor || !editor.document.fileName.endsWith('.typ')) {return;}

			state.typstContent = editor.document.getText();

			if (previewPanel) {
				previewPanel.update(state);
			}
		})
	);

	// ---- Auto-open preview when opening a .typ file for the first time ---- //
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((doc) => {
			if (!doc.fileName.endsWith('.typ')) {return;}
			if (previewPanel) {return;} // Already open

			// Small delay to let editor fully focus first
			setTimeout(() => {
				vscode.commands.executeCommand('masax.openPreview');
			}, 300);
		})
	);

	// If a .typ file is already open at activation, show preview
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && activeEditor.document.fileName.endsWith('.typ')) {
		state.typstContent = activeEditor.document.getText();
		if (!previewPanel) {
			setTimeout(() => {
				vscode.commands.executeCommand('masax.openPreview');
			}, 500);
		}
	}
}

export function deactivate() {
	previewPanel?.dispose();
	dataPanel?.dispose();
}
