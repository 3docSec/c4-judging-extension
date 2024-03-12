import * as vscode from 'vscode';
import { getFindings } from './findings';
import { toRelativePath } from './uri';

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

	public updateCodeLenses() {
		this._onDidChangeCodeLenses.fire();
	}

	public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {

		if (vscode.workspace.getConfiguration("c4-judging").get("enableCodeLens", true)) {
			let findings = getFindings();
			if (!findings) {
				return [];
			}

			this.codeLenses = [];

			const relativeFileName = toRelativePath(document.uri);

			let fileFindings = findings.get(relativeFileName);
			if (!fileFindings) {
				return [];
			}

			for (let lineNumber of fileFindings.keys()) {
				let lineFindings = fileFindings!.get(lineNumber);
				let title = "C4 findings - ";
				for (let severity of lineFindings!.keys()) {
					let links = lineFindings!.get(severity);
					title += severity + ": " + links!.length;
					const position = new vscode.Position(+lineNumber - 1, 0);
					const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
					this.codeLenses.push(new vscode.CodeLens(range as vscode.Range, {
						title: title,
						tooltip: "Open these findings in your browser",
						command: "c4-judging.codelensAction",
						arguments: [links!]
					}));
					title = "";
				}
			}

			return this.codeLenses;
		}
		return [];
	}

}