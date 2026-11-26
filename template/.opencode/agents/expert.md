---
description: Hard tasks. Data model, auth, security, concurrency, or a task that failed twice
mode: subagent
model: litellm/fast
permissions:
  - { action: "*", resource: "*", effect: deny }
  - { action: shell, resource: "worker run --tier expert *", effect: allow }
---
Run exactly one command, with the task id, spec path and test command you were given:

worker run --tier expert --task <id> --spec <spec path> --test "<test command>"

Reply with its JSON report in 10 lines or fewer. Don't do the task yourself.
