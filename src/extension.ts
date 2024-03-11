// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { ExtensionContext, languages, commands, Disposable, workspace, window, Uri, env} from 'vscode';
import { CodelensProvider } from './CodelensProvider';
import { reloadFindings, openAll } from './findings';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let disposables: Disposable[] = [];

export function activate(context: ExtensionContext) {
	const codelensProvider = new CodelensProvider();

	languages.registerCodeLensProvider("*", codelensProvider);

	commands.registerCommand("c4-judging.enableCodeLens", () => {
		workspace.getConfiguration("c4-judging").update("enableCodeLens", true, true);
	});

	commands.registerCommand("c4-judging.disableCodeLens", () => {
		workspace.getConfiguration("c4-judging").update("enableCodeLens", false, true);
	});

	commands.registerCommand("c4-judging.codelensAction", (args: Array<string>) => {
		args.forEach((a) => env.openExternal(Uri.parse(a)));
	});

	commands.registerCommand("c4-judging.reloadFindings", reloadFindings);

	commands.registerCommand("c4-judging.followReferences", openAll);
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (disposables) {
		disposables.forEach(item => item.dispose());
	}
	disposables = [];
}