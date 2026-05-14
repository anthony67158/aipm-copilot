type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  className?: string;
  compact?: boolean;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  aside,
  className = "",
  compact = false,
}: SectionHeaderProps) {
  return (
    <div className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`.trim()}>
      <div className="min-w-0">
        {eyebrow ? <div className="text-sm font-semibold text-indigo-700">{eyebrow}</div> : null}
        <h2 className={`mt-2 font-semibold tracking-tight text-slate-950 ${compact ? "text-2xl md:text-[2rem]" : "text-[1.9rem] md:text-3xl"}`}>
          {title}
        </h2>
        {description ? <p className="mt-3 max-w-3xl text-base leading-8 text-slate-500">{description}</p> : null}
      </div>
      {aside ? <div className="min-w-0 md:max-w-md">{aside}</div> : null}
    </div>
  );
}
