# Query Language Direction

The query language should be:

- readable inside markdown
- structured enough to parse reliably
- decoupled from arbitrary client-side runtime code

## Candidate Syntax

````markdown
```query
from tasks
where done = false
order by due, page
select title, who, due, page
```
````

## Why Not Generic Embedded Lua

- too much client/runtime coupling
- difficult to make server-safe
- hard to optimize or cache
- poor portability for mobile and alternate clients

## Execution Model

- server parses query block
- server executes against SQLite-derived index
- server returns structured rows
- renderer converts rows into table/list/card output

## Future Features

- reusable named views
- parameterized queries
- inline aggregations
- permissions-aware result filtering
