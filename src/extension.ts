// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { ExtensionContext, languages, commands, Disposable, workspace, window, Uri, env, ProgressLocation, StatusBarItem, StatusBarAlignment} from 'vscode';
import { CodelensProvider } from './CodelensProvider';
import { reloadFindings, openAll, Finding, getFindings, getFilteredFindings } from './findings';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let disposables: Disposable[] = [];
let context: ExtensionContext;
let statusBarItem: StatusBarItem | undefined = undefined;
let codelensProvider: CodelensProvider;

type Mode = "all" | "presort" | "judging" | "results" | undefined;
let mode: Mode = undefined;

export function getMode(): Mode {
	return mode;
}

export function getContext(): ExtensionContext {
	return context;
}

function switchMode(_mode: Mode) {
	mode = _mode;
	codelensProvider.updateCodeLenses();
	updateStatusBar();
}

export function activate(_context: ExtensionContext) {
	context = _context;
	
	codelensProvider = new CodelensProvider();

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

	commands.registerCommand("c4-judging.reloadFindings", async () => {
		window.withProgress({
			cancellable: false,
			location: ProgressLocation.Notification,
		}, (progress) => {
			return reloadFindings(progress);
 		});
	});

	commands.registerCommand("c4-judging.followReferences", openAll);

	commands.registerCommand("c4-judging.storeGitHubToken", async () => {
		const token = await window.showInputBox({
			placeHolder: "ghp_xxx",
			prompt: "Enter your GitHub API token - generated as simple token with repository access"
		}) as string;

		await context.secrets.store("c4-judging.GitHubToken", token);
	});

	commands.registerCommand("c4-judging.statusBarAction", async() => {
		const picks = [
			{
				label: "💯 Switch to 'All findings'",
				detail: "Shows all findings regardless of whether they were judged or pre-sorted",
			},
			{
				label: "👷 Switch to 'Presort mode'",
				detail: "Shows only not pre-sorted findings",
			},
			{
				label: "🏛️ Switch to 'Judge mode'",
				detail: "Shows only not judged findings",
			},
			{
				label: "💰 Switch to 'Results mode'",
				detail: "Shows only judged findings",
			},
			{
				label: "🔄 Reload findings",
				detail: "Syncs the in-memory cache with GitHub"
			}
		];

		if (mode == 'judging' || mode == 'presort') {
			picks.push({
				label: "👀 Open all remaining findings",
				detail: "Opens all findings in browser"
			});
		}

		let pick = await window.showQuickPick(
			picks,
			{
				title: "Pick an action"
			}
		);

		if (!pick) {
			return;
		}

		if(mode == undefined) {
			await window.withProgress({
				cancellable: false,
				location: ProgressLocation.Notification,
			}, (progress) => {
				return reloadFindings(progress);
			 });
		}
		
		if (pick == picks[0]) {
			switchMode('all');
		} else if (pick == picks[1]) {
			switchMode("presort");
		} else if (pick == picks[2]) {
			switchMode("judging");
		} else if (pick == picks[3]) {
			switchMode("results");
		} else if (pick == picks[4]) {
			window.withProgress({
				cancellable: false,
				location: ProgressLocation.Notification,
			}, (progress) => {
				return reloadFindings(progress);
			 });
		} else {
			let filteredFindings = getFilteredFindings().getUniquesBySeverity();
			let toOpenFindings = new Set([...(filteredFindings.get("H") || []),
							              ...(filteredFindings.get("M") || [])]);

			// request confirmation for more than 20 findings
			const selection = toOpenFindings.size <= 20 ? "OK" :
				await window.showInformationMessage("OK to open " + toOpenFindings.size + " findings in your browser?", "OK", "Cancel");
			if (selection == "OK") {
				for (let f of toOpenFindings) {
					env.openExternal(Uri.parse(f.Link));
				}
			}
		}
	});

	statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 0);
	statusBarItem.text = "C4 findings not loaded yet";
	statusBarItem.command = "c4-judging.statusBarAction";
	statusBarItem.show();
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (disposables) {
		disposables.forEach(item => item.dispose());
	}
	disposables = [];
}

function updateStatusBar() {
	if (!statusBarItem) {
		return;
	}

	let allFindingsCount = getFindings()?.getCountsBySeverity();
	if (!allFindingsCount) {
		return;
	}
	let filteredFindingsCount = getFilteredFindings().getCountsBySeverity();

	if (mode == "all") {
		statusBarItem.text = "All findings ("
	} else if (mode == "judging") {
		statusBarItem.text = "Judging ("
	} else if (mode == "presort") {
		statusBarItem.text = "Presorting ("
	} else if (mode == "results") {
		statusBarItem.text = "Results ("
	}

	let allFindingsTotal = 
		(allFindingsCount.get("H") || 0) +
		(allFindingsCount.get("M") || 0) +
		(allFindingsCount.get("Q") || 0);

	let filteredFindingsTotal =
		(filteredFindingsCount.get("H") || 0) +
		(filteredFindingsCount.get("M") || 0) +
		(filteredFindingsCount.get("Q") || 0);

	let percentLeftProgress = (allFindingsTotal == 0) ? 100 :
		filteredFindingsTotal * 100 / allFindingsTotal;

	let percentDoneProgress = Math.floor(100 - percentLeftProgress);

	if (mode == 'judging' || mode == 'presort') {
		statusBarItem.text += percentDoneProgress + "% done -"
	}

	for (let severity of filteredFindingsCount.keys()) {
		statusBarItem.text += " " + severity + ": " + filteredFindingsCount.get(severity)!;
	}

	statusBarItem.text += " )";
}