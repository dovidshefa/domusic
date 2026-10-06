import { normalizeTitle } from "./duplicates";
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
const CONCURRENCY = 3;

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "canceled" | "duplicate";

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  kind: "audio" | "video";
  progress: number;
  status: UploadStatus;
  error?: string;
  /** existing track with the same name, when status === "duplicate" */
  duplicateOf?: string;
  duplicateName?: string;
};

export type UploadedTrack = {
  id: string;
  song: string;
  artist: string;
  album: string;
  cover: string;
  src: string;
  storage_path: string | null;
  kind: "audio" | "video";
  liked: boolean;
  duration: number | null;
  plays: number;
  is_public: boolean;
  genre: string | null;
  source_track_id: string | null;
};

type ExistingTrack = { id: string; song: string; storage_path: string | null };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function putWithProgress(
  path: string,
  file: File,
  token: string,
  upsert: boolean,
  onProgress: (pct: number) => void,
  controller: AbortController,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/media/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", upsert ? "true" : "false");
    xhr.setRequestHeader("cache-control", "3600");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    controller.signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export function useUploadManager(opts: {
  userId: string | null;
  getExisting: () => ExistingTrack[];
  onAdded: (t: UploadedTrack) => void;
  onReplaced: (trackId: string, src: string, storagePath: string) => void;
  /** visibility + category applied to new uploads */
  getUploadMeta?: () => { isPublic: boolean; genre: string | null };
}) {
  const { userId, getExisting, onAdded, onReplaced, getUploadMeta } = opts;
  const [items, setItems] = useState<UploadItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  const abortsRef = useRef<Map<string, AbortController>>(new Map());
  const runningRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const replaceRef = useRef<Map<string, string>>(new Map());

  const patch = useCallback((id: string, p: Partial<UploadItem>) => {
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  const runOne = useCallback(
    async (id: string) => {
      const file = filesRef.current.get(id);
      if (!file || !userId) return;
      const kind: "audio" | "video" = file.type.startsWith("video") ? "video" : "audio";
      const ext = file.name.split(".").pop()?.toLowerCase() ?? (kind === "video" ? "mp4" : "mp3");
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const controller = new AbortController();
      abortsRef.current.set(id, controller);
      patch(id, { status: "uploading", progress: 0 });

      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Not signed in");

        await putWithProgress(path, file, token, false, (pct) => patch(id, { progress: pct }), controller);

        const { data: signed } = await supabase.storage.from("media").createSignedUrl(path, SIGNED_URL_TTL);
        const src = signed?.signedUrl ?? "";
        const replaceId = replaceRef.current.get(id);

        if (replaceId) {
          const old = getExisting().find((t) => t.id === replaceId);
          await supabase.from("tracks").update({ src, storage_path: path, kind }).eq("id", replaceId);
          onReplaced(replaceId, src, path);
          if (old?.storage_path) await supabase.storage.from("media").remove([old.storage_path]);
          replaceRef.current.delete(id);
        } else {
          const meta = getUploadMeta?.() ?? { isPublic: false, genre: null };
          const song = file.name.replace(/\.[^.]+$/, "");
          const cover = `https://picsum.photos/seed/${encodeURIComponent(file.name)}/600/600`;
          const { data: row, error } = await supabase
            .from("tracks")
            .insert({
              user_id: userId,
              song,
              artist: kind === "video" ? "Music Video" : "Your Upload",
              album: "Local Files",
              cover,
              src,
              storage_path: path,
              kind,
              is_public: meta.isPublic,
              genre: meta.genre,
            })
            .select()
            .single();
          if (error || !row) throw new Error(error?.message ?? "Could not save track");
          onAdded({
            id: row.id,
            song: row.song,
            artist: row.artist,
            album: row.album,
            cover: row.cover ?? cover,
            src,
            storage_path: row.storage_path,
            kind: row.kind as "audio" | "video",
            liked: row.liked,
            duration: row.duration,
            plays: row.plays,
            is_public: row.is_public,
            genre: row.genre,
            source_track_id: row.source_track_id,
          });
        }
        patch(id, { status: "done", progress: 100 });
      } catch (err: any) {
        if (err?.name === "AbortError") patch(id, { status: "canceled" });
        else patch(id, { status: "error", error: err?.message ?? "Upload failed" });
        try { await supabase.storage.from("media").remove([path]); } catch {}
      } finally {
        abortsRef.current.delete(id);
        filesRef.current.delete(id);
      }
    },
    [userId, patch, getExisting, onAdded, onReplaced, getUploadMeta],
  );

  const pump = useCallback(() => {
    while (runningRef.current < CONCURRENCY && queueRef.current.length > 0) {
      const id = queueRef.current.shift()!;
      runningRef.current += 1;
      void runOne(id).finally(() => {
        runningRef.current -= 1;
        pump();
      });
    }
  }, [runOne]);

  const enqueue = useCallback(
    (ids: string[]) => {
      queueRef.current.push(...ids);
      pump();
    },
    [pump],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const existing = getExisting();
      const fresh: UploadItem[] = [];
      const toStart: string[] = [];
      for (const file of files) {
        const id = crypto.randomUUID();
        filesRef.current.set(id, file);
        const base = file.name.replace(/\.[^.]+$/, "");
        const dup = existing.find((t) => normalizeTitle(t.song) === normalizeTitle(base));
        const item: UploadItem = {
          id,
          name: file.name,
          size: file.size,
          kind: file.type.startsWith("video") ? "video" : "audio",
          progress: 0,
          status: dup ? "duplicate" : "queued",
          duplicateOf: dup?.id,
          duplicateName: dup?.song,
        };
        fresh.push(item);
        if (!dup) toStart.push(id);
      }
      setItems((its) => [...fresh, ...its]);
      enqueue(toStart);
    },
    [getExisting, enqueue],
  );

  const cancel = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((x) => x !== id);
    const c = abortsRef.current.get(id);
    if (c) c.abort();
    else {
      filesRef.current.delete(id);
      setItems((its) => its.map((i) => (i.id === id && (i.status === "queued" || i.status === "duplicate") ? { ...i, status: "canceled" } : i)));
    }
  }, []);

  const cancelAll = useCallback(() => {
    queueRef.current = [];
    abortsRef.current.forEach((c) => c.abort());
    setItems((its) =>
      its.map((i) => (i.status === "queued" || i.status === "duplicate" || i.status === "uploading" ? { ...i, status: "canceled" } : i)),
    );
  }, []);

  const resolveDuplicate = useCallback(
    (id: string, action: "replace" | "keep" | "skip") => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      if (action === "skip") {
        filesRef.current.delete(id);
        patch(id, { status: "canceled" });
        return;
      }
      if (action === "replace" && item.duplicateOf) replaceRef.current.set(id, item.duplicateOf);
      patch(id, { status: "queued" });
      enqueue([id]);
    },
    [items, patch, enqueue],
  );

  const clearFinished = useCallback(() => {
    setItems((its) => its.filter((i) => i.status === "uploading" || i.status === "queued" || i.status === "duplicate"));
  }, []);

  return { items, addFiles, cancel, cancelAll, resolveDuplicate, clearFinished };
}
