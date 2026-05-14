export type ProductIconName =
  | "arrow-right"
  | "calendar"
  | "check"
  | "chevron-down"
  | "close"
  | "document"
  | "download"
  | "edit"
  | "history"
  | "interview"
  | "lock"
  | "order"
  | "radar"
  | "search"
  | "shield"
  | "spark"
  | "target"
  | "user";

export function ProductIcon({ name, className = "h-5 w-5" }: { name: ProductIconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M7 3.5h6l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V3.5Z" />
          <path d="M13 3.5V8h4M9.5 12h5M9.5 15.5h5" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 1 0 2.35-5.65" />
          <path d="M4 5v5h5M12 7.5V12l3 2" />
        </svg>
      );
    case "interview":
      return (
        <svg {...common}>
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v5A2.5 2.5 0 0 1 16.5 14H12l-4 3v-3h-.5A2.5 2.5 0 0 1 5 11.5v-5Z" />
          <path d="M8.5 8h7M8.5 10.5H13" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <path d="M7 10V8a5 5 0 0 1 10 0v2" />
          <path d="M6.5 10h11A1.5 1.5 0 0 1 19 11.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z" />
        </svg>
      );
    case "order":
      return (
        <svg {...common}>
          <path d="M7 4h10l1 16-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 20 7 4Z" />
          <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
        </svg>
      );
    case "radar":
      return (
        <svg {...common}>
          <path d="M12 3l7 4v10l-7 4-7-4V7l7-4Z" />
          <path d="M12 7l3.5 2v6L12 17l-3.5-2V9L12 7Z" />
          <path d="M12 3v18M5 7l14 10M19 7 5 17" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3.5 19 6v5.5c0 4.2-2.8 7-7 9-4.2-2-7-4.8-7-9V6l7-2.5Z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="m12 3 1.8 4.5L18 9.3l-4.2 1.8L12 15.6l-1.8-4.5L6 9.3l4.2-1.8L12 3Z" />
          <path d="m18.5 15 1 2.4 2.5 1-2.5 1-1 2.6-1-2.6-2.5-1 2.5-1 1-2.4Z" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19a7 7 0 0 1 14 0" />
        </svg>
      );
  }
}

export function IconBadge({
  name,
  tone = "indigo",
  className = "",
}: {
  name: ProductIconName;
  tone?: "indigo" | "emerald" | "amber" | "slate" | "rose";
  className?: string;
}) {
  const tones = {
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
  };

  return (
    <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${tones[tone]} ${className}`}>
      <ProductIcon name={name} className="h-5 w-5" />
    </span>
  );
}
