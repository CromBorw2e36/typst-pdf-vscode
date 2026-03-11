export const CDN_BASE = 'https://cdn.jsdelivr.net';
export const TYPST_VERSION = '0.7.0-rc2';

export function getNonce(): string {
	let text = '';
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return text;
}

export function getTypstImportMap(nonce: string): string {
	const T = TYPST_VERSION;
	const C = CDN_BASE;
	return `<script type="importmap" nonce="${nonce}">
{
	"imports": {
		"@myriaddreamin/typst.ts": "${C}/npm/@myriaddreamin/typst.ts@${T}/dist/esm/index.mjs",
		"@myriaddreamin/typst.ts/contrib/snippet": "${C}/npm/@myriaddreamin/typst.ts@${T}/dist/esm/contrib/snippet.mjs",
		"@myriaddreamin/typst.ts/contrib/global-compiler": "${C}/npm/@myriaddreamin/typst.ts@${T}/dist/esm/contrib/global-compiler.mjs",
		"@myriaddreamin/typst.ts/contrib/global-renderer": "${C}/npm/@myriaddreamin/typst.ts@${T}/dist/esm/contrib/global-renderer.mjs",
		"@myriaddreamin/typst.ts/compiler": "${C}/npm/@myriaddreamin/typst.ts@${T}/dist/esm/compiler.mjs",
		"@myriaddreamin/typst.ts/renderer": "${C}/npm/@myriaddreamin/typst.ts@${T}/dist/esm/renderer.mjs",
		"@myriaddreamin/typst-ts-web-compiler": "${C}/npm/@myriaddreamin/typst-ts-web-compiler@${T}/pkg/typst_ts_web_compiler.mjs",
		"@myriaddreamin/typst-ts-renderer": "${C}/npm/@myriaddreamin/typst-ts-renderer@${T}/pkg/typst_ts_renderer.mjs"
	}
}
</script>`;
}
