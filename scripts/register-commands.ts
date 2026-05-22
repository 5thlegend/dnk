// Register the /dank slash command with Discord.
// Usage: pnpm run register-commands
//
// Requires DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in .env.local

import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const text = readFileSync(".env.local", "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {}
}
loadEnv();

const appId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error("missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN");
  process.exit(1);
}

const ATTACHMENT = 11;
const STRING = 3;

const commands = [
  {
    name: "dank",
    description: "Fire a transmission into the General Dank Content Engine.",
    options: [
      {
        name: "note",
        description: "Raw founder signal — what was built, launched, learned, shifted.",
        type: STRING,
        required: true,
      },
      {
        name: "media",
        description: "Optional screenshot, voice note, or video.",
        type: ATTACHMENT,
        required: false,
      },
      {
        name: "url",
        description: "Optional URL to ingest (article, tweet, deploy, etc.).",
        type: STRING,
        required: false,
      },
    ],
  },
];

async function main() {
  const url = `https://discord.com/api/v10/applications/${appId}/commands`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    console.error("register failed", res.status, await res.text());
    process.exit(1);
  }
  console.log("registered:", await res.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
