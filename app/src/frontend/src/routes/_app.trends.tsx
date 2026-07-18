import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import { useSifa, formatZAR } from "@/lib/sifa/context";
import { isMoneyMovement } from "@/lib/sifa/types";
import { ArrowUpRight, ArrowDownRight, X } from "lucide-react";

interface ChartTileProps {
  title: string;
  value: string;
  label: string;
  children: React.ReactNode;
  isPositive?: boolean;
  range?: number;
  setRange?: (range: number) => void;
}

function ChartTile({
  title,
  value,
  label,
  children,
  isPositive = true,
  range,
  setRange,
}: ChartTileProps) {
  const [expanded, setExpanded] = useState(false);
  const tone = isPositive ? "emerald" : "brick";

  return (
    <div className="relative group flex flex-col h-full">
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-left rounded-2xl border border-hair bg-card p-4 flex flex-col justify-between h-full min-h-[110px] transition-transform hover:scale-[1.02] relative group"
      >
        <div className="flex items-center justify-between text-muted w-full">
          <p className="text-[11px] font-semibold uppercase tracking-widest">{title}</p>
          <span className={tone === "emerald" ? "text-emerald" : "text-brick"}>
            {isPositive ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownRight className="h-4 w-4" />
            )}
          </span>
        </div>
        <div>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</p>
          <p className="text-[10px] text-muted mt-1 uppercase tracking-wider">{label}</p>
        </div>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-paper rounded-3xl p-6 w-full max-w-3xl shadow-xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setExpanded(false)}
              className="absolute top-4 right-4 text-muted hover:text-ink transition-colors bg-paper rounded-full p-1 shadow-sm border border-hair z-10"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="font-display text-xl font-semibold mb-6">{title}</h2>
            <div className="h-72 w-full">{children}</div>
          </div>
        </div>
      )}
      {setRange && (
        <div className="flex items-center gap-2 mt-2">
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="flex-1 rounded-full border border-hair bg-paper px-3 py-1.5 text-xs text-muted focus:outline-none appearance-none cursor-pointer"
          >
            <option value={2}>Last 3 Months</option>
            <option value={5}>Last 6 Months</option>
            <option value={11}>Last 12 Months</option>
          </select>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_app/trends")({
  component: TrendsPage,
});

const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#2F6F5E",
  "Eating out": "#D89A3D",
  Transport: "#B45B47",
  Rent: "#1E4B3F",
  Utilities: "#7A7263",
  Entertainment: "#6b21a8",
  Shopping: "#be185d",
  Health: "#0369a1",
  Salary: "#2F6F5E",
  Freelance: "#D89A3D",
  Other: "#16231C",
};

