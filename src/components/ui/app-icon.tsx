import type { ReactNode, SVGProps } from "react";

/** Minimal consistent stroke-icon system for the existing app chrome.
 * Decorative only: every navigation target keeps its visible Arabic label.
 * No extra icon dependency or network font is needed.
 */
export type AppIconName =
  | "home"
  | "inbox"
  | "employee"
  | "settings"
  | "billing"
  | "integrations"
  | "admin"
  | "chevron"
  | "sun"
  | "moon";

export function AppIcon({
  name,
  className,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "children"> & { name: AppIconName }) {
  let content: ReactNode;
  switch (name) {
    case "home":
      content = <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-7h6v7" /></>;
      break;
    case "inbox":
      content = <><path d="M4 4h16v13H4z" /><path d="M4 13h5l2 3h2l2-3h5" /><path d="M4 20h16" /></>;
      break;
    case "employee":
      content = <><path d="M12 3 9.6 9.6 3 12l6.6 2.4L12 21l2.4-6.6L21 12l-6.6-2.4L12 3Z" /><path d="M19.5 3.5v4M17.5 5.5h4" /></>;
      break;
    case "settings":
      content = <><path d="M9.8 3h4.4l.6 2.1 1.7.8 2-.8 3.1 3.1-.9 1.9.8 1.8 2 .6v4.2l-2 .6-.8 1.7.9 1.9-3.1 3.1-2-.8-1.7.7-.6 2.1H9.8l-.6-2.1-1.7-.7-2 .8-3.1-3.1.9-1.9-.8-1.7-2-.6v-4.2l2-.6.8-1.8-.9-1.9 3.1-3.1 2 .8 1.7-.8L9.8 3Z" transform="translate(1 -1) scale(.92)" /><circle cx="12" cy="12" r="3" /></>;
      break;
    case "billing":
      content = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>;
      break;
    case "integrations":
      content = <><rect x="2" y="7" width="7" height="10" rx="2" /><rect x="15" y="7" width="7" height="10" rx="2" /><path d="M9 12h6M6 7V4M18 7V4M6 20v-3M18 20v-3" /></>;
      break;
    case "admin":
      content = <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 7h8M8 12h8M8 17h5" /></>;
      break;
    case "chevron":
      content = <path d="m9 6 6 6-6 6" />;
      break;
    case "sun":
      content = <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>;
      break;
    case "moon":
      content = <path d="M20.7 13.2A9 9 0 0 1 10.8 3.3 9 9 0 1 0 20.7 13.2Z" />;
      break;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {content}
    </svg>
  );
}
