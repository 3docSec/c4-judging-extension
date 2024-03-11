import * as vscode from 'vscode';
import * as fse from 'fs-extra' ;
import { toRelativePath } from './uri';

let findings: Object;

export function reloadFindings() {
    // TODO this should fetch from GH
    // TODO this should check for file not existing
    findings = fse.readJsonSync(vscode.workspace.rootPath + "/findings.json");
}

export function getFindings(): Object {
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

    const fileFindings = getFindings()[toRelativePath(editor.document.uri) as keyof Object];
    if (!fileFindings) {
        vscode.window.showInformationMessage("No issues found for this file");
        return;
    };

    let countsBySeverity = new Map<string, number>();
    let links = new Set<string>();

    for(let i = startLine; i <= endLine; i++) {
        let lineFindings = fileFindings[i.toString() as keyof Object] as Object;
        if (!lineFindings) {
            continue;
        }
        Object.keys(lineFindings).forEach(severity => {
            let lineLinks = (lineFindings[severity as keyof Object] as any) as Array<string>;
            const currCount = countsBySeverity.get(severity);

            if (!currCount) {
                countsBySeverity.set(severity, lineLinks.length);
            } else {
                countsBySeverity.set(severity, currCount + lineLinks.length);
            }
            
            lineLinks.forEach((a) => links.add (a));
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