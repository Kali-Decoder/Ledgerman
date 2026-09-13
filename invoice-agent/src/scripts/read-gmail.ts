/**
 * Milestone 1 — OAuth → read Gmail → print emails.
 *
 *   npm run read:gmail
 *   npm run read:gmail -- --query="newer_than:7d" --max=5
 */
import { readEmails } from "../services/gmail.service.js";
import { getGoogleAuth } from "../config/google-auth.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main() {
  await getGoogleAuth({ allowInteractive: true });
  const query = argValue("--query");
  const maxRaw = argValue("--max");
  const maxResults = maxRaw ? Number(maxRaw) : undefined;

  const messages = await readEmails({ query, maxResults });

  if (messages.length === 0) {
    console.log("No messages matched.");
    console.log('Try: npm run read:gmail -- --query="newer_than:7d" --max=5');
    return;
  }

  for (const m of messages) {
    console.log("─".repeat(60));
    console.log(`From:    ${m.from}`);
    console.log(`Subject: ${m.subject}`);
    console.log(`Date:    ${m.date}`);
    console.log(`ID:      ${m.id}`);
    console.log(`Snippet: ${m.snippet}`);
    console.log(`Body:\n${m.bodyText.slice(0, 800)}`);
  }
  console.log("─".repeat(60));
  console.log(`Printed ${messages.length} email(s).`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
