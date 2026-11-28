# Pallas roadmap workflow

How the planner gets a roadmap reviewed in asset-serve and turned into BTR work. Nothing is queued until a human approves.

1. **Generate.** The planner writes `roadmap.md` for a product, one wave per H2 section, with each wave's prerequisites listed.
2. **Publish interactive.** It commits the file with `asset-serve roadmap <product> roadmap.md < content`, then registers it once:
   `asset-serve add <path> --interactive --action approve:Approve --action request_changes:"Request changes" --handler btr --context <btr-task-id>`
   The doc shows Approve / Request changes buttons and a comment box on each section.
3. **Request changes revises in place.** A request (whole doc or one section, sent as `Re: <heading> (#slug)`) is added to `~/.asset-serve/btr-replies.json` for that BTR task, like a `btr reply`. The planner rewrites the same file with `asset-serve roadmap`, which makes a new commit; the URL stays the same and the reader's open page updates live.
4. **Approve binds to the reviewed revision.** Approve is tied to the git HEAD the reader loaded. If the roadmap moved on since, or that HEAD is already approved, it is turned away. A good approve is added to `~/.asset-serve/btr-approvals.json` as `{task_id, head, revision}`.
5. **Queue waves.** Only after an approval for the current HEAD does the planner queue BTR waves. The first wave goes in right away; each later wave waits until the PRs it depends on are merged by a human.

The `btr` handler runs only on the server. Tokens, the secret and the handler code never reach the browser.
