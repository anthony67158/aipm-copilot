"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DimensionAnalysis } from "@/types/api";

interface AIPMRadarChartProps {
  dimensions: DimensionAnalysis[];
  className?: string;
  variant?: "default" | "embedded" | "compact";
}

export function AIPMRadarChart({ dimensions, className = "", variant = "default" }: AIPMRadarChartProps) {
  const data = dimensions.map((d) => ({
    dimension: d.dimensionLabel,
    required: d.requiredLevel,
    current: d.currentLevel,
  }));
  const isEmbedded = variant === "embedded";
  const isCompact = variant === "compact";

  return (
    <div className={`overflow-hidden ${isCompact ? "rounded-none border-0 bg-transparent p-0 shadow-none" : `rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(94,106,210,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] ${isEmbedded ? "p-3 shadow-none md:p-4" : "p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] md:p-7"}`} ${className}`}>
      {!isEmbedded && !isCompact && (
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5e6ad2]">Ability Map</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">整体能力画像</div>
          <div className="mt-2 max-w-2xl text-base leading-8 text-slate-600">看清你的当前水平与岗位要求之间的距离，优先处理差距最大的能力项。</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/86 px-4 py-2 text-sm font-semibold text-[#4f5fc8] shadow-sm">
          共 {dimensions.length} 个维度
        </div>
      </div>
      )}
      <div className={`${isCompact ? "rounded-none bg-transparent p-0" : isEmbedded ? "rounded-[30px] bg-white/58 p-2" : "rounded-[28px] border border-white/10 bg-white/72 p-3 shadow-inner shadow-slate-100 md:p-5"}`}>
      <div className={`${isCompact ? "h-[232px]" : isEmbedded ? "h-[280px] sm:h-[390px] lg:h-[430px]" : "h-[300px] sm:h-[420px]"} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius={isCompact ? "72%" : isEmbedded ? "70%" : "72%"} data={data}>
          <defs>
            <linearGradient id="requiredRadarFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5e6ad2" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.08} />
            </linearGradient>
            <linearGradient id="currentRadarFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.08} />
            </linearGradient>
          </defs>
            <PolarGrid gridType="polygon" radialLines={false} stroke="#dbeafe" strokeWidth={1.2} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: isCompact ? 10 : 13, fontWeight: isCompact ? 500 : 600, fill: isCompact ? "#94a3b8" : "#334155" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 3]}
            tickCount={4}
            axisLine={false}
            tick={isCompact ? false : { fontSize: 12, fill: "#94a3b8" }}
          />
          <Radar
            name="岗位要求"
            dataKey="required"
            stroke="#5e6ad2"
            fill="url(#requiredRadarFill)"
            fillOpacity={1}
            strokeWidth={3}
            dot={{ r: isCompact ? 2 : 3, fill: "#5e6ad2", strokeWidth: 0 }}
          />
          <Radar
            name="当前水平"
            dataKey="current"
            stroke="#0f766e"
            fill="url(#currentRadarFill)"
            fillOpacity={1}
            strokeWidth={3}
            dot={{ r: isCompact ? 2 : 3, fill: "#0f766e", strokeWidth: 0 }}
          />
          {!isCompact && <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: isEmbedded ? 13 : 14, fontWeight: 600, paddingTop: isEmbedded ? 10 : 18 }}
          />}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      </div>
    </div>
  );
}
