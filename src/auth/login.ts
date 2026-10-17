import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const ENV_PATH = new URL("../.env", import.meta.url);
const REDIRECT_URI = "http://127.0.0.1:5555/callback";
const SCOPES = "user-read-currently-playing user-read-recently-played";

process.loadEnvFile(ENV_PATH);
const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authorizeUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
  });

async function exchangeCode(code: string): Promise<string> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { refresh_token: string }).refresh_token;
}

async function saveRefreshToken(token: string): Promise<void> {
  const env = await readFile(ENV_PATH, "utf8");
  const line = `SPOTIFY_REFRESH_TOKEN=${token}`;
  const updated = /^SPOTIFY_REFRESH_TOKEN=.*$/m.test(env)
    ? env.replace(/^SPOTIFY_REFRESH_TOKEN=.*$/m, line)
    : `${env.trimEnd()}\n${line}\n`;
  await writeFile(ENV_PATH, updated);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT_URI);
  if (url.pathname !== "/callback") return void res.writeHead(404).end();

  const code = url.searchParams.get("code");
  try {
    if (url.searchParams.get("state") !== state || !code) {
      throw new Error(url.searchParams.get("error") ?? "invalid callback");
    }
    await saveRefreshToken(await exchangeCode(code));
    res.end("Done, you can close this tab.");
    console.log("Saved SPOTIFY_REFRESH_TOKEN to .env");
  } catch (err) {
    res.writeHead(400).end("Authorization failed, check the terminal.");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
  server.close();
});

server.listen(5555, "127.0.0.1", () => {
  console.log(`Opening browser, or visit:\n${authorizeUrl}`);
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [authorizeUrl], { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
});
