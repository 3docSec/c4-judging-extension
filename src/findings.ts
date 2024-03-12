import * as vscode from 'vscode';
import { toRelativePath } from './uri';
import { Octokit } from 'octokit';
import { getContext } from './extension';

let findings: Findings;

type Severity = string;
type FindingBySeverity = Map<Severity, Array<Finding>>;
type Findings = Map<string, Map<number, FindingBySeverity>>;

type Finding = {
    Link: string
}

export async function reloadFindings() {
    let res: Findings = new Map();

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
    const gitRegex = new RegExp(".*code-423n4/(.*)\\.git", "g"); // TODO change this
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

    // Grab HMs from GitHub issues
    const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
        owner: "code-423n4",
        repo: contest + "-findings", // TODO
        per_page: 100,
        state: "all",
      });

    const regex = new RegExp("https:\/\/github\.com\/code-423n4\/" + contest + "\/blob\/([a-z0-9A-Z\\.\\-_]+)\/(.*)#L([0-9]+)", "g");
      
    for await (const { data: issues } of iterator) {
        for (const issue of issues) {
            // only consider HM findings (TODO: QA)
            let type: string | undefined;

            for (const l of issue.labels) {
                const lName = l['name' as keyof Object] as unknown as string;
                if (lName == "2 (Med Risk)"){
                    type = "M"
                }
                else if (lName == "3 (High Risk)") {
                    type = "H"
                }
                else if (lName == "withdrawn by warden") {
                    type = undefined;
                    break
                }
            }
      
            if (!type) continue;

            // only consider the primary links of the issue (those at the top)
            let links = issue.body?.split("Vulnerability details")[0] as unknown as string;

            for (const match of links.matchAll(regex)) {
                const relativeFileName = match[2];
                const lineNumber = +match[3];
                const issueUrl = issue.html_url;

                if(!res.has(relativeFileName)) {
                    res.set(relativeFileName, new Map());
                }

                if(!res.get(relativeFileName)!.has(lineNumber)) {
                    res.get(relativeFileName)!.set(lineNumber, new Map());
                }

                if(!res.get(relativeFileName)!.get(lineNumber)!.has(type)) {
                    res.get(relativeFileName)!.get(lineNumber)!.set(type, new Array());
                }

                res.get(relativeFileName)!.get(lineNumber)!.get(type)!.push({Link: issueUrl});
            }
        }
    }
    findings = res;
}

export function getFindings(): Findings {
    if (!findings) {
        reloadFindings();
    }
    return findings
}

export async function openAll() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    if (!selection) return;
    
    const startLine = editor.selection.start.line;
    const endLine = editor.selection.end.line;

    const fileFindings = getFindings().get(toRelativePath(editor.document.uri));
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

        Object.keys(lineFindings).forEach(severity => {
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
        });
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