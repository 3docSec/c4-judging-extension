import * as vscode from 'vscode';

export function toRelativePath(uri: vscode.Uri) : string {
    return uri.toString().replace("file://" + vscode.workspace.rootPath + "/", "");
}