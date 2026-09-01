# Finish the Public Videos feature

Only the missing connections get built. Design, layout, and existing features stay exactly as they are.

## What you'll get

1. Two new buttons in the sidebar BROWSE list, under the existing ones:
   - **Public Videos** (video icon)
   - **Public Songs** (music icon)
   Both open the community library page that already exists, locked to that media type.
2. The page loads real public uploads straight from the database (search, sort, genre filters, uploader name, duration, play count already built). No sample or placeholder items — the only fallback is the generic cover art image used when an upload has no artwork.
3. On every public item, working buttons:
   - **Play** — adds it to your library and starts playing immediately.
   - **Add to My Songs** — copies it into your library; the button then reads "In my songs".
   - **Add to Playlist** — pick any of your playlists (or create a new one) and it's added.
   Unlimited adds, and adding never touches or removes the original uploader's copy — you get your own library entry pointing at the same file.
4. Upload screen visibility control: a **Public / Private** toggle plus an optional genre field next to the Upload button. Public uploads show up in Public Videos/Songs; Private stays visible only to you. Each library card also gets a small Public/Private switch so you can change your mind later.
5. End-to-end verification in a real browser: upload as Public → find it in Public Videos → play → Add to My Songs → Add to Playlist → refresh → everything persists.

## Technical notes

All work is in `src/routes/_authenticated/index.tsx` (plus tiny prop passes); `PublicLibrary.tsx` and `upload-manager.ts` already support everything needed.

- Extend the `Track` type and the library load mapping with `is_public`, `genre`, `source_track_id`.
- Extend `View` with `public-videos` and `public-songs`; add the nav entries and header titles; render `<PublicLibrary fixedKind="video" | "audio" />` for those views instead of the track grid.
- `addFromPublic(pt, { play })`: insert a `tracks` row owned by the current user with `song/artist/album/cover/kind/duration/genre` copied, `storage_path` = the original's path, `source_track_id` = the public track id, `is_public: false`; create a signed URL for playback; prepend to `tracks` state. Guard with a `savedSourceIds` set (derived from `source_track_id` + own uploads) so re-adds are prevented and re-render marks it saved.
- `addPublicToPlaylist(playlistId, pt)`: reuse `addFromPublic` to get/find the local track id, then insert into `playlist_tracks` with the next position, and update playlist state.
- Pass `getUploadMeta: () => ({ isPublic, genre })` into `useUploadManager` from new `uploadPublic` / `uploadGenre` state, backed by `localStorage` so the choice sticks.
- Per-card visibility toggle = `update({ is_public })` on the track row.
- Verify with `tsgo` typecheck plus a Playwright run of the full flow against localhost.
