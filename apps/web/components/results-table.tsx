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
    <p className="mt-1 text-sm text-slate-500">
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
      <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
        This snapshot does not contain any ranked projects.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table
        className="w-full text-sm"
        data-testid="results-table"
      >
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="w-16 py-2 pr-4 font-medium">Rank</th>
            <th className="py-2 pr-4 font-medium">Project</th>
            <th className="py-2 pr-4 font-medium">Team</th>
            <th className="py-2 pr-4 text-right font-medium">Score</th>
            {showCriteria ? (
              <th className="py-2 font-medium">Score breakdown</th>
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
      <p className="mt-2 text-xs text-slate-400">
        Score is the weighted total across criteria. Rank uses the normalized
        ranking score so judges are compared on a like-for-like scale.
      </p>
    </div>
  );
}

const PODIUM_CLASS: Record<number, string> = {
  1: "bg-amber-100 text-amber-800",
  2: "bg-slate-200 text-slate-700",
  3: "bg-orange-100 text-orange-800",
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
          ? "border-b bg-indigo-50/70"
          : "border-b border-slate-100"
      }
    >
      <td className="py-2 pr-4">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
            PODIUM_CLASS[entry.rank] ?? "text-slate-500"
          }`}
        >
          {entry.rank}
        </span>
      </td>
      <td className="py-2 pr-4">
        <span className="font-medium text-slate-800">{entry.projectTitle}</span>
        {highlighted ? (
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            Your project
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-4 text-slate-600">
        {entry.teamName ?? "—"}
      </td>
      <td
        className="py-2 pr-4 text-right font-semibold text-slate-800 tabular-nums"
        data-testid="result-score"
      >
        {formatScore(entry.weightedTotal ?? entry.score)}
      </td>
      {showCriteria ? (
        <td className="py-2 text-xs text-slate-600">
          {entry.criteria.length === 0 ? (
            "—"
          ) : (
            <ul className="space-y-0.5">
              {entry.criteria.map((criterion) => (
                <li key={criterion.criterionId}>
                  {criterion.name}:{" "}
                  <span className="font-medium">
                    {formatScore(criterion.meanWeightedScore)}
                  </span>{" "}
                  <span className="text-slate-400">
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
