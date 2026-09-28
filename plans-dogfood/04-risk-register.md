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
