"use client";

import { useState, useRef, useEffect } from "react";
import type { AIPMTerm } from "@/types/api";

interface AIPMTermHighlighterProps {
  text: string;
  terms: AIPMTerm[];
}

export function AIPMTermHighlighter({ text, terms }: AIPMTermHighlighterProps) {
  if (!terms.length) return <span>{text}</span>;

  const pattern = terms
    .map((t) => t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);

  const termMap = new Map(terms.map((t) => [t.term.toLowerCase(), t.explanation]));

  return (
    <span>
      {parts.map((part, i) => {
        const explanation = termMap.get(part.toLowerCase());
        if (explanation) {
          return <TermBadge key={i} term={part} explanation={explanation} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function TermBadge({ term, explanation }: { term: string; explanation: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="cursor-help border-b border-dashed border-violet-400 bg-violet-50 px-0.5 font-medium text-violet-700"
      >
        {term}
      </span>
      {open && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs shadow-lg"
        >
          <div className="mb-1 font-semibold text-violet-700">{term}</div>
          <div className="text-slate-600">{explanation}</div>
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" />
        </div>
      )}
    </span>
  );
}
