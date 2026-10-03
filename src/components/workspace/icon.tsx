import type { CSSProperties } from "react";

export type WorkspaceIconName =
  | "home"
  | "calendar"
  | "message"
  | "payment"
  | "settings"
  | "people"
  | "leaf"
  | "help"
  | "profile";

const paths: Record<WorkspaceIconName, string> = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z",
  calendar:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1",
  message:
    "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5ZM7 10h9m-9 4h6",
  payment:
    "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM2 10h20M6 15h4",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6M8 7h.01M16 17h.01",
  people:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  leaf: "M20 3C8 3 3 8 3 14a7 7 0 0 0 7 7c6 0 11-5 10-18ZM3 21 15 9",
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 3.99m.01 3h.01",
  profile: "M20 21v-2a7 7 0 0 0-14 0v2m11-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
};

export function WorkspaceIcon({
  name,
  className,
  style,
}: {
  name: WorkspaceIconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
