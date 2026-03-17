import * as vscode from 'vscode';
import * as path from 'path';
import Handlebars from 'handlebars';
import { PreviewPanel } from './panels/previewPanel';
import { DataPanel } from './panels/dataPanel';

/**
 * Handlebars instance with helpers matching the web version (src/core/resolver.js).
 * Uses noEscape to preserve Typst markup syntax.
 */
const hbs = Handlebars.create();

// Register default helpers — same as web's TemplateResolver.registerDefaultHelpers()
hbs.registerHelper('formatCurrency', (value: unknown) => {
	if (!value) { return '0 ₫'; }
	return Number(value).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
});

hbs.registerHelper('formatDate', (dateString: unknown) => {
	if (!dateString) { return ''; }
	const date = new Date(String(dateString));
	return date.toLocaleDateString('vi-VN');
});

hbs.registerHelper('eq', function (a: unknown, b: unknown) {
	return a === b;
});

hbs.registerHelper('neq', function (a: unknown, b: unknown) {
	return a !== b;
});

function resolveTemplate(typstContent: string, jsonData: string): string {
	try {
		console.log('[Masax] Resolving Handlebars template...');
		const data = JSON.parse(jsonData);
		const compiled = hbs.compile(typstContent, { noEscape: true });
		const result = compiled(data);
		console.log('[Masax] Template resolved successfully.');
		return result;
	} catch (e) {
		console.warn('[Masax] Template resolution failed, using raw content.', e instanceof Error ? e.message : String(e));
		return typstContent;
	}
}

export interface LocalImage {
	originalPath: string;
	data: string; // base64
}

export interface MasaxState {
	typstContent: string;
	jsonData: string;
	resolvedTypst: string;
	localImages: LocalImage[];
	docDir: string;
	watchedJsonFile?: string;
}

const state: MasaxState = {
	typstContent: '',
	jsonData: '{}',
	resolvedTypst: '',
	localImages: [],
	docDir: '',
	watchedJsonFile: undefined,
};

function updateResolved() {
	state.resolvedTypst = resolveTemplate(state.typstContent, state.jsonData);
}

let previewPanel: PreviewPanel | undefined;
let dataPanel: DataPanel | undefined;
let jsonFileWatcher: vscode.FileSystemWatcher | undefined;

async function resolveLocalImages(typstContent: string, docDir: string): Promise<LocalImage[]> {
	console.log('[Masax] Resolving local images from:', docDir);
	const imageRegex = /#image\(\s*"([^"]+)"/g;
	const results: LocalImage[] = [];
	const seen = new Set<string>();
	let match;

	while ((match = imageRegex.exec(typstContent)) !== null) {
		const originalPath = match[1];
		if (originalPath.startsWith('http') || seen.has(originalPath)) { continue; }
		seen.add(originalPath);

		try {
			const absPath = path.isAbsolute(originalPath)
				? originalPath
				: path.join(docDir, originalPath);
			const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
			results.push({ originalPath, data: Buffer.from(bytes).toString('base64') });
		} catch (e) {
			console.warn(`[Masax] Local image not found: ${originalPath}`, e instanceof Error ? e.message : '');
		}
	}
	console.log(`[Masax] Resolved ${results.length} local image(s).`);
	return results;
}

async function updateStateFromEditor(editor: vscode.TextEditor) {
	state.typstContent = editor.document.getText();
	state.docDir = path.dirname(editor.document.uri.fsPath);
	state.localImages = await resolveLocalImages(state.typstContent, state.docDir);
	updateResolved();
}

async function loadJsonFile(filePath: string) {
	const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
	state.jsonData = Buffer.from(bytes).toString('utf8');
	state.watchedJsonFile = filePath;
	updateResolved();
	previewPanel?.update(state);
	dataPanel?.setData(state.jsonData, filePath);
}

function stopWatchingJson() {
	jsonFileWatcher?.dispose();
	jsonFileWatcher = undefined;
	state.watchedJsonFile = undefined;
}

function startWatchingJson(filePath: string) {
	stopWatchingJson();
	const uri = vscode.Uri.file(filePath);
	jsonFileWatcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(vscode.Uri.file(path.dirname(filePath)), path.basename(filePath))
	);
	jsonFileWatcher.onDidChange(async () => {
		try {
			await loadJsonFile(filePath);
		} catch {
			vscode.window.showWarningMessage(`Masax: Cannot read ${path.basename(filePath)}`);
		}
	});
	jsonFileWatcher.onDidDelete(() => {
		stopWatchingJson();
		dataPanel?.setData(state.jsonData, undefined);
	});
}

