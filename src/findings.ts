import * as vscode from 'vscode';
import * as fse from 'fs-extra' ;

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