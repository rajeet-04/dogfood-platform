import { Field, Input } from "./ui/input";
import {
  getEventWindowSections,
  type EventWindowBoundary,
  type EventWindowName,
} from "../lib/event-window-fields";

type Props = {
  windows: EventWindowName[];
  values?: Partial<Record<EventWindowBoundary, string>>;
};

export function EventWindowFields({ windows, values }: Props) {
  return (
    <div className="space-y-4">
      {getEventWindowSections(windows).map((window) => {
        return (
          <section key={window.name} aria-labelledby={window.headingId}>
            <h3
              id={window.headingId}
              className="mb-2 text-small font-semibold text-fg"
            >
              {window.label}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={window.fields[0]!.label}>
                <Input
                  type="datetime-local"
                  name={window.fields[0]!.name}
                  defaultValue={values?.[window.fields[0].name] ?? ""}
                />
              </Field>
              <Field label={window.fields[1]!.label}>
                <Input
                  type="datetime-local"
                  name={window.fields[1]!.name}
                  defaultValue={values?.[window.fields[1].name] ?? ""}
                />
              </Field>
            </div>
          </section>
        );
      })}
    </div>
  );
}