function TrendsPage() {
  const { transactions } = useSifa();

  const [incomeRange, setIncomeRange] = useState<number>(5);
  const [profitRange, setProfitRange] = useState<number>(5);
  const [rateRange, setRateRange] = useState<number>(5);
  const [savingsRange, setSavingsRange] = useState<number>(5);
  const [spendingRange, setSpendingRange] = useState<number>(5);

  const { allMonthlyData, categoryKeys } = useMemo(() => {
    // 1. Initialize 12-month window (max possible range)
    const dataMap = new Map<
      string,
      {
        monthStr: string;
        income: number;
        expenses: number;
        saved: number;
        savingsRate: number;
        cumulativeSavings: number;
        categories: Record<string, number>;
      }
    >();

    const d = new Date();
    d.setDate(1); // avoid end of month skipping
    const keysInOrder: string[] = [];

    for (let i = 11; i >= 0; i--) {
      const past = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const label = past.toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
      const key = `${past.getFullYear()}-${past.getMonth()}`;
      dataMap.set(key, {
        monthStr: label,
        income: 0,
        expenses: 0,
        saved: 0,
        savingsRate: 0,
        cumulativeSavings: 0,
        categories: {},
      });
      keysInOrder.push(key);
    }

    // 2. Aggregate raw data
    const foundCategories = new Set<string>();

    for (const t of transactions) {
      // Money moved between the user's own accounts isn't income or spending.
      if (isMoneyMovement(t.category)) continue;
      const td = new Date(t.date);
      const key = `${td.getFullYear()}-${td.getMonth()}`;
      if (dataMap.has(key)) {
        const item = dataMap.get(key)!;
        if (t.type === "income") {
          item.income += t.amount;
        } else {
          item.expenses += t.amount;
          item.categories[t.category] = (item.categories[t.category] || 0) + t.amount;
          foundCategories.add(t.category);
        }
      }
    }

    // 3. Compute derived metrics
    let runningTotal = 0;
    const finalMonthlyData = keysInOrder.map((key) => {
      const item = dataMap.get(key)!;
      item.saved = item.income - item.expenses;
      item.savingsRate = item.income > 0 ? Math.round((item.saved / item.income) * 100) : 0;
      runningTotal += item.saved;
      item.cumulativeSavings = runningTotal;
      return item;
    });

    return {
      allMonthlyData: finalMonthlyData,
      categoryKeys: Array.from(foundCategories),
    };
  }, [transactions]);

  // Derived helpers to slice data per widget
  const getSlicedData = (range: number) => allMonthlyData.slice(-(range + 1));

  const incomeData = useMemo(() => getSlicedData(incomeRange), [allMonthlyData, incomeRange]);
  const totalIncome = useMemo(() => incomeData.reduce((sum, d) => sum + d.income, 0), [incomeData]);
  const totalExpenses = useMemo(
    () => incomeData.reduce((sum, d) => sum + d.expenses, 0),
    [incomeData],
  );

  /**
   * Averages divide by months that actually contain data, not by the width of
   * the window. Someone who has imported one statement genuinely saved 17%
   * this month — dividing that by six empty months reports 3%, which reads as
   * a bug and undersells them.
   */
  const monthsWithData = (rows: typeof allMonthlyData) =>
    Math.max(1, rows.filter((d) => d.income > 0 || d.expenses > 0).length);

  const profitData = useMemo(() => getSlicedData(profitRange), [allMonthlyData, profitRange]);
  const totalSaved = useMemo(() => profitData.reduce((sum, d) => sum + d.saved, 0), [profitData]);
  const avgMonthlyProfit = useMemo(
    () => Math.round(totalSaved / monthsWithData(profitData)),
    [totalSaved, profitData],
  );

  const rateData = useMemo(() => getSlicedData(rateRange), [allMonthlyData, rateRange]);

  /**
   * Rate over the window's totals, not the mean of each month's rate.
   *
   * Averaging the percentages weights every month equally regardless of the
   * money in it: a R100 month where R50 was kept (50%) cancelled out a
   * R50 000 month where R5 000 was kept (10%) and reported 30%, when the
   * period actually kept 10%. Summing first is the rate the user can check
   * against their own income and savings figures.
   */
  const avgSavingsRate = useMemo(() => {
    const income = rateData.reduce((sum, d) => sum + d.income, 0);
    if (income <= 0) return 0;
    const saved = rateData.reduce((sum, d) => sum + d.saved, 0);
    return Math.round((saved / income) * 100);
  }, [rateData]);

  const savingsData = useMemo(() => getSlicedData(savingsRange), [allMonthlyData, savingsRange]);
  const savingsAmount = useMemo(
    () => savingsData.reduce((sum, d) => sum + d.saved, 0),
    [savingsData],
  );

  const spendingData = useMemo(() => getSlicedData(spendingRange), [allMonthlyData, spendingRange]);
  const localCategoryData = useMemo(() => {
    const topCategoryTotals = new Map<string, number>();
    spendingData.forEach((d) => {
      Object.entries(d.categories).forEach(([cat, val]) => {
        topCategoryTotals.set(cat, (topCategoryTotals.get(cat) || 0) + val);
      });
    });
    return Array.from(topCategoryTotals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [spendingData]);

  const topCategoryName = useMemo(() => localCategoryData[0]?.name || "N/A", [localCategoryData]);
  const topCategoryAmount = useMemo(() => localCategoryData[0]?.value || 0, [localCategoryData]);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ color?: string; fill?: string; name: string; value: number }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-paper p-3 rounded-xl shadow-lg border border-hair text-sm">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map(
            (
              entry: { color?: string; fill?: string; name: string; value: number },
              index: number,
            ) => (
              <div key={index} className="flex justify-between gap-4">
                <span style={{ color: entry.color || entry.fill }}>{entry.name}:</span>
                <span className="font-mono tabular-nums">
                  {entry.name === "Savings Rate" ? `${entry.value}%` : formatZAR(entry.value)}
                </span>
              </div>
            ),
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Trends</h1>
        <p className="mt-1 text-sm text-muted">Watch your money over time.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-8">
        {/* Primary Cash Flow */}
        <ChartTile
          title="Income vs Expenses"
          value={formatZAR(totalIncome - totalExpenses)}
          label={`Net Cash Flow (${incomeRange + 1}m)`}
          isPositive={totalIncome - totalExpenses >= 0}
          range={incomeRange}
          setRange={setIncomeRange}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={incomeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="monthStr"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
                dy={10}
              />
              <YAxis
                tickFormatter={(val) => `R${val / 1000}k`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                wrapperStyle={{ zIndex: 100 }}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />
              <Bar dataKey="income" name="Income" fill="#2F6F5E" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#B45B47" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartTile>

        {/* Net Profit Trend */}
        <ChartTile
          title="Net Profit"
          value={formatZAR(avgMonthlyProfit)}
          label={`Average/mo (${profitRange + 1}m)`}
          isPositive={totalSaved >= 0}
          range={profitRange}
          setRange={setProfitRange}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profitData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorNetProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D89A3D" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#D89A3D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="monthStr"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
                dy={10}
              />
              <YAxis
                tickFormatter={(val) => `R${val / 1000}k`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "rgba(0,0,0,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }}
                wrapperStyle={{ zIndex: 100 }}
              />
              <Area
                type="monotone"
                dataKey="saved"
                name="Net Profit"
                stroke="#D89A3D"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorNetProfit)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartTile>

        {/* Savings Rate Trend */}
        <ChartTile
          title="Savings Rate"
          value={`${avgSavingsRate}%`}
          label={`Average (${rateRange + 1}m)`}
          isPositive={avgSavingsRate > 0}
          range={rateRange}
          setRange={setRateRange}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rateData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="monthStr"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
                dy={10}
              />
              <YAxis
                tickFormatter={(val) => `${val}%`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
              />
              <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100 }} />
              <Line
                type="monotone"
                dataKey="savingsRate"
                name="Savings Rate"
                stroke="#D89A3D"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartTile>

        {/* Cumulative Savings */}
        <ChartTile
          title="Cumul. Savings"
          value={formatZAR(savingsAmount)}
          label={`Total Growth (${savingsRange + 1}m)`}
          isPositive={savingsAmount >= 0}
          range={savingsRange}
          setRange={setSavingsRange}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={savingsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2F6F5E" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2F6F5E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="monthStr"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
                dy={10}
              />
              <YAxis
                tickFormatter={(val) => `R${val / 1000}k`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
              />
              <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100 }} />
              <Area
                type="monotone"
                dataKey="cumulativeSavings"
                name="Total Saved"
                stroke="#2F6F5E"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorSaved)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartTile>

        {/* Pro Features: Category Breakdown Over Time & Top Categories Overview */}
        <ChartTile
          title="Spending by Category"
          value={topCategoryName}
          label={`Top Category (${spendingRange + 1}m)`}
          isPositive={false}
          range={spendingRange}
          setRange={setSpendingRange}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={spendingData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="monthStr"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
                dy={10}
              />
              <YAxis
                tickFormatter={(val) => `R${val / 1000}k`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#7A7263" }}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                wrapperStyle={{ zIndex: 100 }}
                formatter={(val: number, name: string) => [formatZAR(val), name]}
              />
              {categoryKeys.map((key) => (
                <Bar
                  key={key}
                  dataKey={`categories.${key}`}
                  name={key}
                  stackId="a"
                  fill={CATEGORY_COLORS[key] || "#16231C"}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartTile>

        <ChartTile
          title="Top Expenses"
          value={formatZAR(topCategoryAmount)}
          label={topCategoryName}
          isPositive={false}
          range={spendingRange}
          setRange={setSpendingRange}
        >
          {localCategoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={localCategoryData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#16231C" }}
                  width={90}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  formatter={(val: number) => formatZAR(val)}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  wrapperStyle={{ zIndex: 100 }}
                />
                <Bar
                  dataKey="value"
                  name="Total Spent"
                  fill="#D89A3D"
                  radius={[0, 4, 4, 0]}
                  barSize={24}
                >
                  {localCategoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || "#D89A3D"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Not enough data yet. Add some expenses to see your top categories!
            </div>
          )}
        </ChartTile>
      </div>
    </div>
  );
}
