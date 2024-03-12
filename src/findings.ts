import * as vscode from 'vscode';
import { toRelativePath } from './uri';
import { Octokit } from 'octokit';
import { getContext, getMode } from './extension';

let findings: Findings;

type Severity = string;
type FindingBySeverity = Map<Severity, Array<Finding>>;

export type Finding = {
    Link: string;
    IsPresorted: boolean;
    IsJudged: boolean;
}

function matchesMode(f: Finding): boolean {
    switch (getMode()) {
        case "judging": return !f.IsJudged;
        case "presort": return !f.IsPresorted;
        case "results": return f.IsJudged;
        default: return true;
    }
}

class Findings extends Map<string, Map<number, FindingBySeverity>> {
    uniquesBySeverity: Map<Severity, Set<Finding>> = new Map();

    pushFinding(relativeFileName: string, lineNumber: number, severity: Severity, finding: Finding) {
        if(!this.has(relativeFileName)) {
            this.set(relativeFileName, new Map());
        }

        if(!this.get(relativeFileName)!.has(lineNumber)) {
            this.get(relativeFileName)!.set(lineNumber, new Map());
        }

        if(!this.get(relativeFileName)!.get(lineNumber)!.has(severity)) {
            this.get(relativeFileName)!.get(lineNumber)!.set(severity, new Array());
        }

        this.get(relativeFileName)!.get(lineNumber)!.get(severity)!.push(finding);
        
        if(!this.uniquesBySeverity.get(severity)) {
            this.uniquesBySeverity.set(severity, new Set());
        }

        this.uniquesBySeverity.get(severity)!.add(finding);
    }

    countsBySeverity(): Map<Severity, number> {
        let ret: Map<Severity, number> = new Map();
        this.uniquesBySeverity.forEach((v: Set<Finding>, k: string) => ret.set(k, v.size));
        return ret;
    }

}

export async function reloadFindings(progress: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
}> | undefined) {
    let res: Findings = new Findings();

    // Get the contest name by reading the Git origin 
    // -> https://stackoverflow.com/questions/46511595/how-to-access-the-api-for-git-in-visual-studio-code
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (!gitExtension) {
        vscode.window.showErrorMessage("VS Code Git Extension not found");
        return;
    }

    const api = gitExtension.getAPI(1);

    // this will be one of:
    // (SSH remote): git@github.com:code-423n4/2023-12-ethereumcreditguild.git
    // (HTTPS remote): https://github.com/code-423n4/2023-12-ethereumcreditguild.git
    const origin = api.repositories[0].repository.remotes[0].fetchUrl;
    
    // this regex can match both protocols
    const gitRegex = new RegExp(".*code-423n4/(.*)\\.git", "g");
    const matches = origin.matchAll(gitRegex);

    let contest: string | undefined = undefined;

    for (const match of matches) {
        contest = match[1];
    }

    if (!contest) {
        vscode.window.showErrorMessage("Git remote is not a valid GitHub repo of 'code-423n4'");
        return;
    }

    const ghSecret = await getContext().secrets.get("c4-judging.GitHubToken");
    if (!ghSecret) {
        vscode.window.showErrorMessage("You have to set a GitHub token first");
        return;
    }
    const octokit = new Octokit({ auth: ghSecret });

    progress?.report({ increment: 10, message: "Processing bot findings..." });

    // Grab bot findings from the bot-report.md if any
    await importBotFindings(progress, contest, res);

    progress?.report({ increment: 30, message: "Processing HM findings..." });

    // Grab HMs from GitHub issues
    await importHMFindings(progress, octokit, contest, res);

    findings = res;
}

async function importBotFindings(progress: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
}> | undefined, contest:string, res: Findings) {
    try {
        let document = await vscode.workspace.openTextDocument(vscode.workspace.rootPath + "/bot-report.md");
        let documentText = document.getText();
        let documentLines = documentText.split("\n");

        let pos = documentText.indexOf("ProfitManager.sol#L331");

        const reportUrl = "https://github.com/code-423n4/" + contest + "/blob/main/bot-report.md?plain=1#L";
        const regex = new RegExp("https://github.com/code-423n4/"+contest+"/blob/([a-z0-9A-Z\\.\\-_]+)/([a-z0-9A-Z\.\-_]+)#L([0-9]+)", "g");

        let reportLine = 1;
        for(let reportLineContent of documentLines) {
            for (const match of reportLineContent.matchAll(regex)) {
                const relativeFileName = match[2];
                const lineNumber = +match[3];
                const linkUrl = reportUrl + reportLine;

                res.pushFinding(relativeFileName, lineNumber, "🤖", { Link: linkUrl, IsPresorted: false, IsJudged: false });
            }
            
            reportLine ++;
        }
    } catch {}
}

