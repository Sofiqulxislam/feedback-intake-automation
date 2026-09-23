\# Feedback Intake Automation (n8n)



A feedback form that validates every submission, saves clean entries to Google Sheets, alerts me about low ratings, and tells me when the workflow itself breaks.



Built with \[n8n](https://n8n.io), Google Sheets, Telegram and Slack.



!\[Workflow canvas](screenshots/workflow.png)



\## What it does



1\. A visitor fills in a form: \*\*Name\*\*, \*\*Email\*\*, \*\*Rating\*\* (1-5) and optional \*\*Feedback\*\*.

2\. The workflow cleans the data: trims the name, lowercases the email and converts the rating to a number.

3\. It checks the email. The address must be correctly formatted \*\*and\*\* come from an allowed domain (`gmail.com`, `outlook.com`, `yahoo.com`, `hotmail.com`).

4\. \*\*Valid submissions\*\* are saved to the main sheet. If the same email submits again, the existing row is updated instead of duplicated.

5\. If the rating is \*\*below 3\*\*, a low-rating alert goes to Telegram and Slack.

6\. \*\*Invalid submissions\*\* are saved to a separate `Rejects` tab with a reason, so nothing is silently lost.

7\. If any step fails, a second workflow sends me a Telegram message with the workflow name, the failing node, the error message and a link to the execution.



```mermaid

flowchart LR

&#x20;   A\["Form submission"] --> B\["Edit Fields - trim and normalize"]

&#x20;   B --> C{"Valid email and allowed domain?"}

&#x20;   C -- Yes --> D\["Append or update row in main sheet"]

&#x20;   D --> E{"Rating below 3?"}

&#x20;   E -- Yes --> F\["Telegram alert"]

&#x20;   E -- Yes --> G\["Slack alert"]

&#x20;   E -- No --> H\["Do nothing"]

&#x20;   C -- No --> I\["Append to Rejects tab"]

```



\## Repository contents



<<<<<<< HEAD
=======


>>>>>>> c53695b (Updated README)
| `workflows/feedback-intake.json` | Main workflow: form, validation, Sheets, alerts |

| `workflows/error-alert.json` | Error workflow: Telegram message when the main workflow fails |

| `screenshots/workflow.png` | Screenshot of the main workflow canvas |



\## Setup



\### 1. Prepare the Google Sheet



Create one spreadsheet with two tabs and these headers in row 1. Names must match exactly.




| Main tab (for example `Sheet1`) | `Name`, `Email`, `Rating`, `Feedback` |

| `Rejects` | `Name`, `Email`, `Rating`, `Feedback`, `Reason` |



\### 2. Import the workflows



In n8n, create a new workflow, open the menu and choose \*\*Import from file\*\*. Import both files from `workflows/`.



\### 3. Connect your own accounts



The exported files contain placeholders instead of real IDs, so you need to fill these in:



\- \*\*Google Sheets credential:\*\* create one and select it in both Sheets nodes.

\- \*\*Both Sheets nodes:\*\* pick your spreadsheet, and choose the main tab in one node and `Rejects` in the other.

\- \*\*Telegram credential and chat ID:\*\* set them in the low-rating alert node in the main workflow and in the alert node of the error workflow.

\- \*\*Slack credential and channel:\*\* set them in the Slack node.



\### 4. Link the error workflow



Open the main workflow, go to \*\*Settings > Error Workflow\*\*, and select the imported error workflow. This step is easy to miss, and without it failures are not reported.



\### 5. Publish and test



Publish both workflows. Open the form's \*\*Production URL\*\* (not the Test URL) and submit these cases:




| Valid Gmail address, rating 5 | Row saved, no alert |

| Valid Gmail address, rating 2 | Row saved, Telegram and Slack alerts |

| A well-formed address at a non-allowed domain, such as `user@notamail.com` | Row saved to `Rejects`, not to the main sheet |

| Same email submitted twice | One row, updated |



To test the error alert, temporarily break a node (for example, put invalid syntax in an expression), submit the form through the Production URL, and check Telegram. Error workflows only run on published, automatic executions, not on manual test runs.



\## Design notes



\- \*\*Validation before saving:\*\* bad data is filtered before it reaches the main sheet, and rejected entries are kept with a reason for review.

\- \*\*Deduplication by email:\*\* the main sheet uses Append or Update matched on the `Email` column.

\- \*\*Separate error workflow:\*\* keeping it in its own workflow means it can be reused by other projects.



\## Known limitations



\- \*\*The domain allowlist is a simple check.\*\* It blocks real business addresses, and it only checks the domain name, not whether the mailbox exists.

\- \*\*Format validation cannot detect fake addresses\*\* at an allowed domain.

\- \*\*Google Sheets is used as the data store.\*\* It is fine for a small project, but a database would suit higher volume.

\- \*\*I run n8n locally,\*\* so the form URL only works while n8n is running. A real deployment would host n8n on a server.



\## Planned improvements



\- Replace the allowlist with an email verification API, or a confirmation email link.

\- Classify feedback with an AI node (bug, feature request, praise) and rate its sentiment.

\- Add a scheduled weekly digest with the average rating and a count per category.



\## Author



Sofiqul Sohan

