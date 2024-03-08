#!/usr/bin/env python3

import re
import os
import sys
from github import Github
from github import Auth
import base64

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

g = Github(auth=Auth.Token(gh_token))

# Map as follows:
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
url_regex = r"(?i)\b((?:https?://|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'\".,<>?«»“”‘’]))"

for line_no, line in enumerate(bot_report_md.split("\n")):
   for match in re.findall(url_regex, line):
      url = match[0]
      if repo_name in url:
         # we found a reference to a line
         external_link = f"{c.html_url}?plain=1#L{line_no + 1}"

         # extract the file path
         url = "/blob/".join(url.split("/blob/")[1:])
         url = "/".join(url.split("/")[1:])
         if "#" not in url:
            continue
         file, line = url.split("#")
         line = line.split("-")[0][1:]

         if file not in result:
            result[file] = {}
         if line not in result[file]:
            result[file][line] = { "🤖": [] }

         result[file][line]["🤖"].append(external_link)

print(result)