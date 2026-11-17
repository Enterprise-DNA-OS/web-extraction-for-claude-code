# Collection and record checks

Checked 17 November 2026. The checks expose evidence gaps. They do not establish legal permission, evaluate a website's terms, identify every personal field or certify compliance. The operator chooses review dates and records genuine evidence. A date is a review control, never a legal retention period.

| Rule | Check and effect | Source |
|---|---|---|
| NZ-IPP1 | A purpose is recorded. New collection is refused if it is blank. The owner must assess lawful purpose and necessity. | [NZ Privacy Commissioner, principle 1](https://www.privacy.org.nz/privacy-principles/1/) |
| NZ-IPP9 | A retention review date is recorded and flagged when overdue. Collection and approved feed delivery stop until reviewed. No automatic deletion. | [NZ Privacy Commissioner, principle 9](https://www.privacy.org.nz/privacy-principles/9/) |
| SOURCE-01 | Permission review is current before collection and feed delivery. This is a business control, not a statutory period. | [Import.io source and input model](https://docs.import.io/reference/extractors/interactive/managing-interactive/) |
| SOURCE-02 | Permission evidence exists. The operator must check access permission, licence and terms, not merely that a URL is public. | [OAIC APP 3 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information) |
| QUALITY-01 | Missing required fields block row acceptance. Row count bounds and record identities are enforced on each snapshot. | Internal quality policy configured in each recipe |

Australian APP 3 guidance covers collection from publicly accessible Internet sources as well as other sources. It does not make all public information unrestricted. The purpose and permission fields support an operator's review, not an automatic APP 3 determination. Legal applicability depends on the organisation and records.

Robots rules are an additional technical check. They are not consent, a licence or a substitute for source terms. The fetcher refuses disallowed paths and unclear robots responses, does not follow redirects or logins, and uses no bypass service. A 404 robots response is treated as no published robots restrictions, while the operator's permission gate still applies.

The base is a trusted single-business workspace. Keep source content and generated reports private. Public database roles receive no table policies. The database owner remains powerful, and operator labels are self-reported. If personal information is unnecessary, do not collect it. When lawful retention ends, plan deletion or de-identification with the owner across the database, originals, reports and backups. There is no blanket retention period in this system.
