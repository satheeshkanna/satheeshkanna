# Complaint Journey Automated Email Reporting Service

Standalone Node.js 22+ backend; no database or frontend. Runs on Windows and Linux. Generates two HTML email designs, gateway/business metrics and a four-sheet XLSX. Live API and email delivery testing are the user's responsibility; local automated tests use synthetic data and mocked HTTP.

## Quick start (Windows PowerShell or Linux)

Extract the ZIP, open a terminal in `complaint-report-service`, then:

```sh
npm install
npm test
npm run preview
```

For reproducible subsequent installs use `npm ci`. Open `output/template1.preview.html` and `output/template4.preview.html` in a browser. `output/Complaint_Journey_Report_SAMPLE.xlsx` is generated too. No credentials, network requests or emails are needed for preview. All fixture records are invented, not copied from production.

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on Linux). Fill in the three HTTPS endpoint URLs, all six authentication fields and mail sender/recipients. Never commit `.env`. Launch npm commands from the project root so dotenv finds `.env`; all project configuration/output paths otherwise resolve relative to the source tree.

## API contracts and assumptions

The attached `temp (3).txt` was used; the handover referred to `temp (4).txt`, which was not attached. Authentication sends a JSON POST containing username, password, realm, client_id, client_secret, grant_type and expects access_token/expires_in. Tokens are cached in memory and renewed before expiry or once after a 401. Protected events and notifications use Bearer authentication. Confirm the notification API's authentication requirement in your environment.

Events use the supplied `/events` contract, URLSearchParams and limit/offset pagination, explicitly requesting event_id and payload fields. All pages are fetched, IDs deduplicated and raw row counts validated against total. Changing totals, missing metadata, unexpected offsets or early empty pages abort reporting. API total is treated as raw matching rows, so duplicate IDs reduce the deduplicated report total; logged duplicate counts expose that difference. Records lacking event_id are retained without inventing identifiers. Datetime is enforced when available; missing datetime relies on the gateway's date filter. Body fields may be omitted by gateway configuration; unknown business status is reported explicitly.

`EVENT_PATH` and `EVENT_APP_NAME` configure server-side filters. Additional server-supported filters can be placed in config/report.json `filters`. Operation mapping rules support case-insensitive substring matches against uri_path, api_name and other event metadata, including complaintProcessingType. Rules are OR matches, first matching operation wins; edit and validate them against your actual paths. Unmapped events appear under Other / Unclassified.

`BUSINESS_ERROR_QUERY=contains:error` optionally runs a supplemental request_body query against identical time/path/application filters. Its records must belong to the full result; inconsistencies abort sending. It never replaces full retrieval or determines business success. Error status or a nonempty nested error object is inspected in parsed request_body (and response_body when request_body has no processing status/error). HTTP 200 with a business Error remains a gateway success and a business error. Technical errors are the gateway failure dimension, not additional transactions. Missing HTTP status is an unverified gateway failure; missing business payload is unknown. An empty period shows N/A percentages, not 100% success.

Notification POST matches mailsubject, mailAddressFrom, mailBody, mailAddressTO, mailAddressCC, mailAddressBCC and `attachment: null`. To/CC/BCC accept comma- or semicolon-separated addresses. Successful HTTP status is treated as API acceptance unless success:false, error/errors or an explicit failed/error status is returned. The sample contains no response contract, so confirm real success/rejection fields before production use. API acceptance does not establish inbox delivery.

**Live attachment sending is blocked intentionally.** The supplied notification contract shows only attachment:null. Keep ATTACHMENT_ENABLED=false. XLSX generation always works locally. Enabling attachments raises a clear error rather than guessing encoding. Once the API owner supplies the exact attachment schema, implement and test its adapter in services/mailer.js as a separate integration change.

## Live execution and dates

```sh
npm run report -- --dry-run
npm run report
npm run report -- --start 2026-10-06 --end 2026-10-07
npm run report -- --start 2026-10-06 --end 2026-10-07 --force
npm run test:mail
npm run test:mail -- --confirm-send
```

`--dry-run` retrieves real data and writes HTML/XLSX without sending. `report` sends to configured recipients; `test:mail` sends only with explicit --confirm-send and uses a clearly labeled connectivity-test subject. This test does not suppress or affect daily reports. Preview always generates both templates; live report uses REPORT_TEMPLATE=template1 or template4. No source change is required to switch.

Dates are Saudi local midnight boundaries: **start inclusive, end exclusive**. The example covers 6 October, UTC `[2026-10-05T21:00:00Z, 2026-10-06T21:00:00Z)`. Default is the previous Saudi calendar day, or REPORT_INTERVAL_DAYS preceding days. Only Asia/Riyadh is supported and other timezone values are rejected rather than silently miscalculated. Gateway end semantics are unconfirmed; records at the exact exclusive end are removed client-side. UTC timestamp strings are used for API requests.

Reports abort if authentication, source retrieval, pagination validation, generation or required configuration fails. No partial/zero-failure substitute email is sent. HTTP requests have timeouts and bounded exponential retries for transient failures; notification sending has no automatic retries because the API provides no idempotency contract. A 401 triggers one token refresh and request retry.

## Duplicate suppression and recovery

