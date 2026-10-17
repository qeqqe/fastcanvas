import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getWebPlayerToken } from "../auth/spotifyAuth.js";
import { getTrackInfo } from "../helper/getCurrentTrack.js";

const MEDIA_DIR = path.join(os.homedir(), "images", "fastfetch", "media");
const PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
// persisted hash of the web player's `canvas` query, refreshed from its bundles if it goes stale
const KNOWN_CANVAS_HASH = "575138ab27cd5c1b3e54da54d0a7cc8d85485402de26340c2145f0f6bb5e7a9f";

interface CanvasQueryResponse {
  data?: { trackUnion?: { canvas?: { url?: string } | null } };
  errors?: { message: string }[];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.text();
}

async function findCanvasHash(): Promise<string | null> {
  const html = await fetchText("https://open.spotify.com/");
  const scripts = new Set(
    html.match(/https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/[\w.~-]+\.js/g)
  );
  for (const script of scripts) {
    const match = (await fetchText(script)).match(/"canvas","query","([0-9a-f]{64})"/);
    if (match) return match[1]!;
  }
  return null;
}

async function queryCanvas(trackUri: string, token: string, hash = KNOWN_CANVAS_HASH): Promise<string | null> {
  const res = await fetch(PATHFINDER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "App-Platform": "WebPlayer",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName: "canvas",
      variables: { trackUri },
      extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Canvas query: HTTP ${res.status}`);

  const body = (await res.json()) as CanvasQueryResponse;
  if (body.errors?.some((e) => e.message.includes("PersistedQueryNotFound"))) {
    const fresh = hash === KNOWN_CANVAS_HASH ? await findCanvasHash() : null;
    if (!fresh || fresh === hash) throw new Error("Canvas query hash is stale");
    return queryCanvas(trackUri, token, fresh);
  }
  const url = body.data?.trackUnion?.canvas?.url;
  // some canvases are still images; only video ones are used
  return url && /\.mp4(\?|$)/i.test(url) ? url : null;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

function toGif(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      // kitten icat's cost scales with frame count, so keep the gif lean
      ["-y", "-loglevel", "error", "-i", input, "-vf", "fps=10,scale=320:-1:flags=lanczos", output],
      { stdio: ["ignore", "ignore", "inherit"] }
    );
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
}

export async function getCanvas(): Promise<void> {
  const track = await getTrackInfo();
  if (!track) {
    console.log("Nothing playing or recently played");
    return;
  }

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const existing = await fs.readdir(MEDIA_DIR);
  if (existing.some((f) => path.parse(f).name === track.id)) {
    console.log("Media already cached for this track");
    return;
  }

  let canvasUrl: string | null = null;
  try {
    canvasUrl = await queryCanvas(track.uri, await getWebPlayerToken());
  } catch (err) {
    console.error(`Canvas lookup failed, using album cover: ${err instanceof Error ? err.message : err}`);
  }

  const base = path.join(MEDIA_DIR, track.id);
  if (canvasUrl) {
    await download(canvasUrl, `${base}.mp4`);
    try {
      await toGif(`${base}.mp4`, `${base}.gif`);
    } finally {
      await fs.rm(`${base}.mp4`, { force: true });
    }
  } else if (track.image) {
    await download(track.image, `${base}.jpg`);
  } else {
    console.log("Track has no canvas or cover");
    return;
  }

  // only clear the previous media once the new file is in place
  await Promise.all(existing.map((f) => fs.rm(path.join(MEDIA_DIR, f), { force: true })));
  console.log(`Saved ${canvasUrl ? "canvas" : "cover"} for ${track.uri}`);
}
