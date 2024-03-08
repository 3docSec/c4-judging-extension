import * as vscode from 'vscode';

/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {

	private codeLenses: vscode.CodeLens[] = [];
	private regex: RegExp;
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

	constructor() {
		this.regex = /(.+)/g;

		vscode.workspace.onDidChangeConfiguration((_) => {
			this._onDidChangeCodeLenses.fire();
		});
	}

	public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {

		if (vscode.workspace.getConfiguration("codelens-sample").get("enableCodeLens", true)) {
			this.codeLenses = [];
			const relativeFileName = document.uri.toString().replace("file://" + vscode.workspace.rootPath + "/", "");
			const position = new vscode.Position(0, 0);
			const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
			this.codeLenses.push(new vscode.CodeLens(range as vscode.Range, {
				title: "C4 findings",
				tooltip: relativeFileName,
				command: "codelens-sample.codelensAction",
				arguments: ["Argument 1", false]
			}));

			return this.codeLenses;
		}
		return [];
	}

}