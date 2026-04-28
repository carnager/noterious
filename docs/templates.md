# Note Templates

Noterious templates are regular markdown notes stored in `_templates/`.

They let you:

- create notes in a predefined folder
- scaffold frontmatter with the right property kinds
- copy a reusable note body
- guide the user through a few important fields after creation

Created notes stay clean markdown. Template-only metadata is used during creation and then removed from the resulting note.

## Where Templates Live

Templates are discovered in two places:

- global templates: `<vault-root>/_templates/...`
- scoped templates: `<vault-root>/<top-level-folder>/_templates/...`

Global templates are available everywhere. Scoped templates are available when you are working inside the matching top-level scope.

## Creating A Note From A Template

Templates are used from the quick switcher:

1. Open the quick switcher.
2. Type the note name or path you want to create.
3. Choose `Create <Template Name>`.

Creation behavior:

- if `_template_folder` is set, that folder is prepended to the typed path
- if you already typed a path inside that folder, it is not duplicated
- if the target note already exists, Noterious opens it instead of overwriting it
- the template body is copied into the new note
- all template placeholders are expanded during creation

## Template File Format

A template is just a markdown note with frontmatter and an optional body.

- every normal frontmatter property becomes frontmatter in the created note
- `_template_*` properties control template behavior and are not kept in the created note
- the template body becomes the created note body

Supported template metadata keys:

- `_template_label`
  Display name shown in the quick switcher.
- `_template_folder`
  Target folder for created notes, relative to the current scope or vault root.
- `_template_bool`
  YAML list of frontmatter keys that should be edited as booleans.
- `_template_date`
  YAML list of frontmatter keys that should be edited as dates.
- `_template_datetime`
  YAML list of frontmatter keys that should be edited as datetimes.
- `_template_notification`
  YAML list of frontmatter keys that should be edited as notification-style datetimes.
- `_template_tags`
  YAML list of frontmatter keys that should be edited as tags.
- `_template_list`
  YAML list of frontmatter keys that should be edited as generic string lists.

## Placeholders

Templates support placeholder expansion in frontmatter default values and in the note body.

- `{{title}}`
  Replaced with the page title derived from the created note path.
- `{{path}}`
  Replaced with the full created note path.

If a template defines a `title` frontmatter field with an empty default, Noterious fills it from the created note title automatically.

## Guided Fill

After creating a note from a template, Noterious can jump through a small set of unresolved fields so the note can be completed quickly without leaving the property editor open forever.

The guided flow currently includes:

- `date`, `datetime`, and `notification` fields
- first-name and last-name style keys such as `vorname`, `nachname`, `firstname`, `lastname`, `first_name`, `last_name`
- phone-like keys such as `phone_private`, `telefon`, `mobile`, `handy`

Behavior:

- fields that already have content are skipped
- fields with non-empty template defaults are skipped
- booleans are not part of the guided flow
- tags, lists, and ordinary text fields are not guided unless they match the name/phone rules above
- pressing `Enter` on an empty guided field skips to the next one

## Example

`_templates/contact.md`

```md
---
_template_label: Contact
_template_folder: contacts
_template_date:
  - birthday
_template_notification:
  - birthday_notification
_template_bool:
  - birthday_reminder
_template_tags:
  - tags
vorname: "{{title}}"
nachname: ""
birthday: ""
birthday_notification: ""
birthday_reminder: false
email: ""
phone_private: ""
phone_work: ""
role: ""
tags:
  - contact
---

## Notizen

- call {{title}}
```

Typing `Rasmus Steinke` into the quick switcher and choosing `Create Contact` will create `contacts/Rasmus Steinke` by default, expand `{{title}}`, keep `tags: [contact]`, and start the guided fill flow for empty essential fields like `nachname`, `birthday`, `birthday_notification`, and phone numbers.
