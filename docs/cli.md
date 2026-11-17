# CLI reference

Run `node scripts/extract.mjs help`. Every command accepts `--json`. Options use `--name=value`, not a separate argument. Unknown options are rejected. Record references accept a full id, unique id prefix or case-insensitive name fragment. Ambiguous matches list candidates and exit 1.

Every database mutation needs `--by`, `--reason` and `--evidence`. These are operator-supplied labels, not authentication. All statements are parameterised. One complete snapshot is committed atomically. Run `npm run migrate` before the first command.

## Register and configure

Use your own confirmed dates and references. These sample dates are examples, not legal periods.

```bash
node scripts/extract.mjs add-source --name="Your source" --url=https://example.com/catalogue --owner="Your name" --purpose="Review permitted product specifications" --permission="private:permission-record" --until=2027-06-30 --retention-review=2027-06-30 --hours=24 --by="Your name" --reason="Register source" --evidence="private:permission-record"
node scripts/extract.mjs configure-recipe "Your source" --file=examples/recipe.json --by="Your name" --reason="Confirmed fields" --evidence="private:mapping-review"
```

A recipe has a CSS `row_selector`, `fields` mapping each output name to a relative CSS `selector`, an optional `attribute` per field, a `key_field`, `required_fields`, and integer `min_rows` and `max_rows` from 1 to 10000. Text is trimmed. The first matching child supplies each value. Recipes are versioned; historical runs retain their full recipe snapshot. Reconfiguration withholds existing approved data until recaptured and reviewed.

`set-source <source>` accepts `--owner`, `--purpose`, `--permission`, `--until`, `--retention-review` and `--status=active|paused`, plus the write labels. Source URL and refresh interval are fixed at registration in this base; changing them needs an explicit migration or a newly registered source.

## Collect a full snapshot

```bash
node scripts/extract.mjs import import-io examples/import-io.csv --source="Your source" --captured-at=2026-11-16T09:00:00Z --dry-run --by="Your name" --reason="Opening import" --evidence="private:export-record"
node scripts/extract.mjs extract-file "Your source" --file=examples/catalogue.html --captured-at=2026-11-16T10:00:00Z --dry-run --by="Your name" --reason="Test selectors" --evidence="private:saved-page"
node scripts/extract.mjs fetch "Your source" --by="Your name" --reason="Scheduled capture" --evidence="private:source-permission"
node scripts/extract.mjs run-due --by="Scheduler operator" --reason="Due capture cycle" --evidence="private:approved-schedule"
```

Remove `--dry-run` only after reviewing the result. Dry run is supported for import, extract-file, fetch and run-due. Fetch dry run still reads the website but rolls back the dataset write. The source must be active, permission and retention reviews current, and purpose and evidence nonempty. Saved files use a real UTC capture time. Network fetches record the capture completion time automatically. Input files are capped at 5 MiB, HTML and fetched pages at 2 MiB.

`run-due` checks at most twenty sources, reports each failure and exits 1 when any fails. It does not install a scheduler, retry automatically or send an alert. Arrange a task runner and monitor its exit code. Permission refusal is reported before network access. Fetch failures after admission are recorded as failed runs; they never replace the last successful snapshot.

## Read the desk

`sources`, `recipes`, `runs`, `records`, `due-runs`, `change-review`, `quality-review`, `permission-review`, `attention`, `compliance`, `history` and `tasks` return records. `show <sources|recipes|runs|observations|tasks> <reference>` returns the full selected record and its audit events. Recipe changes are also logged against their source.

`weekly-review` combines five lists. `insights` runs ten documented questions. Old captures are in `runs` and `show observations`; current working records are in `records`. Read `changed_records` through `change-review`, and use `show observations` for the full payload. Dashboard specifications provide reusable read-only queries.

## Decisions and follow-ups

```bash
node scripts/extract.mjs review <observation-id> --decision=accepted --by="Your name" --reason="Compared with source" --evidence="private:review-record"
node scripts/extract.mjs log-task "Your source" --title="Confirm missing dimensions" --owner="Your name" --due=2027-01-15 --by="Your name" --reason="Quality follow-up" --evidence="private:capture-record"
node scripts/extract.mjs close-task <task-id> --resolution="Confirmed the replacement field" --by="Your name" --reason="Resolved" --evidence="private:confirmation"
```

Review decisions are `accepted`, `held` or `pending`. Only current observations can be reviewed. Required-field gaps cannot be accepted. Close-task requires a resolution. No command deletes history or sends a message.

## Private output

`draft-source-review <source>` writes a Markdown draft under `OUTPUT_DIR/drafts`.

`export archive` writes all six domain record types as JSON under `OUTPUT_DIR/exports`. It is not a restore utility. `export feed` includes accepted records only from current, fresh snapshots under the latest recipe, with current permission and retention dates. It writes a private file, not a remote delivery. Every output file has a unique name and refuses overwrite.

`npm run view` renders three dashboards. `npm run docs` renders two document types for each source. `brand.json` sets the identity. Reports use read-only transactions and HTML escaping. There is no running web app.
