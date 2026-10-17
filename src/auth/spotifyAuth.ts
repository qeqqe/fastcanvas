import * as OTPAuth from "otpauth";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const CACHE_DIR = path.join(os.homedir(), ".cache", "fastfetch-spotify-canvas");

const DEFAULT_SECRETS_URL =
  "https://raw.githubusercontent.com/xyloflake/spot-secrets-go/refs/heads/main/secrets/secretDict.json";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function requireEnv(...names: string[]): string[] {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} in .env`);
  return names.map((n) => process.env[n]!);
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Tokens live for an hour, so keep them on disk instead of minting one every run.
async function cached(name: string, mint: () => Promise<CachedToken>): Promise<string> {
  const file = path.join(CACHE_DIR, `${name}.json`);
  const hit = JSON.parse(await readFile(file, "utf8").catch(() => "null")) as CachedToken | null;
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const fresh = await mint();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(fresh), { mode: 0o600 });
  return fresh.token;
}

// Official Web API token (refresh-token flow), used for now-playing.
export const getAccessToken = () => cached("access-token", mintAccessToken);

// Web player token minted from the sp_dc cookie, used for the canvas query.
export const getWebPlayerToken = () => cached("web-player-token", mintWebPlayerToken);

async function mintAccessToken(): Promise<CachedToken> {
  const [clientId, clientSecret, refreshToken] = requireEnv(
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "SPOTIFY_REFRESH_TOKEN"
  );

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken!,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Refresh token rejected (HTTP ${res.status}), run \`pnpm run auth\``);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

// The web player token request is signed with a TOTP whose secret Spotify rotates.
async function mintWebPlayerToken(): Promise<CachedToken> {
  const [spDc] = requireEnv("SP_DC");

  const secretsUrl = process.env.SPOTIFY_SECRETS_URL || DEFAULT_SECRETS_URL;
  const secretsRes = await fetch(secretsUrl, { signal: AbortSignal.timeout(10000) });
  if (!secretsRes.ok) throw new Error(`Failed to fetch TOTP secrets (HTTP ${secretsRes.status})`);
  const secrets = (await secretsRes.json()) as Record<string, number[]>;
  const version = Math.max(...Object.keys(secrets).map(Number)).toString();

  // the secret ships obfuscated: each byte XORed with its index
  const decoded = secrets[version]!.map((v, i) => v ^ ((i % 33) + 9)).join("");
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromHex(Buffer.from(decoded, "utf8").toString("hex")),
  }).generate();

  const url = new URL("https://open.spotify.com/api/token");
  url.search = new URLSearchParams({
    reason: "init",
    productType: "web-player",
    totp,
    totpServer: totp,
    totpVer: version,
  }).toString();

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "App-Platform": "WebPlayer",
      Referer: "https://open.spotify.com/",
      Cookie: `sp_dc=${spDc}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    accessTokenExpirationTimestampMs?: number;
    isAnonymous?: boolean;
  };
  if (!res.ok || !data.accessToken) {
    throw new Error(`Web player token refused (HTTP ${res.status}, totpVer ${version})`);
  }
  if (data.isAnonymous) throw new Error("sp_dc cookie is invalid or expired");
  return {
    token: data.accessToken,
    expiresAt: data.accessTokenExpirationTimestampMs ?? Date.now() + 3600_000,
  };
}
