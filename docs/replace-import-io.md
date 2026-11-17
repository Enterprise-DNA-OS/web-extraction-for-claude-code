# Replace a permitted static-page Import.io workflow

## Export the record

Import.io's [Getting the data](https://docs.import.io/user-guide/tutorial/part-6/) instructions say to wait for the extractor's crawl run to finish, then use its run-history download control. Choose CSV. The [dashboard guide](https://docs.import.io/reference/extractors/managing/dashboard/) also documents data downloads. Checked 17 November 2026.

Download one complete run for one source at a time. Keep the original file and the original UTC capture timestamp. CSV field names are extractor-defined. The included `examples/import-io.csv` is fictional and illustrates the sample recipe, not a fixed vendor export schema.

## Configure the destination

Use `add-source` to record the URL, business purpose, owner, permission evidence and review dates. Use `configure-recipe` to identify the actual key field and required columns. Name a stable unique key that identifies each record in every snapshot. Whitespace is trimmed from the identity, but original values remain unchanged in the payload. Keys are case-sensitive. Changing identity rules requires an explicit mapping plan.

The import accepts UTF-8 CSV, optional BOM, quoted commas, embedded newlines and doubled quotes. It rejects duplicate column names case-insensitively, uneven row lengths, malformed quotes and duplicate or empty record keys. All columns are retained as text, including fields that the current recipe does not extract. There is no automatic numeric, currency or date conversion.

## Import once, then compare

```bash
node scripts/extract.mjs import import-io exported-data.csv --source="Your source" --captured-at=2026-11-16T09:00:00Z --by="Your name" --reason="Opening snapshot" --evidence="private:run-reference" --dry-run
```

Use the source's real timestamp and evidence reference. A dry run performs validation in a transaction and rolls it back. After reviewing counts and exceptions, repeat without `--dry-run`. Exact file, capture time, recipe version and mode replays do nothing. A conflicting snapshot at the same capture time is refused. Earlier imported captures never displace a later capture. Missing source rows never delete history, but a source's current snapshot contains only the newest complete run's rows.

Each row starts pending. Required-field gaps are stored and flagged. They cannot be accepted until corrected in a new source capture. Use `review` to record acceptance or a hold. `export feed` emits only current accepted records meeting the documented source and freshness gates. `export archive` includes all six domain record types for inspection, not automated restoration.

## Rebuild the collection recipe

CSV carries data, not an Import.io extractor definition. Create and test CSS selectors against permitted saved HTML, then test the live permitted page. The base fetches one static page per source. JavaScript rendering, pagination, credentials, cookies, chained extractors, challenge handling, proxy routing, source files, screenshots and incumbent run logs need a separate plan. No vendor account connection is required to import.

## Acceptance before switching

Compare the complete row count, distinct key count and representative field values with the source export. Exercise a changed row, a removed row, a missing required field and a failed capture. Verify approved-feed exclusions, restore a native database backup, and agree permission and retention ownership. Schedule the CLI on your own runner and monitor failed exit codes. Retire the incumbent workflow only after the replacement collection and delivery path meets your business requirements.

A prepared CSV can switch in a day. Complex source collection and integrations require separately tested work. Enterprise DNA handles that mapping and operating setup through Omni by Enterprise DNA.
