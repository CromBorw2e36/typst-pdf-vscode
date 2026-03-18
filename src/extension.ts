import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewPanel } from './panels/previewPanel';
import { DataPanel } from './panels/dataPanel';

/**
 * Injects JSON data into a Typst template by replacing the {{DATA}} placeholder.
 * Same logic as web's injectData() — accepts JSON string or object.
 */
function injectData(template: string, data: string | object): string {
	const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
	const escaped = jsonStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return template.replace('{{DATA}}', escaped);
}

function resolveTemplate(typstContent: string, jsonData: string): string {
	try {
		log('Injecting JSON data into template...');
		const result = injectData(typstContent, jsonData);
		log('Data injected successfully.');
		return result;
	} catch (e) {
		log(`[WARN] Data injection failed, using raw content. ${e instanceof Error ? e.message : String(e)}`);
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
	log(`Resolving template... (JSON data: ${state.jsonData.length} chars)`);
	state.resolvedTypst = resolveTemplate(state.typstContent, state.jsonData);
}

let previewPanel: PreviewPanel | undefined;
let dataPanel: DataPanel | undefined;
let jsonFileWatcher: vscode.FileSystemWatcher | undefined;

async function fetchRemoteImage(url: string): Promise<Buffer | null> {
	try {
		// Node.js native fetch (available in Node 18+)
		const response = await fetch(url);
		if (!response.ok) {
			log(`[WARN] Image fetch failed [HTTP ${response.status}] ${url}`);
			return null;
		}
		const arrayBuffer = await response.arrayBuffer();
		log(`Image fetched: ${url} (${arrayBuffer.byteLength} bytes)`);
		return Buffer.from(arrayBuffer);
	} catch (e) {
		log(`[WARN] Image fetch error: ${url} — ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
}

async function resolveLocalImages(typstContent: string, docDir: string): Promise<LocalImage[]> {
	log(`Resolving images from: ${docDir}`);
	const imageRegex = /#image\(\s*"([^"]+)"/g;
	const results: LocalImage[] = [];
	const seen = new Set<string>();
	let match;

	while ((match = imageRegex.exec(typstContent)) !== null) {
		const originalPath = match[1];
		if (seen.has(originalPath)) { continue; }
		seen.add(originalPath);

		// Remote URL — fetch from extension host (Node.js, no CORS)
		if (originalPath.startsWith('http://') || originalPath.startsWith('https://')) {
			const buf = await fetchRemoteImage(originalPath);
			if (buf) {
				results.push({ originalPath, data: buf.toString('base64') });
			} else {
				log(`[WARN] Skipping remote image: ${originalPath}`);
			}
			continue;
		}

		// Local file
		try {
			const absPath = path.isAbsolute(originalPath)
				? originalPath
				: path.join(docDir, originalPath);
			const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
			results.push({ originalPath, data: Buffer.from(bytes).toString('base64') });
			log(`Local image loaded: ${originalPath} (${bytes.byteLength} bytes)`);
		} catch (e) {
			log(`[WARN] Local image not found: ${originalPath} ${e instanceof Error ? e.message : ''}`);
		}
	}
	log(`Resolved ${results.length} image(s) total.`);
	return results;
}

async function updateStateFromEditor(editor: vscode.TextEditor) {
	const fileName = path.basename(editor.document.uri.fsPath);
	log(`--- Update from editor: ${fileName} ---`);
	state.typstContent = editor.document.getText();
	state.docDir = path.dirname(editor.document.uri.fsPath);
	log(`Document dir: ${state.docDir}`);
	log(`Template length: ${state.typstContent.length} chars`);
	state.localImages = await resolveLocalImages(state.typstContent, state.docDir);
	updateResolved();
	log(`Resolved Typst length: ${state.resolvedTypst.length} chars`);
}

async function loadJsonFile(filePath: string) {
	log(`Loading JSON file: ${filePath}`);
	const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
	state.jsonData = Buffer.from(bytes).toString('utf8');
	state.watchedJsonFile = filePath;
	log(`JSON loaded: ${bytes.byteLength} bytes`);
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

export let outputChannel: vscode.OutputChannel;

function log(msg: string) {
	outputChannel.appendLine(`[Masax] ${msg}`);
}

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Masax Typst');
	context.subscriptions.push(outputChannel);
	log('Extension activating...');
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

	log('Extension activated.');

	// ---- Command: Open Live Preview ---- //
	context.subscriptions.push(
		vscode.commands.registerCommand('masax.openPreview', async () => {
			log('Opening live preview...');
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
			log('Export PDF requested.');
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
