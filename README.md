# Feedback Intake Automation (n8n)

A feedback form that validates every submission, classifies the feedback with AI, saves clean entries to Google Sheets, alerts me about low ratings, sends a weekly summary, and tells me when a workflow itself breaks.

Built with [n8n](https://n8n.io), Google Sheets, Google Gemini, Telegram and Slack.

![Workflow canvas](screenshots/workflow.png)

## What it does

The project is three workflows that share one Google Sheet.

### 1. Feedback intake (`feedback-intake.json`)

1. A visitor fills in a form: **Name**, **Email**, **Rating** (1-5) and optional **Feedback**.
2. The workflow cleans the data: trims the name, lowercases the email and converts the rating to a number.
3. It checks the email. The address must be correctly formatted **and** come from an allowed domain (`gmail.com`, `outlook.com`, `yahoo.com`, `hotmail.com`).
4. **Valid submissions with feedback text** are sent to a Gemini model, which returns a **category** (bug, feature request, praise or other), a **sentiment** (positive, neutral or negative) and a one-sentence **summary**. Submissions with no feedback text skip the AI and get `none`.
5. The row is saved to the main sheet together with the submission **date**. If the same email submits again, the existing row is updated instead of duplicated.
6. If the rating is **below 3**, a low-rating alert goes to Telegram and Slack, including the category, sentiment and summary.
7. **Invalid submissions** are saved to a separate `Rejects` tab with a reason, so nothing is silently lost.

```mermaid
flowchart LR
    A["Form submission"] --> B["Edit Fields - trim and normalize"]
    B --> C{"Valid email and allowed domain?"}
    C -- No --> I["Append to Rejects tab"]
    C -- Yes --> J{"Has feedback text?"}
    J -- Yes --> K["Gemini: category, sentiment, summary"]
    J -- No --> L["Defaults: none"]
    K --> M["Prepare row - add date"]
    L --> M
    M --> D["Append or update row in main sheet"]
    D --> E{"Rating below 3?"}
    E -- Yes --> F["Telegram alert"]
    E -- Yes --> G["Slack alert"]
    E -- No --> H["Do nothing"]
```

### 2. Weekly digest (`weekly-digest.json`)

Every Friday morning a schedule trigger reads the main sheet and a Code node builds a summary of the last 7 days:

- number of responses
- average rating
- number of responses per category
- the three lowest-rated comments (using the AI summaries)

The result is sent to Telegram. If nobody submitted feedback that week, the message says so.

```mermaid
flowchart LR
    A["Schedule Trigger - weekly"] --> B["Read all rows from main sheet"]
    B --> C["Code node: keep last 7 days, average, counts, lowest comments"]
    C --> D["Telegram message"]
```

### 3. Error alert (`error-alert.json`)

If a step fails in either workflow, this workflow sends a Telegram message with the workflow name, the failing node, the error message and a link to the execution.

## Repository contents

| File | Purpose |
| --- | --- |
| `workflows/feedback-intake.json` | Form, validation, AI classification, Sheets, low-rating alerts |
| `workflows/weekly-digest.json` | Weekly summary of the last 7 days sent to Telegram |
| `workflows/error-alert.json` | Error workflow: Telegram message when another workflow fails |
| `scripts/clean-workflow.js` | Removes IDs, credentials and other personal details from an exported workflow |
| `screenshots/workflow.png` | Screenshot of the main workflow canvas |

## Setup

### 1. Prepare the Google Sheet

Create one spreadsheet with two tabs and these headers in row 1. Names must match exactly.

| Tab | Headers |
| --- | --- |
| Main tab (for example `Sheet1`) | `Name`, `Email`, `Rating`, `Feedback`, `Category`, `Sentiment`, `Summary`, `Date` |
| `Rejects` | `Name`, `Email`, `Rating`, `Feedback`, `Reason` |

Select the whole `Date` column in the main tab and set **Format > Number > Plain text**. Otherwise Google Sheets converts the dates into its own number format, and the digest cannot read them.

### 2. Import the workflows

In n8n, create a new workflow, open the menu and choose **Import from file**. Import all three files from `workflows/`.

### 3. Connect your own accounts

The exported files contain placeholders instead of real IDs, so you need to fill these in:

- **Google Sheets credential:** create one and select it in every Sheets node.
- **Sheets nodes:** pick your spreadsheet. In the intake workflow, choose the main tab in one node and `Rejects` in the other. In the digest, choose the main tab.
- **Google Gemini credential:** create an API key in [Google AI Studio](https://aistudio.google.com), add it as a credential in n8n, and select it in the Google Gemini Chat Model node. Pick a Flash or Flash-Lite model from the dropdown if the saved model is not available.
- **Telegram credential and chat ID:** set them in the low-rating alert node of the intake workflow, in the digest's message node and in the alert node of the error workflow.
- **Slack credential and channel:** set them in the Slack node.

### 4. Link the error workflow

Open the intake workflow, go to **Settings > Error Workflow**, and select the imported error workflow. Do the same in the digest workflow. This step is easy to miss, and without it failures are not reported.

### 5. Set the timezone

In the digest workflow, open **Settings** and choose your timezone. The schedule is Friday at 06:00 in that timezone. You can change the day and hour in the Schedule Trigger node.

### 6. Publish and test

Publish all three workflows. A Schedule Trigger only fires when its workflow is published.

Open the intake form's **Production URL** (not the Test URL) and submit these cases:

| Input | Expected result |
| --- | --- |
| Valid Gmail address, rating 5, praising feedback | Row saved with category `praise` and sentiment `positive`, no alert |
| Valid Gmail address, rating 2, feedback describing a problem | Row saved with AI fields, Telegram and Slack alerts that include them |
| Valid Gmail address, any rating, no feedback text | Row saved with `none` in Category and Sentiment, AI not called |
| A well-formed address at a non-allowed domain, such as `user@notamail.com` | Row saved to `Rejects`, not to the main sheet, AI not called |
| Same email submitted twice | One row, updated |

Every saved row should also have today's date in the `Date` column.

To test the digest, submit a few forms, then open the digest workflow and click **Execute workflow**. A manual run ignores the schedule and sends the message straight away. Check that the response count and average match your sheet.

To test the error alert, temporarily break a node (for example, put invalid syntax in an expression), submit the form through the Production URL, and check Telegram. Error workflows only run on published, automatic executions, not on manual test runs.

## Exporting workflows safely

A raw n8n export contains instance-specific IDs, credential references and sometimes pinned test data. To publish a workflow, export it into a folder outside the repo and run the cleanup script:

```bash
node scripts/clean-workflow.js "path/to/exported.json" workflows/feedback-intake.json
```

The script removes the workflow and instance IDs, credentials, webhook IDs, the error-workflow link and the timezone. It replaces the chat ID, spreadsheet ID and Slack channel with placeholders, empties pinned data, and sets the workflow to inactive. It then checks that node IDs are unique and connections are valid, and warns if anything still looks like a token or ID. It cannot catch everything, so review `git diff` before every commit.

## Design notes

- **Validation before saving:** bad data is filtered before it reaches the main sheet, and rejected entries are kept with a reason for review.
- **AI only when there is something to classify:** empty feedback skips the model call, which saves quota and avoids meaningless labels.
- **Constrained AI output:** the Information Extractor node asks for three named fields with fixed allowed values, and the model temperature is set to 0 so the same text gets the same label.
- **Deduplication by email:** the main sheet uses Append or Update matched on the `Email` column.
- **Workflows share data, not logic:** the digest only reads the sheet the intake workflow writes to. It never calls the intake workflow, and it reads the live sheet instead of a copy, so it always sees the latest rows.
- **One Code node for the digest:** filtering by date, averaging, counting per category and formatting the message all happen in a single node, which returns one finished message.
- **Separate error workflow:** keeping it in its own workflow means it can be reused by other projects.

## Known limitations

- **AI labels can be wrong.** Treat category and sentiment as a first pass, not a verdict.
- **Free-tier data handling.** Free Gemini API usage may be used by Google to improve its products, so use test data only, and switch to a paid key before handling real customer feedback.
- **Rate limits.** The free tier limits how many requests can be made per minute. A burst of submissions could fail, and the error workflow would report it.
- **The digest depends on the sheet layout.** It reads the `Date`, `Rating`, `Category`, `Feedback` and `Summary` columns, so renaming them breaks it. Rows without a readable date are ignored.
- **The domain allowlist is a simple check.** It blocks real business addresses, and it only checks the domain name, not whether the mailbox exists.
- **Format validation cannot detect fake addresses** at an allowed domain.
- **Google Sheets is used as the data store.** It is fine for a small project, but a database would suit higher volume.
- **I run n8n locally,** so the form URL only works while n8n is running, and scheduled runs only happen while it is running too. A real deployment would host n8n on a server.

## Planned improvements

- Save the row with a fallback label such as `unclassified` when the AI call fails, instead of stopping the run.
- Replace the allowlist with an email verification API, or a confirmation email link.
- Compare each weekly digest with the previous week.

## Author

Sofiqul Sohan
