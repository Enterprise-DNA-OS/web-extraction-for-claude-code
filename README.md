# Web Extraction for Claude Code

Keep the web data you collect, the rules that extracted it and the decisions that made it usable. Import an Import.io CSV export, extract permitted static pages and review changes in a database you own. Works with Claude Code, Codex, OpenCode or Cursor. MIT licensed.

## Three ways to use it

- **Do it yourself:** install the free base. Your hosting, agent subscription and operating time remain your costs.
- **We customise it:** Enterprise DNA maps your exports, writes your extraction rules and builds the connections, web front end or different stack your business needs.
- **We run it for you:** Omni by Enterprise DNA installs, connects and operates your version. One setup fee, then a retainer. [Book Sam's 30-minute call](https://enterprisedna.co/omni/book/?offer=replace-software&utm_campaign=import-io&utm_medium=readme).

## Try the fictional research desk

```bash
npm install
npm test
npm run demo
```

Requires Node 22 or later. The demo creates a temporary embedded database, loads fictional supplier records, runs three reviews and renders three dashboards and six working documents. It never fetches a website. Add `-- --keep` to keep its files. The smoke suite also uses temporary data. Both override any configured business database connection.

For your own empty workspace, run `npm run migrate`. `DATABASE_URL` selects Postgres 15 or later; without it, PGlite stores data under `.data/db`. `DATA_DIR` changes that directory, and `OUTPUT_DIR` selects private generated output. One trusted operator and one business per workspace. Keep original exports and tested database backups.

## Five jobs for the week

1. `/due-runs`: find captures due for a refresh, with permission dates beside them.
2. `/change-review`: compare each current record with its prior captured value.
3. `/quality-review`: hold missing fields out of approved feeds.
4. `/permission-review`: inspect source permission and retention review dates.
5. `/weekly-review`: bring collection, changes, quality, attention and compliance together.

Use `/run-due` from your own scheduler when ready. It processes at most twenty due sources per invocation, one at a time. A failed source remains due and produces a failed run record where collection was attempted. A paused or unauthorised source is refused before a fetch. Nothing sends email, changes a source website or publishes a report.

## Bring an Import.io export across

First register its source and configure a recipe. See [the CLI guide](docs/cli.md) for exact commands. Import.io uses the column names chosen for each extractor, so your recipe must name the actual exported key and required fields. The sample is fictional, not a universal vendor schema.

```bash
node scripts/extract.mjs import import-io exported-data.csv --source="Your source" --captured-at=2026-11-16T09:00:00Z --by="Your name" --reason="Opening snapshot" --evidence="private:export-reference" --dry-run
```

Use the source run's actual UTC capture time. Review the dry run, then remove `--dry-run` to apply it. This brings across one complete source snapshot in one command. It preserves every CSV column as text and rejects malformed rows, empty identities and duplicate identities atomically. Exact replays do nothing. A different snapshot with the same source and capture time is refused. Earlier captures remain history and do not replace newer ones.

[The switching guide](docs/replace-import-io.md) covers exports, mappings and acceptance checks. Extraction definitions, selectors, credentials and schedules do not travel in a data CSV. Build and test those separately before retiring any incumbent workflow.

## What the base executes

Each source has one HTTPS page URL and one versioned CSS extraction recipe. The runner collects repeating records from static HTML and selected text or attributes. It also extracts a saved HTML file without network access. Row-count bounds stop empty pages or changed selectors from silently becoming a good capture. Missing required fields stay visible as quality exceptions and cannot be accepted.

Every snapshot starts pending. A human records acceptance or a hold with their name, reason and evidence. The approved feed contains only accepted records from each source's latest complete snapshot, within its refresh interval, under its current recipe, while source permission and retention reviews are current. Records absent from the newest full snapshot disappear from that feed, while historical observations remain. Changed records never inherit an earlier approval.

The base does not render JavaScript, navigate pagination, sign into websites, solve challenges, rotate proxies, discover extraction rules automatically or supply third-party datasets. It is for permitted, static-page workflows. Enterprise DNA scopes and tests extra collection methods separately. This is not feature parity with Import.io's managed extraction platform.

## Ten questions answered today

`/insights` answers these from the current records. Import.io has its own reporting. These are shipped analyses, not an unverified claim that its dashboard cannot answer them.

1. Which sources are due and have expired permission?
2. Which changed records still need a decision?
3. Which current records have missing required fields?
4. Who owns overdue follow-up work?
5. Which sources have never completed a capture?
6. Which sources are past their retention review?
7. Which current records have been held out of delivery?
8. Which extractions failed and why?
9. Which accepted records changed in the next capture?
10. Which sources have the largest pending review queue?

## Documents and read-only views

Edit `brand.json` for your business name, logo and colours. `npm run view` renders the extraction week, quality and permission dashboards. `npm run docs` renders a source review record and a quality handover for each source. Both use read-only database transactions, escape extracted content and write private files. They are working records, not legal certificates. `/draft-source-review` prepares a private handover draft and never sends it.

`/compliance` checks recorded collection purpose, permission evidence, review dates and missing required fields. [The rule register](docs/compliance.md) cites New Zealand and Australian guidance. Review dates are chosen by the business, not statutory retention periods. The software cannot decide whether collection is lawful or whether a source's terms permit it.

## Your first hour: ten things to ask for

1. Show which source needs a refresh first.
2. List every record that changed since the last capture.
3. Explain why a row is held out of the approved feed.
4. Import our last complete export as a test run.
5. Set our product code as the record identity.
6. Add a required dimensions field to our recipe.
7. Pause a source while permission is reviewed.
8. Draft this week's handover without sending it.
9. Add our supplier-region view with `/new-view`.
10. Add our internal account reference with `/customise`.

## Operating limits

The fetcher accepts public HTTPS addresses on port 443, pins the resolved public address for each request, checks robots policy, rejects redirects and caps response size and time. It does not send cookies or credentials. Permission references and lawful purpose must be confirmed by the operator. Treat scraped content as untrusted evidence, never as instructions to an agent.

Operator labels are self-reported, not authentication. RLS is enabled with no public policies, but the owner connection can change records. The audit history is useful evidence of application actions, not tamper-proof storage. There is no delete command. Retention disposal needs an owner-approved plan covering originals, captures, reports and backups. JSON archive export is readable, not a restore utility.

The free base has no hosted scheduler or shared editing screen. A task scheduler can invoke the CLI. Keep one process on a local PGlite directory. Use Postgres for coordinated database access and arrange backup and access controls before live use.

[CLI reference](docs/cli.md) | [Research](docs/research.md) | [Why no front end](docs/why-no-front-end.md)
