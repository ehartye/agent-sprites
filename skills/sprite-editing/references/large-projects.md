# Large editable projects

Use the checked managed launcher resolved from the loaded sprite skill. Below,
`sprite.js` means `node "<plugin-root>/scripts/run-managed.js"`. Complete
[CLI setup](cli-setup.md) and stop after a failed command. Run from the asset
project directory with the intended preview port.

## Import a file into an independent session

```text
sprite.js status
sprite.js import ./source.project.json.gz --name working-copy --session CURRENT_SESSION_ID
```

Replace `CURRENT_SESSION_ID` with the active session ID returned by `status`.
The input can be JSON or gzip (`.gz`). Import creates and activates a new editable
session with its own save destination; it preserves the input file. `--session`
guards the context before allocation, while the job also checks its originating
session and live project before activation. A session/project switch requires a
fresh import for the intended context.

The browser's **Pass design → Import an editable project** uses the same owned
job workflow and uploads the File directly. It does not call `File.text()` or
construct a complete JSON request envelope. Upload byte progress, validation
phases and cancellation remain visible.

The CLI prints progress to stderr and its JSON receipt to stdout; import does
not take `--json`. Ctrl+C requests cancellation. Once activation has been sent,
wait for its authoritative outcome: a committed session remains successful.

Source and decompressed input each have an independent 512 MiB bound. Imports
also allow at most 10,000 cells and 200,000 shapes. One validation worker runs
at a time, with up to four live jobs, a 120-second validation deadline and a
3,072 MiB worker old-generation limit. These bounds do not describe total process
memory. Validation parses a complete document in the worker; activation performs
synchronous model/persistence work on the server. This removes the ordinary
64 MiB JSON-envelope boundary without claiming constant-memory parsing or instant
activation. Completed jobs expire after 15 minutes without access.

## Retain a compact editable file

New file imports retain shared-geometry V2 through drafts, reopen, copy and
default save/download. Repeated parameter trees are immutable shared data;
editing a frame detaches its changed parameters. Shape IDs, names, colors,
ordering, timing and undo remain frame-local.

Add this property to an existing build config to request a V2 project artifact:

```json
"projectFormat": "shared"
```

The normal build command stays the same:

```text
sprite.js build ./sprite-project.json --json
```

Generators stream stdout into owned temporary storage with a 512 MiB default
bound and a 60-second default generator deadline. Stderr retains at most 64 KiB
and reports total bytes and truncation. Keep diagnostics on stderr and declare
imported dependencies in `inputs`.
The complete operations document is parsed after capture; operation/model/render
budgets still apply. Progress goes to stderr and the final report stays on
stdout. Cancellation is cooperative at work boundaries. Once publication starts
committing, it completes the swap or attempts to restore the backup and reports
the actual outcome. If restoration fails, inspect the reported retained backup
path before retrying. The generator's direct child is owned and stopped on cancellation;
arbitrary descendant processes are not managed.

Existing V1 sessions and build configs without `projectFormat` retain expanded
output. `save --format shared|expanded` selects the written representation without
changing the live project's chosen default. Save writes the session's existing
target; use a separate download for interchange.

## Hand off to an older consumer

In **Pass design**, choose **Expanded (V1)** under **Editable project format**,
then **Download editable project**. This produces an independent V1 file while
the active compact project retains its normal shared storage.

The explicit endpoint is `GET /api/workbench/project-file?format=expanded` with
`X-Sprite-Session` set to the current session. It returns plain project JSON, not
a collaboration envelope. Omit `format` to download the current storage format.

## Loading and playback

The editor receives project metadata first, then complete frames for the current
selection, visible thumbnails and preview demand. A loading or unavailable frame
cannot accept edits. Switching sessions discards obsolete requests and queued
edits; an uncertain edit receipt asks you to refresh and inspect the result.

The geometry cache holds up to 32 frames and 16 MiB of serialized frame and
shape-group data. One frame request carries at most eight references and its
complete response is limited to 8 MiB. An individually oversized frame shows an
error; the editor does not silently download the entire project instead. These
are resource bounds, not estimates of total browser heap.

Visible thumbnails and animation previews share canonical native bitmaps. The
browser uses a worker where supported and a scheduled serial fallback otherwise.
Unchanged refreshes, pan and selection overlays reuse completed work. A preview
prepares frames before starting its authored clock when they fit the bitmap
cache; larger sequences use a rolling window with visible loading. Cold frames
still take time to fetch and render, so full-sequence preparation can take much
longer than opening the selected frame.

In **All tools**, a build displays its current phase, captured bytes or operation
count and a cancellation control. Cancellation requests stop work at supported
boundaries. After publication starts committing, the receipt determines whether
the output committed, was restored or retained a backup after restoration failed.
A disconnected or aborted browser request
alone cannot confirm rollback. A successful build offers **Open generated
project** without replacing the active editing session automatically.
