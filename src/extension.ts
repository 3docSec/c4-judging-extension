// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { ExtensionContext, languages, commands, Disposable, workspace, window, Uri, env} from 'vscode';
import { CodelensProvider } from './CodelensProvider';
import { reloadFindings, openAll, Finding } from './findings';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let disposables: Disposable[] = [];
let context: ExtensionContext;

export function getContext(): ExtensionContext {
	return context;
}

export function activate(_context: ExtensionContext) {
	context = _context;
	
	const codelensProvider = new CodelensProvider();

	languages.registerCodeLensProvider("*", codelensProvider);

	commands.registerCommand("c4-judging.enableCodeLens", () => {
		workspace.getConfiguration("c4-judging").update("enableCodeLens", true, true);
	});

	commands.registerCommand("c4-judging.disableCodeLens", () => {
		workspace.getConfiguration("c4-judging").update("enableCodeLens", false, true);
	});

	commands.registerCommand("c4-judging.codelensAction", (args: Array<Finding>) => {
		args.forEach((a) => env.openExternal(Uri.parse(a.Link)));
	});

	commands.registerCommand("c4-judging.reloadFindings", reloadFindings);

	commands.registerCommand("c4-judging.followReferences", openAll);

	commands.registerCommand("c4-judging.storeGitHubToken", async () => {
		const token = await window.showInputBox({
			placeHolder: "ghp_xxx",
			prompt: "Enter your GitHub API token - generated as simple token with repository access"
		}) as string;

		await context.secrets.store("c4-judging.GitHubToken", token);
	})
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (disposables) {
		disposables.forEach(item => item.dispose());
	}
	disposables = [];
}