A period/environment identity is protected by an exclusive `.state/*.lock` file and atomic JSON state rename. Concurrent processes sharing the same project directory cannot send the same period simultaneously. State is marked `sending` immediately before POST and `sent` afterward. Both states suppress another automatic send. This prevents blind resends when delivery succeeds but the response is lost. No exact-once guarantee is possible without API idempotency support. After an uncertain send, verify delivery manually before `--force`. Never delete a lock while a report process is running. After a confirmed crash, inspect the lock and state, ensure the original process is stopped, then remove only the abandoned lock. State corruption fails closed. Back up .state and share the same state directory when configuring scheduled invocations. Separate installations or hosts do not share locks.

## Excel, privacy and logs

Sheets: Summary, Gateway Failures, Business Errors, Technical Errors; frozen headers, autofilters, widths and formatting are applied. Latency retains API units because the reference does not establish units. Raw bodies, authentication headers, customer phone numbers and free-text messages are never exported. Complaint references are hashed to stable pseudonyms (not cryptographically anonymized); restrict access to outputs accordingly. Only generic approved code reasons (404, 422, fallback) appear in emails/XLSX. Preserve original diagnostic details in authorized source systems, not this report. Technical classifications derive from observed statuses, with no invented failure counts.

Complaint aggregation is exposed from services/aggregator.js when references exist, grouping only explicit identifiers. Event success rates and health do not imply completed workflows. Reports and structured local logs are under output/ and logs/. .state and real outputs/logs must never be included in a distributed ZIP. Apply local file permissions, retention policies and disk monitoring appropriate to your deployment. LOG_LEVEL=silent disables file logging (status still prints to console).

## Templates

Editable Handlebars HTML lives in templates/template1.html and template4.html. These adapt the supplied designs into dynamic table-based layouts: navy dashboard and blue/teal corporate design. Edit templates/styles.css; juice inlines it before output/sending. Variables are escaped by Handlebars; do not use triple braces for untrusted data. No approved logo was supplied, so a clearly identified text placeholder is used. No external asset is required. Test visual rendering in your actual Outlook desktop/Web versions; automated tests verify content and CSS, not those clients' rendering.

## Windows Task Scheduler

Do not create a task automatically. After successful manual live testing, create one in Task Scheduler with a daily trigger at **09:05 Saudi time**. If the host uses another timezone, convert the trigger (06:05 UTC) and account for the host's DST. Choose 'Do not start a new instance' and run as an account with access to .env, output, logs and .state. Program: the full path to node.exe. Arguments: `"C:\\path\\complaint-report-service\\jobs\\daily-report.js"`. Start in: `C:\\path\\complaint-report-service`. Test the task manually and inspect history/logs. Configure controlled retries only after understanding duplicate/uncertain-send handling.

## Linux cron or systemd

Same installation and npm commands. For a cron implementation supporting CRON_TZ:

```cron
CRON_TZ=Asia/Riyadh
5 9 * * * cd /opt/complaint-report-service && /usr/bin/node jobs/daily-report.js >> /opt/complaint-report-service/logs/scheduler.log 2>&1
```

CRON_TZ support varies; otherwise schedule 06:05 on a UTC host. Substitute the real node path (`command -v node`). Alternatively create a systemd oneshot service with WorkingDirectory=/opt/complaint-report-service and ExecStart=/usr/bin/node /opt/complaint-report-service/jobs/daily-report.js, plus a timer using `OnCalendar=*-*-* 09:05:00 Asia/Riyadh`. Enable it yourself after validation; consult your systemd version's timezone support. Keep a single scheduler active.

## Troubleshooting

- Missing variables: supply all authentication fields, HTTPS hosts and valid mail addresses in .env; verify the working directory.
- 401/403: confirm realm, grant type, API scopes and notification API authentication with the API owner. Never print tokens or request payloads.
- TLS errors: obtain an approved corporate CA chain and set NODE_EXTRA_CA_CERTS before starting Node. Do not set NODE_TLS_REJECT_UNAUTHORIZED=0 or disable verification.
- API transport/timeouts: verify corporate connectivity, DNS, proxy and REQUEST_TIMEOUT_MS. Failures abort the run. Event totals changing between pages require a stable historical reporting window or gateway snapshot capabilities.
- Pagination mismatch: check actual endpoint total/offset semantics and permissions before relaxing validation.
- Attachment error: leave disabled until the real schema is available.
- Locked/suppressed run: inspect state and delivery before explicit recovery/force.
- npm cache permission errors in a restricted cloud: `npm install --cache /workspace/.npm-cache`; this does not change Windows installation requirements.

## Support Portal migration

Reuse createAuth, fetchEvents, aggregate, render, workbook and send from services/. Keep secrets on the Node backend, not React. Expose authorized backend job/preview endpoints later, inject configuration per environment, and move period execution state into an atomic shared store before multi-host deployment. No new API endpoints or database are introduced here.

## Verification scope

`npm test` covers mocked authentication/cache/expiry/401, pagination over 1000, deduplication, incomplete data, date boundaries, aggregation/overlap, missing payloads, two templates, Excel readback, mail contract, uncertain/sent duplicate suppression, timeout/retry/failure behavior. Tests need no corporate network. Actual Windows runtime, Outlook appearance, live event permissions, API field availability, attachment schema and inbox delivery require validation in the user's environment.
