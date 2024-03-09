import * as vscode from 'vscode';
import * as fse from 'fs-extra' ;

/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {

	private codeLenses: vscode.CodeLens[] = [];
	private regex: RegExp;
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
	public findings: Object = {};

	constructor() {
		this.regex = /(.+)/g;

		vscode.workspace.onDidChangeConfiguration((_) => {
			this._onDidChangeCodeLenses.fire();
		});
	}

	public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {

		if (vscode.workspace.getConfiguration("codelens-sample").get("enableCodeLens", true)) {
			this.findings = fse.readJsonSync(vscode.workspace.rootPath + "/findings.json");
			
			this.codeLenses = [];
			const relativeFileName = document.uri.toString().replace("file://" + vscode.workspace.rootPath + "/", "") as keyof Object;

			let fileFindings = this.findings[relativeFileName];
			if (!fileFindings) {
				return [];
			}

			Object.keys(fileFindings).forEach(lineNumber => {
				let lineFindings = fileFindings[lineNumber as keyof Object] as Object;
				let title = "C4 findings - ";
				Object.keys(lineFindings).forEach(severity => {
					let links = (lineFindings[severity as keyof Object] as any) as Array<string>;
					title += severity + ": " + links.length;
					const position = new vscode.Position(+lineNumber - 1, 0);
					const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
					this.codeLenses.push(new vscode.CodeLens(range as vscode.Range, {
						title: title,
						tooltip: "Open these findings in your browser",
						command: "codelens-sample.codelensAction",
						arguments: [links]
					}));
					title = "";
				})
			});

			return this.codeLenses;
		}
		return [];
	}

}