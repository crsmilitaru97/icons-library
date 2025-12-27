import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

type IconPackContent = Record<string, string[] | undefined>;
type IconData = Record<string, IconPackContent>;

const CDN_URIS = {
	codicons: 'https://unpkg.com/@vscode/codicons@0.0.44/dist/codicon.css',
	fontAwesome: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.1.0/css/all.min.css',
	primeIcons: 'https://unpkg.com/primeicons/primeicons.css',
	bootstrapIcons: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css',
	materialIcons: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
};

class IconsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'icons-library.icons-view';
	private webviewView?: vscode.WebviewView;
	private readonly iconPacksPath: string;

	constructor(
		private readonly extensionUri: vscode.Uri
	) {
		this.iconPacksPath = path.join(this.extensionUri.fsPath, 'packs');
	}

	public resolveWebviewView(webviewView: vscode.WebviewView) {
		this.webviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		this.updateWebview();

		webviewView.webview.onDidReceiveMessage(message => {
			if (message.type === 'iconSelected') {
				const code = this.getIconCode(message.pack, message.name);
				vscode.env.clipboard.writeText(code);
				vscode.window.showInformationMessage(`Copied: ${code}`);
			} else if (message.type === 'openSettings') {
				vscode.commands.executeCommand('workbench.action.openSettings', '@ext:crsx.icons-library');
			}
		});
	}

	public async updateWebview() {
		if (!this.webviewView) { return; }
		this.webviewView.webview.html = await this.getHtmlForWebview(this.webviewView.webview);
	}

	private getEnabledPacks(): string[] {
		const config = vscode.workspace.getConfiguration('iconsLibrary');
		const packs = config.get<string[]>('enabledPacks', ['codicons', 'fontawesome', 'fontawesome-brands', 'primeicons', 'bootstrap', 'material-symbols']);
		return Array.from(new Set((packs || []).filter(Boolean)));
	}

	private getIconCode(pack: string, name: string): string {
		const generators: Record<string, (name: string) => string> = {
			codicons: (n) => `codicon codicon-${n}`,
			primeicons: (n) => `pi pi-${n}`,
			fontawesome: (n) => `fa-solid ${n.startsWith('fa-') ? n : 'fa-' + n}`,
			'fontawesome-brands': (n) => `fa-brands ${n.startsWith('fa-') ? n : 'fa-' + n}`,
			bootstrap: (n) => `bi bi-${n}`,
			'material-symbols': (n) => `<span class="material-symbols-outlined">${n === 'cross' ? 'close' : n}</span>`
		};

		const generator = generators[pack];
		return generator ? generator(name) : name;
	}

	private async getHtmlForWebview(webview: vscode.Webview) {
		const enabledPacks = this.getEnabledPacks();
		const iconData = await this.loadIconPacks(enabledPacks);

		const getUri = (...segments: string[]) => this.asWebviewUri(webview, ...segments);

		const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'webview.html');
		const html = await this.safeReadFile(htmlPath);

		return html
			.replace(/\{\{cspSource\}\}/g, webview.cspSource)
			.replace(/\{\{codiconsUri\}\}/g, CDN_URIS.codicons)
			.replace(/\{\{fontAwesomeUri\}\}/g, CDN_URIS.fontAwesome)
			.replace(/\{\{primeIconsUri\}\}/g, CDN_URIS.primeIcons)
			.replace(/\{\{bootstrapIconsUri\}\}/g, CDN_URIS.bootstrapIcons)
			.replace(/\{\{materialIconsUri\}\}/g, CDN_URIS.materialIcons)
			.replace(/\{\{styleUri\}\}/g, getUri('media', 'style.css'))
			.replace(/\{\{scriptUri\}\}/g, getUri('media', 'main.js'))
			.replace(/'{{iconData}}'/g, JSON.stringify(iconData));
	}

	private async loadIconPacks(enabledPacks: string[]): Promise<IconData> {
		const iconData: IconData = {};

		try {
			if (!fs.existsSync(this.iconPacksPath)) { return iconData; }

			const files = await fs.promises.readdir(this.iconPacksPath);
			const jsonFiles = files.filter(file => file.endsWith('.json'));

			await Promise.all(jsonFiles.map(async file => {
				const packName = file.replace('.json', '');
				if (!enabledPacks.includes(packName)) { return; }
				const content = await this.safeReadFile(path.join(this.iconPacksPath, file));
				iconData[packName] = this.safeParseJson<IconPackContent>(content);
			}));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Error loading icon packs: ${message}`);
		}

		return iconData;
	}

	private asWebviewUri(webview: vscode.Webview, ...segments: string[]) {
		return webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...segments)).toString();
	}

	private async safeReadFile(filePath: string) {
		try {
			return await fs.promises.readFile(filePath, 'utf-8');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Unable to read file ${path.basename(filePath)}: ${message}`);
			return '';
		}
	}

	private safeParseJson<T>(content: string): T {
		if (!content) { return {} as T; }
		try {
			return JSON.parse(content) as T;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Invalid JSON in icon pack: ${message}`);
			return {} as T;
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new IconsViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(IconsViewProvider.viewType, provider),
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('iconsLibrary.enabledPacks')) {
				provider.updateWebview();
			}
		})
	);
}

export function deactivate() { }
