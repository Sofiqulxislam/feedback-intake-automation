// clean-workflow.js
// Cleans an exported n8n workflow so it is safe to publish on GitHub.
//
// Usage:
//   node scripts/clean-workflow.js <exported-file.json> <output-file.json>
//
// Example:
//   node scripts/clean-workflow.js "C:/Users/me/Downloads/Feedback.json" workflows/feedback-intake.json

const fs = require("fs");

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node clean-workflow.js <exported-file.json> <output-file.json>");
  process.exit(1);
}

const wf = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const removed = new Set();

// 1. Top-level fields that belong to your own n8n instance
for (const key of ["id", "versionId", "meta", "staticData", "shared", "triggerCount"]) {
  if (key in wf) {
    delete wf[key];
    removed.add(key);
  }
}
wf.pinData = {}; // pinned test data can contain real submissions
wf.active = false; // never auto-start on import

if (wf.settings) {
  for (const key of ["errorWorkflow", "timezone"]) {
    if (key in wf.settings) {
      delete wf.settings[key];
      removed.add(`settings.${key}`);
    }
  }
}

// 2. Per-node cleanup
for (const node of wf.nodes) {
  if ("webhookId" in node) {
    delete node.webhookId;
    removed.add("webhookId");
  }
  if ("credentials" in node) {
    delete node.credentials; // importers pick their own credentials
    removed.add("credentials");
  }

  const p = node.parameters || {};

  // Telegram chat ID
  if (p.chatId) p.chatId = "YOUR_CHAT_ID";

  // Google Sheets spreadsheet ID
  if (p.documentId && typeof p.documentId === "object") {
    p.documentId.value = "YOUR_SPREADSHEET_ID";
    removed.add("spreadsheet id");
  }

  // Slack channel
  if (p.channelId && typeof p.channelId === "object") {
    p.channelId.value = "YOUR_CHANNEL_ID";
    p.channelId.mode = "id";
    removed.add("slack channel");
  }
}

// 3. Remove cached URLs anywhere (Google Sheets URLs contain the spreadsheet ID)
function stripCachedUrls(obj) {
  if (Array.isArray(obj)) return obj.forEach(stripCachedUrls);
  if (obj && typeof obj === "object") {
    if ("cachedResultUrl" in obj) {
      delete obj.cachedResultUrl;
      removed.add("cachedResultUrl");
    }
    Object.values(obj).forEach(stripCachedUrls);
  }
}
stripCachedUrls(wf);

// 4. Sanity checks
const problems = [];

const ids = wf.nodes.map((n) => n.id);
if (new Set(ids).size !== ids.length) problems.push("Duplicate node IDs found.");

const names = new Set(wf.nodes.map((n) => n.name));
for (const [from, outputs] of Object.entries(wf.connections || {})) {
  if (!names.has(from)) problems.push(`Connection from unknown node "${from}".`);
  for (const branches of Object.values(outputs)) {
    for (const branch of branches) {
      for (const link of branch || []) {
        if (!names.has(link.node)) problems.push(`Connection to unknown node "${link.node}".`);
      }
    }
  }
}

// Warn about anything that still looks like a secret or an ID
const text = JSON.stringify(wf);
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const withoutUuids = text.replace(uuid, "");
const suspicious = [
  [/docs\.google\.com/, "a Google Docs/Sheets URL"],
  [/hooks\.slack\.com|xox[a-z]-/, "a Slack webhook or token"],
  [/\d{8,10}:[A-Za-z0-9_-]{30,}/, "a Telegram bot token"],
  [/AIza[0-9A-Za-z_-]{20,}/, "a Google API key"],
  [/[A-Za-z0-9_-]{32,}/, "a long token-like string (possible ID or key)"],
];
for (const [pattern, label] of suspicious) {
  if (pattern.test(withoutUuids)) problems.push(`Still contains ${label}. Search the output file for it.`);
}

fs.writeFileSync(outputPath, JSON.stringify(wf, null, 2) + "\n");

console.log(`Cleaned "${wf.name}" -> ${outputPath}`);
console.log(`Nodes: ${wf.nodes.length}`);
console.log(`Removed or replaced: ${[...removed].join(", ") || "nothing"}`);
if (problems.length) {
  console.log("\nCheck these before you commit:");
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exitCode = 1;
} else {
  console.log("Checks passed: unique node IDs, valid connections, no obvious secrets.");
}
