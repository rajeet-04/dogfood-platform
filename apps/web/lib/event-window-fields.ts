export type EventWindowName = "registration" | "submission" | "judging";
export type EventWindowBoundary = `${EventWindowName}${"OpensAt" | "ClosesAt"}`;

export function getEventWindowSections(windows: EventWindowName[]): Array<{
  name: EventWindowName;
  label: string;
  headingId: string;
  fields: [
    { label: string; name: EventWindowBoundary },
    { label: string; name: EventWindowBoundary },
  ];
}> {
  return windows.map((name) => {
    const label = name[0]!.toUpperCase() + name.slice(1);
    const prefix = name;
    return {
      name,
      label,
      headingId: `${prefix}-window-heading`,
      fields: [
        { label: `${label} opens`, name: `${prefix}OpensAt` as EventWindowBoundary },
        { label: `${label} closes`, name: `${prefix}ClosesAt` as EventWindowBoundary },
      ],
    };
  });
}
