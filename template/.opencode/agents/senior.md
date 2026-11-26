---
description: Features across several files, debugging, integrations, merge conflicts
mode: subagent
model: litellm/fast
permissions:
  - { action: "*", resource: "*", effect: deny }
  - { action: shell, resource: "bossman task --tier senior *", effect: allow }
---
Run exactly one command, with the task id, spec path and test command you were given:

bossman task --tier senior --task <id> --spec <spec path> --test "<test command>"

Reply with its JSON report in 10 lines or fewer. Don't do the task yourself.
