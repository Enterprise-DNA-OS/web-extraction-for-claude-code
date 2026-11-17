# Verification

17 November 2026.

The local embedded database suite and local Postgres 18.6 suite each passed 105 checks. It covers every CLI operation, repeatable migration and seed, CSV edge cases, import rollback, replay, backdated captures, ambiguous references, snapshot replacement, acceptance gates, recipe versions, private output, row security, HTML escaping and blocked network addresses.

A real HTTPS read of Enterprise DNA's published TUNE comparison page passed the robots check, extracted one record and stored it pending review in an isolated temporary database. No customer data or credentials were used. The temporary database was removed afterwards.

The fictional demo produced three read-only dashboards and six documents across two document types. Three real command outputs were captured for the comparison page. The library contains 31 task recipes and 27 CLI operations, plus the help command.

The comparison passed the source-price and brand gate. Desktop and mobile browser checks found no page overflow or script errors. All three demo tabs worked, and six booking links carried the Import.io campaign and replace-software offer. The preview rendered noindex,nofollow. The desktop and mobile page, dashboard and source-review document were visually inspected.

The implementation at `3ed49e6c0a8ec2590ff705f1b90347a997e047ce` passed all three jobs in [GitHub Actions run 44008613616](https://github.com/Enterprise-DNA-OS/web-extraction-for-claude-code/actions/runs/44008613616): Windows and Linux embedded tests, plus Postgres 17. Both embedded jobs also passed the isolated demo. The isolated Astro production build passed. A live customer migration, hosted scheduling and any complex-source integration remain separate acceptance work.
