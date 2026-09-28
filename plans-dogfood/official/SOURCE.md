# Official DOGFOOD acceptance files

Retrieved from the official downloads at `https://dogfoodhack.com/spec/` on
2026-09-28. These are source snapshots; re-check the site before a later run.

| File | Official URL | SHA-256 |
| --- | --- | --- |
| `spec.md` | <https://dogfoodhack.com/spec/spec.md> | `07e479728e7e6961fcf5053e159e6dc807bae3e4b371ee088e4a17897950d290` |
| `run.py` | <https://dogfoodhack.com/spec/run.py> | `aa98963841bc8e18e8e5d76f0499697c093dd3c0055f9d73a459f592f4dcf09d` |
| `example.dogfood.toml` | <https://dogfoodhack.com/spec/example.dogfood.toml> | `58c974da4f0faa6d1a4fbb158770b34c470f2893d3169405ed73deca0f3a9e44` |
| `fixtures.json` | <https://dogfoodhack.com/spec/fixtures.json> | `252896bc45d49fca69ad413be40c6bfde9d9b9f9dd8db702b3ff74eaaa181121` |

The repository-root `fixtures.json` has the same SHA-256 and parsed JSON as the
official fixture. It was not replaced. See the root `.dogfood.toml` for the
official `[portal]`, `[tiers]`, `[auth]`, and `[routes]` configuration shape.

The fixture is test data and a matching acceptance report measures only the
published checks. Neither establishes eligibility under the event code-window
rule or any other event rule; this snapshot makes no eligibility claim.
