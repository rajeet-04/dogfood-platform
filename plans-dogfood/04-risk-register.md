# DOGFOOD Risk Register

| Risk | Likelihood | Impact | Detection | Mitigation | Cut/Recovery |
|---|---|---:|---|---|---|
| Released spec conflicts with preplanned schema | Medium | Critical | Hour 0 spec diff | Reconcile before coding; preserve domain boundaries, change concrete schema | Drop speculative fields/features |
| Auth consumes too much time | Medium | High | Foundation exceeds Hour 8 | Use minimal local credentials + secure sessions | No OAuth/social auth |
| Cross-event authorization bug | Medium | Critical | Abuse tests | Every resource query validates event ownership; policy helpers | Block release until green |
| Judge sees peer scores | Low/Medium | Critical | Explicit negative tests | Assignment-scoped queries, no client-side hiding | Block release until green |
| Deadline bypass | Medium | High | Direct endpoint tests | Server/database time inside mutation | Block release until green |
| Audit event written without mutation or vice versa | Medium | High | Transaction rollback tests | Same SQL transaction | Block release until green |
| Normalization behaves badly on flat scores | High | Medium | Zero-variance fixture | Neutral contribution + diagnostic | Disable normalization for batch |
| Too few judge samples | High | Medium | Batch-size fixture | Minimum eligible batch threshold | Use raw/neutral policy per spec |
| Ranking changes between runs | Low | Critical | Determinism tests | Pure functions + stable tie ordering + versioned config | Block release until green |
| ORM hides needed SQL / query becomes awkward | Medium | Medium | Slow dashboard/join work | Use Drizzle SQL primitives where clearer | Keep ORM thin |
| Docker boot fails on clean machine | Medium | Critical | Clean clone test | Health checks, deterministic migrations, env example | Block submission until fixed |
| Too much time spent on UI | High | High | Critical-path burn chart | Freeze polish until T1/T2 acceptance green | Use simple shadcn surfaces |
| Scope expands into T3/T4 too early | High | High | Any stretch work before Hour 56 | Enforce cut-lines | Delete/park stretch branch |
| Data model migration churn | Medium | High | Multiple destructive migrations early | Freeze core relationships after spec reconciliation | Prefer additive migrations |
| Export requirements emerge late | Medium | Medium | Spec diff | Keep export module isolated over read models | Implement plain CSV first |
| Organizer needs diagnostics without score leakage | Medium | High | UX acceptance | Separate progress read model from evaluation data | Show counts/status only |
| Submission platform outage near deadline | Low | Critical | External event issue | Submit with buffer; keep final artifacts ready | Follow organizer contingency |
| Docs/demo video drafted only at Phase 8 → weak scoring on 60%+ of rubric | High | High | Phase 8 doc sections still empty at Hour 60 | Write ARCHITECTURE.md/DATA-MODEL.md/JUDGING.md incrementally as each phase gate goes green; reserve a dedicated demo-recording block in the submission buffer | Ship minimal but accurate docs over polished-but-late ones |
| Existing implementation predates kickoff and conflicts with new-code-only rule | High | Critical | Compare source commit/file provenance with Sep 26, 2026 18:00 UTC kickoff | Treat pre-event work as planning/reference only; establish competition-code provenance and resolve eligibility before making an entry claim | Do not claim eligibility based on post-kickoff commits alone |
| Official `.dogfood.toml`, fixtures, and runner not integrated | High | Critical | Inspect root config and run official checker | Use published files, load shared fixtures, print four auth headers, commit `run.py` output | Keep local acceptance separate and mark official verification pending |
| Seven official checks mistaken for complete tier verification | Medium | High | Compare report assertions with T1–T4 crosswalk | Add manual tier evidence, tests, docs, and demo for untested features | Claim only tiers supported by all evidence |
| Organizer score policy conflicts with official role matrix | Medium | High | Compare `01-architecture-v1.md` with main-site matrix | Resolve in Phase 0; retain judge peer and track isolation | Do not claim role-matrix compliance until policy is settled |
