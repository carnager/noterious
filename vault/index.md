# Start

## Verwaltung
[[Kontakte]]
[[Tasks]]
[[Rezertifizierung]]
[[Budget]]
[[Dienstplanung]]
[[Familienzentrum]]
[[test]]

## Planung von Sitzungen
[[Meetings]]
                  
## Offene Aufgaben

```query
from tasks
where done = false
order by due, page
select text as task, who, due
```

## Geburtstage
```query empty="Keine Geburtstage in den nächsten 14 Tagen"
from pages
where tags contains "contact" and birthday_reminder = true and birthday != "" and daysUntilAnnual(birthday) <= 14
order by daysUntilAnnual(birthday), nachname, vorname
select path, nachname, vorname, birthday, daysUntilAnnual(birthday) as daysUntil
```
