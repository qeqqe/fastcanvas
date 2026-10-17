import { getAccessToken } from "../auth/spotifyAuth.js";

export interface TrackInfo {
  id: string;
  uri: string;
  image: string | undefined;
}

interface ApiTrack {
  id: string;
  uri: string;
  album?: { images?: { url: string }[] };
}

async function apiGet<T>(path: string, token: string, retried = false): Promise<T | null> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 204) return null;
  if (res.status === 429 && !retried) {
    const wait = Number(res.headers.get("Retry-After") ?? 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return apiGet(path, token, true);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Spotify API ${path}: ${body?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return (await res.json()) as T;
}

const toTrackInfo = (t: ApiTrack | undefined): TrackInfo | null =>
  t?.id ? { id: t.id, uri: t.uri, image: t.album?.images?.[0]?.url } : null;

// Currently playing track, falling back to the most recently played one.
export async function getTrackInfo(): Promise<TrackInfo | null> {
  const token = await getAccessToken();

  const current = await apiGet<{ item?: ApiTrack }>("/me/player/currently-playing", token);
  const track = toTrackInfo(current?.item);
  if (track) return track;

  const recent = await apiGet<{ items?: { track: ApiTrack }[] }>(
    "/me/player/recently-played?limit=1",
    token
  );
  return toTrackInfo(recent?.items?.[0]?.track);
}