async function importHMFindings(progress: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
}> | undefined, octokit: Octokit, contest: string, res: Findings) {
    const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
        owner: "code-423n4",
        repo: contest + "-findings", 
        per_page: 100,
        state: "all",
    });

    const regex = new RegExp("https://github.com/code-423n4/"+contest+"/blob/([a-z0-9A-Z\\.\\-_]+)/([a-z0-9A-Z\.\-_]+)#L([0-9]+)", "g");
    let i = 0;

    for await (const { data: issues } of iterator) {
        for (const issue of issues) {
            if (i % 100 == 0) {
                progress?.report({ increment: 1, message: "Processing HM findings... " + i + " done" });
            }
            i++;

            // only consider HM findings (TODO: QA)
            let type: string | undefined;
            let presorted: boolean = false;
            let judged: boolean = false;

            for (const l of issue.labels) {
                const lName = l['name' as keyof Object] as unknown as string;
                if (lName == "2 (Med Risk)") {
                    type = "M";
                }
                else if (lName == "3 (High Risk)") {
                    type = "H";
                }
                else if (lName == "withdrawn by warden") {
                    type = undefined;
                    break;
                } else if (lName.includes("quality report")) {
                    presorted = true;
                } else if (lName.includes("satisfactory") || lName.includes("partial-")) {
                    judged = true;
                }
            }

            if (!type) continue;

            // only consider the primary links of the issue (those at the top)
            let links = issue.body?.split("Vulnerability details")[0] as unknown as string;

            for (const match of links.matchAll(regex)) {
                const relativeFileName = match[2];
                const lineNumber = +match[3];

                res.pushFinding(
                    relativeFileName,
                    lineNumber,
                    type,
                    { Link: issue.html_url, IsJudged: judged, IsPresorted: presorted }
                );
            }
        }
    }
}

export function getFindings(): Findings {
    if (!findings) {
        reloadFindings(undefined);
    }
    return findings
}

export function getFilteredFindings() : Findings {
    let dest: Findings = new Findings();
    let source = getFindings();
    if (!source) {
        return dest;
    }

    for(let filename of source.keys()) {
        const fileFindings = source.get(filename)!;
        for(let lineNumber of fileFindings.keys()) {
            const lineFindings = fileFindings.get(lineNumber)!;
            for(let severity of lineFindings.keys()) {
                const sevFindings = lineFindings.get(severity)!;
                for(let f of sevFindings) {
                    if(matchesMode(f)) {
                        dest.pushFinding(filename, lineNumber, severity, f);
                    }
                }
            }
        }
    }
    return dest;
}

export async function openAll() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    if (!selection) return;
    
    const startLine = editor.selection.start.line;
    const endLine = editor.selection.end.line;

    const fileFindings = getFilteredFindings().get(toRelativePath(editor.document.uri));
    if (!fileFindings) {
        vscode.window.showInformationMessage("No issues found for this file");
        return;
    };

    let countsBySeverity = new Map<string, number>();
    let links = new Set<string>();

    for(let i = startLine; i <= endLine; i++) {
        let lineFindings = fileFindings.get(i);
        if (!lineFindings) {
            continue;
        }

        for(let severity of lineFindings.keys()) {
            if (!lineFindings) {
                return;
            }
            
            let lineLinks = lineFindings.get(severity);
            if (!lineLinks) {
                return;
            }

            const currCount = countsBySeverity.get(severity);

            if (!currCount) {
                countsBySeverity.set(severity, lineLinks.length);
            } else {
                countsBySeverity.set(severity, currCount + lineLinks.length);
            }
            
            lineLinks.forEach((a) => links.add(a.Link));
        };
    }

    if(links.size > 0) {
        let msg = "Found a total of " + links.size + " reports. Ok to open them in your browser?";

        const selection = await vscode.window.showInformationMessage(msg, "OK", "Cancel");
        if (selection == "OK") {
            links.forEach((a) => vscode.env.openExternal(vscode.Uri.parse(a)));
        }
    } else {
        vscode.window.showInformationMessage("No findings were reported for the selected code");
    }
}