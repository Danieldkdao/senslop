"use client";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Cpu, Timer, CircleDollarSign, Info } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useProjectSettings } from "../hooks/use-project-settings";
import { summarizeUsage, groupUsage } from "../lib/usage-summary";
import {
  formatUsageNumber,
  formatUsageCost,
  formatUsageDuration,
  formatUsageMetric,
} from "../lib/formatters";

// shadcn's chart API requires keyed series metadata.
const usageChartConfig = {
  inputTokens: { label: "Input tokens", color: "var(--chart-1)" },
  outputTokens: { label: "Output tokens", color: "var(--chart-2)" },
  durationMs: { label: "Duration", color: "var(--chart-3)" },
} satisfies ChartConfig;
export const UsageSettings = () => {
  const settings = useProjectSettings();
  const [days, setDays] = useState("30");
  const [periodEnd] = useState(() => Date.now());
  const records = (settings.state.data?.usage ?? []).filter(
    (row) => Date.parse(row.createdAt) >= periodEnd - Number(days) * 86400000,
  );
  const summary = summarizeUsage(records);
  const daily = groupUsage(records, "day");
  const tasks = groupUsage(records, "task");
  return (
    <div className="flex w-full min-w-0 flex-col gap-5 text-base">
      <Select value={days} onValueChange={(value) => value && setDays(value)}>
        <SelectTrigger aria-label="Usage period" className="w-full text-base">
          <SelectValue>Last {days} days</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {["7", "30", "90"].map((value) => (
            <SelectItem key={value} value={value} className="text-base">
              Last {value} days
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-5">
        {[
          {
            Icon: Cpu,
            label: "Measured tokens",
            value: formatUsageNumber(summary.tokens),
          },
          {
            Icon: Timer,
            label: "Model execution time",
            value: formatUsageDuration(summary.durationMs),
          },
          {
            Icon: CircleDollarSign,
            label: "Estimated cost",
            value: formatUsageCost(summary.cost),
          },
        ].map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="flex items-center gap-2 text-muted-foreground">
              <stat.Icon aria-hidden="true" className="size-4" />
              {stat.label}
            </span>
            <span className="text-xl font-medium">{stat.value}</span>
          </div>
        ))}
      </div>
      {settings.state.error && (
        <span role="alert" className="text-destructive">
          {settings.state.error.message}
        </span>
      )}
      {!records.length ? (
        <span role="status" className="text-muted-foreground">
          Usage charts appear after a model request. Existing runs without
          accounting remain unmeasured.
        </span>
      ) : (
        <>
          <section className="flex min-w-0 flex-col gap-3">
            <h3 className="text-base font-medium">Tokens over time</h3>
            <ChartContainer
              config={usageChartConfig}
              className="h-56 w-full [&_text]:text-base"
            >
              <AreaChart accessibilityLayer data={daily}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="key" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="inputTokens"
                  stroke="var(--color-inputTokens)"
                  fill="var(--color-inputTokens)"
                  fillOpacity={0.12}
                  stackId="tokens"
                />
                <Area
                  dataKey="outputTokens"
                  stroke="var(--color-outputTokens)"
                  fill="var(--color-outputTokens)"
                  fillOpacity={0.12}
                  stackId="tokens"
                />
              </AreaChart>
            </ChartContainer>
          </section>
          <section className="flex min-w-0 flex-col gap-3">
            <h3 className="text-base font-medium">Usage by task</h3>
            <ChartContainer
              config={usageChartConfig}
              className="h-56 w-full [&_text]:text-base"
            >
              <BarChart accessibilityLayer data={tasks}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={formatUsageMetric}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        formatUsageMetric(String(value))
                      }
                    />
                  }
                />
                <Bar
                  dataKey="inputTokens"
                  fill="var(--color-inputTokens)"
                  radius={4}
                />
                <Bar
                  dataKey="outputTokens"
                  fill="var(--color-outputTokens)"
                  radius={4}
                />
              </BarChart>
            </ChartContainer>
          </section>
          <section className="flex min-w-0 flex-col gap-3">
            <h3 className="text-base font-medium">Execution time by task</h3>
            <ChartContainer
              config={usageChartConfig}
              className="h-56 w-full [&_text]:text-base"
            >
              <BarChart accessibilityLayer data={tasks} layout="vertical">
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={formatUsageDuration} hide />
                <YAxis
                  type="category"
                  dataKey="key"
                  tickFormatter={formatUsageMetric}
                  width={110}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        formatUsageMetric(String(value))
                      }
                      formatter={(value) => formatUsageDuration(Number(value))}
                    />
                  }
                />
                <Bar
                  dataKey="durationMs"
                  fill="var(--color-durationMs)"
                  radius={4}
                />
              </BarChart>
            </ChartContainer>
          </section>
        </>
      )}
      <div className="flex items-center gap-2">
        <TooltipWrapper content="Estimates are not invoices. Missing pricing or usage stays unknown. External-agent usage is outside these totals; no prompts or source are recorded for usage accounting.">
          <span tabIndex={0} aria-label="Usage accounting details">
            <Info aria-hidden="true" className="size-4 text-muted-foreground" />
          </span>
        </TooltipWrapper>
        <span className="text-base text-muted-foreground">
          {summary.incomplete
            ? "Some usage is unreported"
            : "Measured usage; pricing may be unavailable"}
        </span>
      </div>
    </div>
  );
};
