---
description: Small, clear tasks. Boilerplate, config, CRUD, docs, simple tests
mode: subagent
model: litellm/fast
permissions:
  - { action: "*", resource: "*", effect: deny }
  - { action: shell, resource: "worker run --tier junior *", effect: allow }
---
Run exactly one command, with the task id, spec path and test command you were given:

worker run --tier junior --task <id> --spec <spec path> --test "<test command>"

Reply with its JSON report in 10 lines or fewer. Don't do the task yourself.