async function handleLoadFile() {
	const uris = await vscode.window.showOpenDialog({
		canSelectMany: false,
		filters: { 'JSON Files': ['json'] },
		defaultUri: state.docDir ? vscode.Uri.file(state.docDir) : undefined,
		title: 'Select JSON data file to watch',
	});
	if (!uris || uris.length === 0) { return; }

	const filePath = uris[0].fsPath;
	try {
		await loadJsonFile(filePath);
		startWatchingJson(filePath);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Masax: Failed to read JSON file — ${msg}`);
	}
}

function handleUnwatchFile() {
	stopWatchingJson();
	dataPanel?.setData(state.jsonData, undefined);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('[Masax] Extension activating...');
	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer(PreviewPanel.viewType, {
			async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
				previewPanel = new PreviewPanel(context, state, () => { previewPanel = undefined; }, panel);
			}
		}),
		vscode.window.registerWebviewPanelSerializer(DataPanel.viewType, {
			async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
				dataPanel = new DataPanel(context, state, () => { dataPanel = undefined; },
					(newJson) => { state.jsonData = newJson; updateResolved(); previewPanel?.update(state); },
					() => handleLoadFile(),
					() => handleUnwatchFile(),
					panel,
				);
			}
		}),
	);

	console.log('[Masax] Extension activated.');

	// ---- Command: Open Live Preview ---- //
	context.subscriptions.push(
		vscode.commands.registerCommand('masax.openPreview', async () => {
			console.log('[Masax] Opening live preview...');
			const editor = vscode.window.activeTextEditor;
			if (editor) { await updateStateFromEditor(editor); }

			if (previewPanel) {
				previewPanel.reveal();
			} else {
				previewPanel = new PreviewPanel(context, state, () => { previewPanel = undefined; });
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
				dataPanel = new DataPanel(context, state, () => { dataPanel = undefined; },
					(newJson) => { state.jsonData = newJson; updateResolved(); previewPanel?.update(state); },
					() => handleLoadFile(),
					() => handleUnwatchFile(),
				);
			}
		})
	);

	// ---- Command: Export PDF ---- //
	context.subscriptions.push(
		vscode.commands.registerCommand('masax.exportPDF', async () => {
			console.log('[Masax] Export PDF requested.');
			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.document.fileName.endsWith('.typ')) {
				vscode.window.showWarningMessage('Please open a .typ file first.');
				return;
			}
			await updateStateFromEditor(editor);
			if (!previewPanel) {
				previewPanel = new PreviewPanel(context, state, () => { previewPanel = undefined; });
			}
			previewPanel.update(state);
			previewPanel.requestExport();
		})
	);

	// ---- Watch active editor changes ---- //
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (!previewPanel || !e.document.fileName.endsWith('.typ')) { return; }
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor || activeEditor.document !== e.document) { return; }

			state.typstContent = e.document.getText();
			state.docDir = path.dirname(e.document.uri.fsPath);

			if (debounceTimer) { clearTimeout(debounceTimer); }
			debounceTimer = setTimeout(async () => {
				state.localImages = await resolveLocalImages(state.typstContent, state.docDir);
				updateResolved();
				previewPanel?.update(state);
			}, 400);
		}),

		vscode.window.onDidChangeActiveTextEditor(async (editor) => {
			if (!editor || !editor.document.fileName.endsWith('.typ')) { return; }
			await updateStateFromEditor(editor);
			previewPanel?.update(state);
		}),

		vscode.workspace.onDidOpenTextDocument((doc) => {
			if (!doc.fileName.endsWith('.typ') || previewPanel) { return; }
			setTimeout(() => vscode.commands.executeCommand('masax.openPreview'), 300);
		}),
	);

	// If .typ is already open at activation
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && activeEditor.document.fileName.endsWith('.typ')) {
		updateStateFromEditor(activeEditor).then(() => {
			if (!previewPanel) {
				setTimeout(() => vscode.commands.executeCommand('masax.openPreview'), 500);
			}
		});
	}
}

export function deactivate() {
	previewPanel?.dispose();
	dataPanel?.dispose();
	stopWatchingJson();
}
