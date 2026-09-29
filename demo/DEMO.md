# Five minute event lifecycle demo

## Run it

From the repository root, run:

```sh
bash demo/run-lifecycle.sh
```

The script starts a uniquely named Podman PostgreSQL container with no volume,
applies the current migrations to that disposable database, starts the
production app image (`dogfood-platform-web:latest`, built by
`podman compose up -d --build`; override with `DEMO_IMAGE`) on
`127.0.0.1:3001`, and runs the dedicated Playwright journey. It never attaches
to or removes the normal `dogfood-platform` Compose database or uploads volume.
Use `DEMO_DB_PORT=55440` if the default demo database port is occupied. The
demo app port is `3001` and must be free. The local `postgres:17` image and
local `postgres:17` image and Playwright's pinned Chromium browser must already
be available for an offline run. On a fresh machine, install Chromium into the
temporary browser cache with:

```sh
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/dogfood-lifecycle-browsers bunx playwright install chromium
```

The test records a browser video at `demo/artifacts/lifecycle.webm` when the
run succeeds and the recording is at most 25 MB. Its 1280×800 capture keeps
the interface readable. Labeled evidence cards briefly show screenshots from
the live participant and judge sessions, the real assigned/unassigned judge
API responses, and the participant's public results view. These are recording
overlays from the test harness, not product UI. Playwright's raw run output
stays under the ignored `demo/artifacts/test-results/` directory.

## Five minute narration

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:40 | Organizer creates the event and opens registration; a captured form card labels the organizer step. | “The organizer starts an event from the product UI. The event receives its own public page and organizer dashboard.” |
| 0:40–1:25 | Participant registers, joins, and creates a team; the recording shows a live participant-session capture. | “A participant joins through the event page, then creates a team while registration is open.” |
| 1:25–2:10 | Organizer opens submissions; participant creates and submits Harborlight, followed by a live-session capture showing SUBMITTED. | “The organizer opens submissions. The participant saves a project revision and submits it for judging.” |
| 2:10–3:05 | Organizer adds an assigned judge and a second, unassigned judge, advances into judging, creates a rubric, and assigns the project. | “The organizer gives two judges event membership, defines a weighted criterion, and assigns the submitted project to one judge.” |
| 3:05–3:45 | Assigned judge's raw API request succeeds; unassigned judge's raw API request is denied, with both actual statuses shown; the judge-session capture confirms submission. | “Assignment isolation is checked directly against the JSON API: the assigned judge can read the evaluation, while another event judge receives HTTP 403.” |
| 3:45–5:00 | Organizer locks evaluations, generates the ranking, publishes results, and advances to Published; a participant-session capture shows the public result. | “The organizer closes judging, freezes evaluations, builds the ranking snapshot, and publishes the result so participants can see the outcome.” |

## Seeded state

No event, account, membership, team, project, rubric, assignment, evaluation, or
result is seeded outside the browser. The runner only migrates its empty,
disposable database before the browser flow. The journey creates separate
organizer, participant, and judge accounts in the UI.

## Acceptance evidence

The browser journey asserts each state change, participant submission, judge
evaluation, locked coverage, ranking entry, and final Published state. While
the evaluation exists, it makes authenticated raw API GET requests from both
judge sessions and asserts HTTP 200 for the assigned judge and HTTP 403 for the
unassigned event judge. It keeps its own test and video output separate from
the regular acceptance suite.
