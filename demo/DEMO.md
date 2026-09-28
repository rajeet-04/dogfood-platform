# Five minute event lifecycle demo

## Run it

From the repository root, run:

```sh
bash demo/run-lifecycle.sh
```

The script starts a uniquely named Podman PostgreSQL container with no volume,
applies the current migrations to that disposable database, starts the app on
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
run succeeds and the recording is at most 25 MB. Playwright's raw run output
stays under the ignored `demo/artifacts/test-results/` directory.

## Five minute narration

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:40 | Organizer creates the event and opens registration. | “The organizer starts an event from the product UI. The event receives its own public page and organizer dashboard.” |
| 0:40–1:25 | Participant registers, joins, and creates a team. | “A participant joins through the event page, then creates a team while registration is open.” |
| 1:25–2:10 | Organizer opens submissions; participant creates and submits Harborlight. | “The organizer opens submissions. The participant saves a project revision and submits it for judging.” |
| 2:10–3:05 | Organizer adds a judge, advances into judging, creates a rubric, and assigns the project. | “The event moves through its state machine. The organizer gives a judge access, defines a weighted criterion, and assigns the submitted project.” |
| 3:05–3:45 | Judge scores and submits the evaluation. | “The judge uses a separate signed-in session. Their score is private while judging is in progress.” |
| 3:45–5:00 | Organizer locks evaluations, generates the ranking, publishes results, and advances to Published. | “The organizer closes judging, freezes evaluations, builds the ranking snapshot, and publishes the result so participants can see the outcome.” |

## Seeded state

No event, account, membership, team, project, rubric, assignment, evaluation, or
result is seeded outside the browser. The runner only migrates its empty,
disposable database before the browser flow. The journey creates separate
organizer, participant, and judge accounts in the UI.

## Acceptance evidence

The browser journey asserts each state change, participant submission, judge
evaluation, locked coverage, ranking entry, and final Published state. It keeps
its own test and video output separate from the regular acceptance suite.

The recording does not include a direct raw-API request proving an unassigned
judge is denied access to another project's data; this flow has only one
project and shows the assigned judge scoring that project. Keep that API
isolation check as a separate acceptance item.
