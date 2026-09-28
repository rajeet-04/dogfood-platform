import {
  formatScore,
  type EventResults,
  type ResultEntry,
} from "../server/read-models/results";

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function ResultsMeta({ results }: { results: EventResults }) {
  return (
    <p className="mt-1 text-small text-fg-subtle">
      {results.publishedAt
        ? `Published ${formatDate(results.publishedAt)}`
        : "Not published yet"}{" "}
      · scoring v{results.scoringVersion} · normalization v
      {results.normalizationVersion} · ranking v{results.rankingVersion}
    </p>
  );
}

export function ResultsTable({
  results,
  highlightProjectId,
  showCriteria = true,
}: {
  results: EventResults;
  highlightProjectId?: string | null;
  showCriteria?: boolean;
}) {
  if (results.entries.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-line-strong bg-surface-sunken/50 px-4 py-8 text-center text-small text-fg-subtle">
        This snapshot does not contain any ranked projects.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table data-testid="results-table" className="w-full text-small">
        <caption className="sr-only">
          Ranked projects with weighted scores
        </caption>
        <thead>
          <tr className="border-b border-line text-left text-caption font-medium text-fg-subtle">
            <th scope="col" className="w-16 py-2 pr-4">
              Rank
            </th>
            <th scope="col" className="py-2 pr-4">
              Project
            </th>
            <th scope="col" className="py-2 pr-4">
              Team
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              Score
            </th>
            {showCriteria ? (
              <th scope="col" className="py-2">
                Score breakdown
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {results.entries.map((entry) => (
            <ResultsRow
              key={entry.projectId}
              entry={entry}
              highlighted={entry.projectId === highlightProjectId}
              showCriteria={showCriteria}
            />
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-fg-faint">
        Score is the weighted total across criteria. Rank uses the normalized
        ranking score so judges are compared on a like-for-like scale.
      </p>
    </div>
  );
}

const PODIUM_CLASS: Record<number, string> = {
  1: "bg-warning-soft text-warning-fg",
  2: "bg-neutral-soft text-neutral-fg",
  3: "bg-accent-2-soft text-accent-2-fg",
};

function ResultsRow({
  entry,
  highlighted,
  showCriteria,
}: {
  entry: ResultEntry;
  highlighted: boolean;
  showCriteria: boolean;
}) {
  return (
    <tr
      data-testid="results-row"
      data-project-id={entry.projectId}
      className={
        highlighted
          ? "border-b border-accent-border bg-accent-soft/50"
          : "border-b border-line-subtle"
      }
    >
      <td className="py-2.5 pr-4">
        <span
          className={`inline-flex size-7 items-center justify-center rounded-full text-caption font-semibold tabular-nums ${
            PODIUM_CLASS[entry.rank] ?? "text-fg-faint"
          }`}
        >
          {entry.rank}
        </span>
      </td>
      <td className="py-2.5 pr-4">
        <span className="font-medium text-fg">{entry.projectTitle}</span>
        {highlighted ? (
          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent-soft-fg">
            Your project
          </span>
        ) : null}
      </td>
      <td className="py-2.5 pr-4 text-fg-muted">{entry.teamName ?? "—"}</td>
      <td
        className="py-2.5 pr-4 text-right font-semibold text-fg tabular-nums"
        data-testid="result-score"
      >
        {formatScore(entry.weightedTotal ?? entry.score)}
      </td>
      {showCriteria ? (
        <td className="py-2.5 text-caption text-fg-muted">
          {entry.criteria.length === 0 ? (
            "—"
          ) : (
            <ul className="space-y-1">
              {entry.criteria.map((criterion) => (
                <li key={criterion.criterionId}>
                  {criterion.name}:{" "}
                  <span className="font-medium text-fg">
                    {formatScore(criterion.meanWeightedScore)}
                  </span>{" "}
                  <span className="text-fg-faint">
                    (scored by {criterion.scoredBy})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </td>
      ) : null}
    </tr>
  );
}
