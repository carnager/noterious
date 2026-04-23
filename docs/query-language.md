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

Projection aliases are supported:

````markdown
```query
from tasks
select ref as taskRef, page as sourcePage, due as deadline
```
````

The built-in datasets currently expose:

- `tasks`: `ref`, `page`, `line`, `text`, `state`, `done`, `due`, `remind`, `who`
- `pages`: default fields `path`, `title`, `tags`, `outgoingLinkCount`, `backlinkCount`, `taskCount`, `openTaskCount`, `doneTaskCount`, `queryBlockCount`, `createdAt`, `updatedAt`, plus any top-level frontmatter fields on indexed pages
- `links`: `sourcePage`, `targetPage`, `linkText`, `kind`, `line`

That means page metadata queries can stay simple, for example:

````markdown
```query
from pages
where tags contains "contact" and location = "Deweerthstraße"
order by nachname, vorname
select path, nachname, vorname, role, phone_work
```
````

Small computed field functions are also supported in `where`, `order by`, and `select`:

- `year(field)`
- `month(field)`
- `day(field)`
- `daysUntilAnnual(field)`

These are especially useful for recurring annual dates like birthdays:

````markdown
```query
from pages
where tags contains "contact" and birthday_reminder = true and birthday != "" and daysUntilAnnual(birthday) <= 14
order by daysUntilAnnual(birthday), nachname, vorname
select path, nachname, vorname, birthday, daysUntilAnnual(birthday) as daysUntil
```
````

`order by` can reference those aliases:

````markdown
```query
from tasks
select ref as taskRef, due as deadline
order by deadline
```
````

Row projections can also be deduplicated with `select distinct`:

````markdown
```query
from tasks
order by page
select distinct page as sourcePage
offset 1
limit 1
```
````

`select *` and `select distinct *` expand to the dataset's default columns:

````markdown
```query
from tasks
order by ref
select *
limit 1
```
````

Basic aggregates are supported:

````markdown
```query
from tasks
where done = false
select count(*) as openCount
```
````

````markdown
```query
from tasks
select count(*) as total, count(distinct page) as pageCount
```
````

````markdown
```query
from tasks
select count(due) as dueCount
```
````

````markdown
```query
from tasks
select min(due) as earliestDue
```
````

````markdown
```query
from tasks
select max(due) as latestDue
```
````

````markdown
```query
from tasks
where done = false
select sum(line) as totalLineNumbers
```
````

````markdown
```query
from tasks
where done = false
select avg(line) as averageLineNumber
```
````

Grouped summaries are supported:

````markdown
```query
from tasks
group by page
order by total desc, page
select page, count(*) as total, count(distinct who) as uniqueOwners
```
````

Grouped results can then be filtered with `having`:

````markdown
```query
from tasks
group by page
select page, count(*) as total
having count(*) > 1
order by page
```
````

Grouped results can also be ordered and paged by projected aggregate aliases or direct aggregate expressions:

````markdown
```query
from tasks
group by page
select page, count(*) as total
order by count(*) desc, page
offset 1
limit 1
```
````

Result limits are supported:

````markdown
```query
from tasks
order by due
limit 5
select ref, due
```
````

Offsets are supported too:

````markdown
```query
from tasks
order by due
offset 5
limit 5
select ref, due
```
````

Disjunctions are also supported:

````markdown
```query
from tasks
where page = "daily/today" or page = "projects/alpha"
where done = false
select ref, page
```
````

`and` binds tighter than `or`, multiple `where` lines compose with `and`, and parentheses can override the default precedence:

````markdown
```query
from tasks
where (page = "daily/today" or page = "projects/alpha") and done = true
select ref, page
```
````

Unary `not` is also supported for both `where` and `having` expressions:

````markdown
```query
from tasks
where not (page = "daily/today" or done = true)
select ref, page, done
```
````

Optional explicit block IDs can be added in the fence header when a page has multiple identical query blocks and you want cache identity to survive reordering:

````markdown
```query id=open-tasks
from tasks
where done = false
select ref, due
```
````

Block IDs should be unique within a page.

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

## Currently Supported Operators

- `field = value`
- `field != value`
- `field contains value`
- `field not contains value`
- `field is null`
- `field is not null`
- `field > value`
- `field >= value`
- `field < value`
- `field <= value`
- `... and ...`
- `... or ...`
- `not ...`
- `(...)`
- `select *`
- `select field as alias`
- `count(*)`
- `count(field)`
- `count(distinct field)`
- `min(field)`
- `max(field)`
- `sum(field)`
- `avg(field)`
- `group by field[, ...]`
- `having ...`
- `select distinct ...`
- `limit N`
- `offset N`

`contains` is case-insensitive. On scalar fields it does substring matching, and on list fields like `who` it matches if any element contains the needle.

`not` binds tighter than `and` and `or`. Negation currently works by inverting supported leaf operators such as `=`, `!=`, `contains`, `is null`, and the ordered comparison operators.

Ordered comparisons use the query field's natural ordering. This works well for numeric fields like `line` and ISO-style date strings like `due`, `createdAt`, and `updatedAt`.

Use `is null` and `is not null` for missing values like undated tasks.

`select *` expands to the dataset's default columns and currently must be used on its own. `select distinct` currently applies to non-aggregate row projections and deduplicates projected rows before `offset` and `limit` are applied, including `select distinct *`. `count(*)`, `count(field)`, `count(distinct field)`, `min(field)`, `max(field)`, `sum(field)`, and `avg(field)` currently work as aggregate select expressions, optionally with aliases, and aggregate-only selects may include more than one aggregate expression. `count(field)` counts non-null values, while `count(distinct field)` counts distinct non-null values. `sum(field)` and `avg(field)` are currently limited to numeric fields. `group by` supports grouped fields plus one or more aggregate expressions, and `having` currently applies only to grouped results. On empty result sets, `count(*)`, `count(field)`, `count(distinct field)`, and `sum(field)` return `0`, while `min(field)`, `max(field)`, and `avg(field)` return `null`.

## Future Features

- reusable named views
- parameterized queries
- inline aggregations
- permissions-aware result filtering
