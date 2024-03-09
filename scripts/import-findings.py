#!/usr/bin/env python3

import re
import os
import sys
from github import Github
from github import Auth
import base64
import json

# TODO remove
sys.argv = ["", "2023-12-ethereumcreditguild", "2023-12-ethereumcreditguild-findings"]

if len(sys.argv) != 3:
    print("Usage:")
    print("./import-findings.py <Contest repository> <Findings repository>")
    print()
    print("Note: the environment variable GITHUB_ACCESS_TOKEN must be set with a valid GH token")
    print("See here how to generate one: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#personal-access-tokens-classic")
    exit(1)

gh_token = os.getenv("GITHUB_ACCESS_TOKEN")
if not gh_token:
  print("Github token not found.\nGenerate one at https://github.com/settings/tokens and set it to the GITHUB_ACCESS_TOKEN environment variable")
  exit(1)

def extract_links(text, external_url, type, result):
    for line_no, line in enumerate(text.split("\n")):
        external_link = f"{external_url}#L{line_no + 1}"

        for _, source_file, source_line_no in re.findall(url_regex, line):
            if source_file not in result:
                result[source_file] = {}
            if source_line_no not in result[source_file]:
                result[source_file][source_line_no] = {}
            if type not in result[source_file][source_line_no]:
                result[source_file][source_line_no][type] = []
            result[source_file][source_line_no][type].append(external_link)

g = Github(auth=Auth.Token(gh_token))

# Generate a map as follows:
# {
#   "<file_name_1>" : {
#   <line_nr>: {
#        "🤖": ["<URL1>", "<URL2>", ...],
#        "H": ["<URL1>", ...]
#        ...
#     }
#   },
#   ...
# }
result = {}

repo_name = f"code-423n4/{sys.argv[1]}"

# Process bot report findings
repo = g.get_repo(repo_name)

# Check if there is a bot-report.md
b = repo.get_branch(repo.default_branch)
c = repo.get_contents(path="bot-report.md", ref=b.name)
blob = repo.get_git_blob(c.sha)

bot_report_md = base64.b64decode(blob.content).decode("utf-8", "ignore")
url_regex = f"https://github\.com/{repo_name}/blob/([a-z0-9.\-_]+)/(.*)#L([0-9]+)"

extract_links(bot_report_md, c.html_url + "?plain=1", "🤖", result)

# Process findings
findings_repo_name = f"code-423n4/{sys.argv[2]}"
repo = g.get_repo(findings_repo_name)
issues = repo.get_issues(state="all")

for i in issues:
    type = None

    for l in i.labels:
      if l.name == "2 (Med Risk)":
        type = "M"
      elif l.name == "3 (High Risk)":
        type = "H"
      elif l.name == "withdrawn by warden":
        type = None
        break

    if type == None:
       continue

    extract_links(i.body, i.html_url, type, result)
    # TODO: reorder to put dups together

with open('result.json', 'w') as fp:
    json.dump(result, fp)