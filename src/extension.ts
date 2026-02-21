import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

type IconPackContent = Record<string, string[] | undefined>;
type IconData = Record<string, IconPackContent>;

interface Config {
	cdnUris: Record<string, string>;
	packDisplayNames: Record<string, string>;
	packVersions?: Record<string, string>;
}

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
			} else if (message.type === 'error') {
				vscode.window.showErrorMessage(message.message);
			}
		});
	}

	public async updateWebview() {
		if (!this.webviewView) { return; }
		this.webviewView.webview.html = await this.getHtmlForWebview(this.webviewView.webview);
	}

	private getEnabledPacks(): string[] {
		const config = vscode.workspace.getConfiguration('iconsLibrary');
		const packs = config.get<string[]>('enabledPacks', ['codicons', 'fontawesome', 'fabrands', 'primeicons', 'bootstrap', 'material', 'heroicons', 'lucide', 'feather', 'tabler', 'remixicon', 'lineicons', 'simpleicons', 'eva', 'boxicons', 'iconoir', 'phosphor']);
		return Array.from(new Set((packs || []).filter(Boolean)));
	}

	private getIconCode(pack: string, name: string): string {
		const generators: Record<string, (name: string) => string> = {
			codicons: (n) => `codicon codicon-${n}`,
			primeicons: (n) => `pi pi-${n}`,
			fontawesome: (n) => `fa-solid ${n.startsWith('fa-') ? n : 'fa-' + n}`,
			fabrands: (n) => `fa-brands ${n.startsWith('fa-') ? n : 'fa-' + n}`,
			bootstrap: (n) => `bi bi-${n}`,
			material: (n) => `<span class="material-symbols-outlined">${n === 'cross' ? 'close' : n}</span>`,
			heroicons: (n) => `heroicon heroicon-${n}`,
			lucide: (n) => `icon icon-${n}`,
			feather: (n) => `ft ft-${n}`,
			tabler: (n) => `ti ti-${n}`,
			remixicon: (n) => `ri-${n}`,
			lineicons: (n) => `lni lni-${n}`,
			simpleicons: (n) => `https://cdn.simpleicons.org/${n}`,
			eva: (n) => `eva eva-${n}`,
			boxicons: (n) => `bx ${n.startsWith('bx-') ? n : 'bx-' + n}`,
			iconoir: (n) => `iconoir-${n}`,
			phosphor: (n) => `ph ph-${n}`
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

		const configPath = path.join(this.extensionUri.fsPath, 'config.json');
		const configContent = await this.safeReadFile(configPath);
		const config = this.safeParseJson<Config>(configContent) || { cdnUris: {}, packDisplayNames: {} };
		const cdnUris = config.cdnUris;

		return html
			.replace(/\{\{cspSource\}\}/g, webview.cspSource)
			.replace(/\{\{codiconsUri\}\}/g, cdnUris.codicons || '')
			.replace(/\{\{fontAwesomeUri\}\}/g, cdnUris.fontAwesome || '')
			.replace(/\{\{primeIconsUri\}\}/g, cdnUris.primeIcons || '')
			.replace(/\{\{bootstrapIconsUri\}\}/g, cdnUris.bootstrapIcons || '')
			.replace(/\{\{materialSymbolsUri\}\}/g, cdnUris.materialSymbols || '')
			.replace(/\{\{heroiconsUri\}\}/g, cdnUris.heroicons || '')
			.replace(/\{\{lucideUri\}\}/g, cdnUris.lucide || '')
			.replace(/\{\{featherUri\}\}/g, cdnUris.feather || '')
			.replace(/\{\{tablerUri\}\}/g, cdnUris.tabler || '')
			.replace(/\{\{remixiconUri\}\}/g, cdnUris.remixicon || '')
			.replace(/\{\{lineiconsUri\}\}/g, cdnUris.lineicons || '')
			.replace(/\{\{evaUri\}\}/g, cdnUris.eva || '')
			.replace(/\{\{boxiconsUri\}\}/g, cdnUris.boxicons || '')
			.replace(/\{\{iconoirUri\}\}/g, cdnUris.iconoir || '')
			.replace(/\{\{phosphorUri\}\}/g, cdnUris.phosphor || '')
			.replace(/\{\{styleUri\}\}/g, getUri('media', 'style.css'))
			.replace(/\{\{scriptUri\}\}/g, getUri('media', 'main.js'))
			.replace(/'{{config}}'/g, JSON.stringify(config))
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
				const parsed = this.safeParseJson<IconPackContent>(content);
				if (parsed) {
					iconData[packName] = parsed;
				}
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

	private safeParseJson<T>(content: string): T | undefined {
		if (!content) { return undefined; }
		try {
			return JSON.parse(content) as T;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Invalid JSON in icon pack: ${message}`);
			return undefined;
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
