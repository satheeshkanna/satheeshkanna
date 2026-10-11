# Complaint Report Service — Python

Independent Python implementation; the Node.js project in the parent directory is unchanged.

```powershell
cd python\complaint-report-service
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
Copy-Item .env.example .env
py -m complaint_report.core --start-time "2026-10-10T09:00:00+03:00" --end-time "2026-10-10T12:30:00+03:00" --dry-run
```

Linux uses `python3 -m venv .venv` and `. .venv/bin/activate`. Configure `.env` with the same independent URL fields as the Node project. The end time is exclusive and timestamps require an offset. This initial Python delivery supports authentication, gateway pagination/deduplication, basic gateway aggregation, XLSX output and step logging; business-source/email parity can be extended in the next iteration.
