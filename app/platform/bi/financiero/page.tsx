"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  CreditCard,
  Landmark,
  LineChart,
  Loader2,
  PiggyBank,
  RefreshCcw,
  Repeat,
  Settings2,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatEur } from "@/lib/utils/format";
import { useSession } from "@/lib/hooks/use-session";

type FinanceOverviewResponse = {
  ok: boolean;
  period: string;
  income: { derived: number; manual: number; total: number };
  expenses: { total: number; fixed: number; variable: number };
  ebitda: number;
  cash: number;
  openingBalanceDeclared: boolean;
  openingBalanceEur: number;
  treasuryNotes: string | null;
  reinvestmentCapacity: number;
  budgetRows: {
    bucket: "INGRESOS" | "FACTURA" | "SUSCRIPCION" | "GASTO_VARIABLE" | "AHORRO" | "DEUDA";
    budgetEur: number;
    realEur: number;
    deltaEur: number;
  }[];
  remaining: number;
  remainingBudget: number;
};

type ExpenseRow = {
  id: string;
  expenseDate: string;
  amount: number;
  category: string;
  bucket: "FACTURA" | "SUSCRIPCION" | "GASTO_VARIABLE" | "AHORRO" | "DEUDA";
  costType: "FIJO" | "VARIABLE";
  accountId?: string | null;
  account?: { id: string; name: string; bankName?: string | null } | null;
  status: string;
  description: string;
  vendor?: string | null;
  attachments: { id: string; filename?: string | null; cloudinaryUrl?: string | null }[];
};

type IncomeEntry = {
  id: string;
  period: string;
  occurredAt: string;
  amount: number;
  currency: string;
  source: string;
  description: string;
  accountId?: string | null;
  account?: { id: string; name: string; bankName?: string | null } | null;
};

type BankAccountRow = {
  id: string;
  name: string;
  bankName?: string | null;
  ownerScope: string;
  accountType: string;
  isActive: boolean;
};

type RecurringExpenseRow = {
  id: string;
  name: string;
  vendor: string;
  amountEur: number;
  dayOfMonth: number;
  category: string;
  bucket: ExpenseRow["bucket"];
  accountId?: string | null;
  account?: { id: string; name: string; bankName?: string | null } | null;
  active: boolean;
  lastGeneratedPeriod?: string | null;
};

type BudgetRow = FinanceOverviewResponse["budgetRows"][number];
type MovementRow = {
  id: string;
  kind: "GASTO" | "INGRESO";
  date: string;
  amount: number;
  bucket: BudgetRow["bucket"];
  category: string;
  counterparty: string;
  description: string;
  accountId?: string | null;
  accountName?: string | null;
};

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString()) || 0;
  }
  return 0;
}

type KpiTone = "default" | "success" | "danger" | "warning";

function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: KpiTone;
  icon?: React.ReactNode;
}) {
  const toneClass: Record<KpiTone, string> = {
    default: "",
    success: "border-l-2 border-l-urus-success",
    danger: "border-l-2 border-l-urus-danger",
    warning: "border-l-2 border-l-urus-warning",
  };
  const valueClass: Record<KpiTone, string> = {
    default: "text-foreground",
    success: "text-urus-success",
    danger: "text-urus-danger",
    warning: "text-urus-warning",
  };
  return (
    <Card className={cn("transition-colors", toneClass[tone])}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <p className={cn("mt-3 text-3xl font-bold tabular-nums", valueClass[tone])}>
          {formatEur(value)}
        </p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const BUCKET_LABEL: Record<ExpenseRow["bucket"], string> = {
  FACTURA: "Factura",
  SUSCRIPCION: "Suscripción",
  GASTO_VARIABLE: "Gasto variable",
  AHORRO: "Ahorro",
  DEUDA: "Deuda",
};

const BUDGET_BUCKET_LABEL: Record<BudgetRow["bucket"], string> = {
  INGRESOS: "Ingresos",
  FACTURA: "Facturas",
  SUSCRIPCION: "Suscripciones",
  GASTO_VARIABLE: "Gastos variables",
  AHORRO: "Ahorros",
  DEUDA: "Deudas",
};

export default function FinancialDashboard() {
  const { sessionHeaders } = useSession();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceOverviewResponse | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpenseRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [treasuryHistory, setTreasuryHistory] = useState<
    { id: string; period: string; openingBalanceEur: number; notes: string | null }[]
  >([]);
  const [savingTreasury, setSavingTreasury] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [newIncome, setNewIncome] = useState({
    occurredAt: new Date().toISOString().slice(0, 10),
    amount: "",
    source: "",
    description: "",
    accountId: "__none__",
  });
  const [savingIncome, setSavingIncome] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "",
    bankName: "",
    ownerScope: "EMPRESA",
    accountType: "CORRIENTE",
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [newRecurring, setNewRecurring] = useState({
    name: "",
    vendor: "",
    amountEur: "",
    dayOfMonth: "5",
    category: "software",
    bucket: "SUSCRIPCION" as ExpenseRow["bucket"],
    accountId: "__none__",
  });
  const [savingRecurring, setSavingRecurring] = useState(false);
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [movementBucketFilter, setMovementBucketFilter] = useState<"ALL" | BudgetRow["bucket"]>("ALL");
  const [movementAccountFilter, setMovementAccountFilter] = useState<string>("ALL");
  const [movementCategoryFilter, setMovementCategoryFilter] = useState<string>("ALL");
  const [activeSection, setActiveSection] = useState<
    "resumen" | "movimientos" | "gastos" | "ingresos" | "tesoreria" | "configuracion"
  >("resumen");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        overviewRes,
        expensesRes,
        incomesRes,
        treasuryRes,
        accountsRes,
        recurringRes,
      ] = await Promise.all([
        fetch(`/api/finanzas/overview?period=${period}`, {
          headers: sessionHeaders as Record<string, string>,
        }),
        fetch(`/api/expenses?period=${period}&status=CONFIRMED`, {
          headers: sessionHeaders as Record<string, string>,
        }),
        fetch(`/api/finanzas/ingresos?period=${period}`, {
          headers: sessionHeaders as Record<string, string>,
        }),
        fetch("/api/finanzas/tesoreria", {
          headers: sessionHeaders as Record<string, string>,
        }),
        fetch("/api/finanzas/cuentas", {
          headers: sessionHeaders as Record<string, string>,
        }),
        fetch("/api/finanzas/recurrentes", {
          headers: sessionHeaders as Record<string, string>,
        }),
      ]);

      if (
        !overviewRes.ok ||
        !expensesRes.ok ||
        !incomesRes.ok ||
        !treasuryRes.ok ||
        !accountsRes.ok ||
        !recurringRes.ok
      ) {
        throw new Error("No se pudieron cargar todos los datos financieros");
      }

      const overviewJson = (await overviewRes.json()) as FinanceOverviewResponse;
      const expensesJson = (await expensesRes.json()) as { rows: ExpenseRow[] };
      const incomesJson = (await incomesRes.json()) as { rows: IncomeEntry[] };
      const treasuryJson = (await treasuryRes.json()) as {
        rows: { id: string; period: string; openingBalanceEur: unknown; notes: string | null }[];
      };
      const accountsJson = (await accountsRes.json()) as { rows: BankAccountRow[] };
      const recurringJson = (await recurringRes.json()) as { rows: RecurringExpenseRow[] };

      setOverview(overviewJson);
      setBudgetRows(overviewJson.budgetRows ?? []);
      setExpenses(expensesJson.rows ?? []);
      setIncomes(incomesJson.rows ?? []);
      setAccounts(accountsJson.rows ?? []);
      setRecurringExpenses(
        (recurringJson.rows ?? []).map((row) => ({
          ...row,
          amountEur: toNumber(row.amountEur),
        })),
      );
      setTreasuryHistory(
        (treasuryJson.rows ?? []).map((row) => ({
          ...row,
          openingBalanceEur: toNumber(row.openingBalanceEur),
        })),
      );
      setOpeningBalance(String(overviewJson.openingBalanceEur || ""));
      setOpeningNotes(overviewJson.treasuryNotes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el panel financiero");
    } finally {
      setLoading(false);
    }
  }, [period, sessionHeaders]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const periodLabel = useMemo(() => {
    const [year, month] = period.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }, [period]);

  const movementRows = useMemo<MovementRow[]>(() => {
    const expenseRows: MovementRow[] = expenses.map((expense) => ({
      id: expense.id,
      kind: "GASTO",
      date: expense.expenseDate,
      amount: expense.amount,
      bucket: expense.bucket,
      category: expense.category,
      counterparty: expense.vendor ?? "-",
      description: expense.description,
      accountId: expense.accountId,
      accountName: expense.account?.name ?? null,
    }));

    const incomeRows: MovementRow[] = incomes.map((income) => ({
      id: income.id,
      kind: "INGRESO",
      date: income.occurredAt,
      amount: toNumber(income.amount),
      bucket: "INGRESOS",
      category: income.source,
      counterparty: income.source,
      description: income.description,
      accountId: income.accountId,
      accountName: income.account?.name ?? null,
    }));

    return [...expenseRows, ...incomeRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, incomes]);

  const movementCategories = useMemo(
    () => Array.from(new Set(movementRows.map((row) => row.category))).sort((a, b) => a.localeCompare(b)),
    [movementRows],
  );

  const filteredMovementRows = useMemo(
    () =>
      movementRows.filter((row) => {
        if (movementBucketFilter !== "ALL" && row.bucket !== movementBucketFilter) return false;
        if (movementAccountFilter !== "ALL" && (row.accountId ?? "__none__") !== movementAccountFilter)
          return false;
        if (movementCategoryFilter !== "ALL" && row.category !== movementCategoryFilter) return false;
        return true;
      }),
    [movementAccountFilter, movementBucketFilter, movementCategoryFilter, movementRows],
  );

  async function updateExpense(
    expense: ExpenseRow,
    payload: Partial<Pick<ExpenseRow, "bucket" | "accountId">>,
  ) {
    const response = await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(sessionHeaders as Record<string, string>),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setError("No se pudo actualizar el gasto");
      return;
    }
    await loadAll();
  }

  async function submitTreasury() {
    setSavingTreasury(true);
    setError(null);
    try {
      const response = await fetch("/api/finanzas/tesoreria", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionHeaders as Record<string, string>),
        },
        body: JSON.stringify({
          period,
          openingBalanceEur: Number(openingBalance || "0"),
          notes: openingNotes || null,
        }),
      });
      if (!response.ok) throw new Error("No se pudo guardar tesorería");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar tesorería");
    } finally {
      setSavingTreasury(false);
    }
  }

  async function submitIncome() {
    setSavingIncome(true);
    setError(null);
    try {
      const response = await fetch("/api/finanzas/ingresos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionHeaders as Record<string, string>),
        },
        body: JSON.stringify({
          period,
          occurredAt: new Date(`${newIncome.occurredAt}T12:00:00.000Z`).toISOString(),
          amount: Number(newIncome.amount || "0"),
          source: newIncome.source,
          description: newIncome.description,
          accountId: newIncome.accountId === "__none__" ? null : newIncome.accountId,
          currency: "EUR",
        }),
      });
      if (!response.ok) throw new Error("No se pudo crear el ingreso");
      setNewIncome({
        occurredAt: new Date().toISOString().slice(0, 10),
        amount: "",
        source: "",
        description: "",
        accountId: "__none__",
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el ingreso");
    } finally {
      setSavingIncome(false);
    }
  }

  async function submitBankAccount() {
    setSavingAccount(true);
    setError(null);
    try {
      const response = await fetch("/api/finanzas/cuentas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionHeaders as Record<string, string>),
        },
        body: JSON.stringify(newAccount),
      });
      if (!response.ok) throw new Error("No se pudo crear la cuenta bancaria");
      setNewAccount({
        name: "",
        bankName: "",
        ownerScope: "EMPRESA",
        accountType: "CORRIENTE",
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta bancaria");
    } finally {
      setSavingAccount(false);
    }
  }

  async function toggleAccountActive(account: BankAccountRow) {
    const response = await fetch(`/api/finanzas/cuentas/${account.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(sessionHeaders as Record<string, string>),
      },
      body: JSON.stringify({ isActive: !account.isActive }),
    });
    if (!response.ok) {
      setError("No se pudo actualizar el estado de la cuenta");
      return;
    }
    await loadAll();
  }

  async function deleteAccount(account: BankAccountRow) {
    const confirmed = window.confirm(
      `Se eliminará la cuenta bancaria "${account.name}". Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/finanzas/cuentas/${account.id}`, {
      method: "DELETE",
      headers: sessionHeaders as Record<string, string>,
    });
    if (!response.ok) {
      setError("No se pudo eliminar la cuenta");
      return;
    }
    await loadAll();
  }

  async function submitRecurringExpense() {
    setSavingRecurring(true);
    setError(null);
    try {
      const response = await fetch("/api/finanzas/recurrentes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionHeaders as Record<string, string>),
        },
        body: JSON.stringify({
          name: newRecurring.name,
          vendor: newRecurring.vendor,
          amountEur: Number(newRecurring.amountEur || "0"),
          dayOfMonth: Number(newRecurring.dayOfMonth || "5"),
          category: newRecurring.category,
          bucket: newRecurring.bucket,
          accountId: newRecurring.accountId === "__none__" ? null : newRecurring.accountId,
        }),
      });
      if (!response.ok) throw new Error("No se pudo crear el gasto recurrente");
      setNewRecurring({
        name: "",
        vendor: "",
        amountEur: "",
        dayOfMonth: "5",
        category: "software",
        bucket: "SUSCRIPCION",
        accountId: "__none__",
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el gasto recurrente");
    } finally {
      setSavingRecurring(false);
    }
  }

  async function toggleRecurringActive(item: RecurringExpenseRow) {
    const response = await fetch(`/api/finanzas/recurrentes/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(sessionHeaders as Record<string, string>),
      },
      body: JSON.stringify({ active: !item.active }),
    });
    if (!response.ok) {
      setError("No se pudo actualizar el recurrente");
      return;
    }
    await loadAll();
  }

  async function deleteRecurring(item: RecurringExpenseRow) {
    const confirmed = window.confirm(
      `Se eliminará el gasto recurrente "${item.name}". Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/finanzas/recurrentes/${item.id}`, {
      method: "DELETE",
      headers: sessionHeaders as Record<string, string>,
    });
    if (!response.ok) {
      setError("No se pudo eliminar el recurrente");
      return;
    }
    await loadAll();
  }

  async function deleteIncome(entry: IncomeEntry) {
    const confirmed = window.confirm(
      `Se eliminará el ingreso "${entry.source}" por ${formatEur(toNumber(entry.amount))}. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/finanzas/ingresos/${entry.id}`, {
      method: "DELETE",
      headers: sessionHeaders as Record<string, string>,
    });
    if (!response.ok) {
      setError("No se pudo eliminar el ingreso");
      return;
    }
    await loadAll();
  }

  async function deleteExpense(expense: ExpenseRow) {
    const confirmed = window.confirm(
      `Se eliminará el gasto de ${formatEur(expense.amount)} (${expense.category}). Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/expenses/${expense.id}`, {
      method: "DELETE",
      headers: sessionHeaders as Record<string, string>,
    });
    if (!response.ok) {
      setError("No se pudo eliminar el gasto");
      return;
    }
    await loadAll();
  }

  async function deleteTreasuryRow(row: {
    id: string;
    period: string;
    openingBalanceEur: number;
  }) {
    const confirmed = window.confirm(
      `Se eliminará el registro de tesorería del periodo ${row.period}. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/finanzas/tesoreria/${row.id}`, {
      method: "DELETE",
      headers: sessionHeaders as Record<string, string>,
    });
    if (!response.ok) {
      setError("No se pudo eliminar el registro de tesorería");
      return;
    }
    await loadAll();
  }

  function updateBudgetRow(bucket: BudgetRow["bucket"], budgetEur: number) {
    setBudgetRows((prev) =>
      prev.map((row) => {
        if (row.bucket !== bucket) return row;
        return {
          ...row,
          budgetEur,
          deltaEur: row.realEur - budgetEur,
        };
      }),
    );
  }

  async function saveBudgets() {
    setSavingBudgets(true);
    setError(null);
    try {
      const response = await fetch("/api/finanzas/presupuestos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionHeaders as Record<string, string>),
        },
        body: JSON.stringify({
          period,
          rows: budgetRows.map((row) => ({
            bucket: row.bucket,
            budgetEur: Number(row.budgetEur || 0),
          })),
        }),
      });
      if (!response.ok) throw new Error("No se pudo guardar el presupuesto mensual");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el presupuesto mensual");
    } finally {
      setSavingBudgets(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!overview) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">No hay datos financieros disponibles.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financiero"
        description="Control mensual de gastos, ingresos y tesorería para CEO y Admin."
        breadcrumbs={[
          { label: "Inicio", href: "/platform" },
          { label: "BI", href: "/platform/bi" },
          { label: "Financiero" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-[180px]"
            />
            <Button variant="outline" onClick={() => void loadAll()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Recargar
            </Button>
          </div>
        }
      />

      {error ? (
        <Card className="border-urus-danger/30">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-urus-danger">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      {!overview.openingBalanceDeclared ? (
        <Card className="border-urus-warning/30">
          <CardContent className="py-3 text-sm text-foreground">
            Falta declarar el saldo inicial de tesorería para <strong>{periodLabel}</strong>. Hazlo en la pestaña Tesorería.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <FinanceSubnav active={activeSection} onChange={setActiveSection} />

        <div className="min-w-0 space-y-6">
        {activeSection === "resumen" ? (
          <ResumenSection overview={overview} budgetRows={budgetRows} onEditBudget={() => setActiveSection("configuracion")} />
        ) : null}

        {activeSection === "movimientos" ? (
          <Card>
            <CardHeader>
              <CardTitle>Movimientos unificados</CardTitle>
              <CardDescription>
                Vista combinada de gastos e ingresos con filtros por bucket, cuenta y categoría.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="movementBucket">Bucket</Label>
                  <Select
                    value={movementBucketFilter}
                    onValueChange={(value) =>
                      setMovementBucketFilter(value as "ALL" | BudgetRow["bucket"])
                    }
                  >
                    <SelectTrigger id="movementBucket">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      {Object.entries(BUDGET_BUCKET_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="movementAccount">Cuenta</Label>
                  <Select value={movementAccountFilter} onValueChange={setMovementAccountFilter}>
                    <SelectTrigger id="movementAccount">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      <SelectItem value="__none__">Sin cuenta</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="movementCategory">Categoría</Label>
                  <Select value={movementCategoryFilter} onValueChange={setMovementCategoryFilter}>
                    <SelectTrigger id="movementCategory">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      {movementCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Importe</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Contraparte</TableHead>
                    <TableHead>Descripción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovementRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        No hay movimientos para los filtros seleccionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMovementRows.map((row) => (
                      <TableRow key={`${row.kind}-${row.id}`}>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>
                          <Badge variant={row.kind === "INGRESO" ? "outline" : "secondary"}>
                            {row.kind}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatEur(row.amount)}</TableCell>
                        <TableCell>{BUDGET_BUCKET_LABEL[row.bucket]}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell>{row.accountName ?? "-"}</TableCell>
                        <TableCell>{row.counterparty}</TableCell>
                        <TableCell>{row.description}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "gastos" ? (
          <Card>
            <CardHeader>
              <CardTitle>Gastos confirmados</CardTitle>
              <CardDescription>
                Gestiona bucket, cuenta bancaria y adjuntos del periodo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <div className="rounded-md border border-border bg-muted/30 p-6 text-center">
                  <p className="text-sm font-medium">No hay gastos en este periodo.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Puedes enviarlos por WhatsApp en formato: importe | categoría | fecha | proveedor | descripción.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Importe</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Bucket</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Coste</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Adjuntos</TableHead>
                    <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{formatDate(expense.expenseDate)}</TableCell>
                        <TableCell>{formatEur(expense.amount)}</TableCell>
                        <TableCell>{expense.category}</TableCell>
                        <TableCell>
                          <Select
                            value={expense.bucket}
                            onValueChange={(value) =>
                              void updateExpense(expense, {
                                bucket: value as ExpenseRow["bucket"],
                              })
                            }
                          >
                            <SelectTrigger className="w-[170px]">
                              <SelectValue placeholder={BUCKET_LABEL[expense.bucket]} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FACTURA">Factura</SelectItem>
                              <SelectItem value="SUSCRIPCION">Suscripción</SelectItem>
                              <SelectItem value="GASTO_VARIABLE">Gasto variable</SelectItem>
                              <SelectItem value="AHORRO">Ahorro</SelectItem>
                              <SelectItem value="DEUDA">Deuda</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={expense.accountId ?? "__none__"}
                            onValueChange={(value) =>
                              void updateExpense(expense, {
                                accountId: value === "__none__" ? null : value,
                              })
                            }
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Sin cuenta" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sin cuenta</SelectItem>
                              {accounts
                                .filter((account) => account.isActive)
                                .map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {expense.costType === "FIJO" ? "Fijo" : "Variable"}
                          </Badge>
                        </TableCell>
                        <TableCell>{expense.description}</TableCell>
                        <TableCell>
                          {expense.attachments.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sin adjuntos</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {expense.attachments.map((attachment) => (
                                <Badge key={attachment.id} variant="outline">
                                  {attachment.filename || "adjunto"}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar gasto ${expense.category}`}
                            onClick={() => void deleteExpense(expense)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "ingresos" ? (
          <Card>
            <CardHeader>
              <CardTitle>Ingresos manuales del periodo</CardTitle>
              <CardDescription>
                Los ingresos derivados por operaciones cerradas se calculan automáticamente. Aquí registras extras.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="space-y-1.5">
                  <Label htmlFor="incomeDate">Fecha</Label>
                  <Input
                    id="incomeDate"
                    type="date"
                    value={newIncome.occurredAt}
                    onChange={(event) => setNewIncome((prev) => ({ ...prev, occurredAt: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="incomeAmount">Importe (€)</Label>
                  <Input
                    id="incomeAmount"
                    type="number"
                    value={newIncome.amount}
                    onChange={(event) => setNewIncome((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="incomeSource">Origen</Label>
                  <Input
                    id="incomeSource"
                    value={newIncome.source}
                    onChange={(event) => setNewIncome((prev) => ({ ...prev, source: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="incomeDesc">Descripción</Label>
                  <Input
                    id="incomeDesc"
                    value={newIncome.description}
                    onChange={(event) => setNewIncome((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="incomeAccount">Cuenta bancaria</Label>
                  <Select
                    value={newIncome.accountId}
                    onValueChange={(value) =>
                      setNewIncome((prev) => ({
                        ...prev,
                        accountId: value,
                      }))
                    }
                  >
                    <SelectTrigger id="incomeAccount">
                      <SelectValue placeholder="Sin cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin cuenta</SelectItem>
                      {accounts
                        .filter((account) => account.isActive)
                        .map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={() => void submitIncome()}
                disabled={savingIncome || !newIncome.amount || !newIncome.source || !newIncome.description}
              >
                {savingIncome ? "Guardando..." : "Añadir ingreso"}
              </Button>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Importe</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No hay ingresos manuales en este periodo.
                      </TableCell>
                    </TableRow>
                  ) : (
                    incomes.map((income) => (
                      <TableRow key={income.id}>
                        <TableCell>{formatDate(income.occurredAt)}</TableCell>
                        <TableCell>{formatEur(toNumber(income.amount))}</TableCell>
                        <TableCell>{income.source}</TableCell>
                        <TableCell>{income.description}</TableCell>
                        <TableCell>{income.account?.name ?? "-"}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar ingreso ${income.source}`}
                            onClick={() => void deleteIncome(income)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "tesoreria" ? (
          <Card>
            <CardHeader>
              <CardTitle>Saldo inicial de tesorería</CardTitle>
              <CardDescription>
                Este valor se usa para calcular cash mensual: saldo inicial + ingresos - gastos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="openingBalance">Saldo inicial (€)</Label>
                  <Input
                    id="openingBalance"
                    type="number"
                    value={openingBalance}
                    onChange={(event) => setOpeningBalance(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="openingNotes">Nota (opcional)</Label>
                  <Input
                    id="openingNotes"
                    value={openingNotes}
                    onChange={(event) => setOpeningNotes(event.target.value)}
                  />
                </div>
              </div>
              <Button onClick={() => void submitTreasury()} disabled={savingTreasury}>
                {savingTreasury ? "Guardando..." : "Guardar tesorería"}
              </Button>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Saldo inicial</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treasuryHistory.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.period}</TableCell>
                      <TableCell>{formatEur(row.openingBalanceEur)}</TableCell>
                      <TableCell>{row.notes || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar tesorería ${row.period}`}
                          onClick={() => void deleteTreasuryRow(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "configuracion" ? (
          <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cuentas bancarias</CardTitle>
              <CardDescription>
                Registra las cuentas operativas para asignar gastos e ingresos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="accountName">Nombre</Label>
                  <Input
                    id="accountName"
                    value={newAccount.name}
                    onChange={(event) =>
                      setNewAccount((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="BBVA empresa"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountBank">Banco</Label>
                  <Input
                    id="accountBank"
                    value={newAccount.bankName}
                    onChange={(event) =>
                      setNewAccount((prev) => ({ ...prev, bankName: event.target.value }))
                    }
                    placeholder="BBVA"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountScope">Ámbito</Label>
                  <Select
                    value={newAccount.ownerScope}
                    onValueChange={(value) =>
                      setNewAccount((prev) => ({ ...prev, ownerScope: value }))
                    }
                  >
                    <SelectTrigger id="accountScope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMPRESA">Empresa</SelectItem>
                      <SelectItem value="CEO">CEO</SelectItem>
                      <SelectItem value="PERSONAL">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountType">Tipo</Label>
                  <Select
                    value={newAccount.accountType}
                    onValueChange={(value) =>
                      setNewAccount((prev) => ({ ...prev, accountType: value }))
                    }
                  >
                    <SelectTrigger id="accountType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CORRIENTE">Corriente</SelectItem>
                      <SelectItem value="AHORRO">Ahorro</SelectItem>
                      <SelectItem value="TARJETA">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={() => void submitBankAccount()}
                disabled={savingAccount || !newAccount.name.trim()}
              >
                {savingAccount ? "Guardando..." : "Crear cuenta"}
              </Button>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Ámbito</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No hay cuentas bancarias registradas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>{account.name}</TableCell>
                        <TableCell>{account.bankName || "-"}</TableCell>
                        <TableCell>{account.ownerScope}</TableCell>
                        <TableCell>{account.accountType}</TableCell>
                        <TableCell>
                          <Badge variant={account.isActive ? "outline" : "secondary"}>
                            {account.isActive ? "Activa" : "Inactiva"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void toggleAccountActive(account)}
                            >
                              {account.isActive ? "Desactivar" : "Activar"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar cuenta ${account.name}`}
                              onClick={() => void deleteAccount(account)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gastos recurrentes</CardTitle>
              <CardDescription>
                Plantillas mensuales que se generan automáticamente en estado esperado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="recName">Nombre</Label>
                  <Input
                    id="recName"
                    value={newRecurring.name}
                    onChange={(event) =>
                      setNewRecurring((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="Idealista mensual"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recVendor">Proveedor</Label>
                  <Input
                    id="recVendor"
                    value={newRecurring.vendor}
                    onChange={(event) =>
                      setNewRecurring((prev) => ({ ...prev, vendor: event.target.value }))
                    }
                    placeholder="IDEALISTA"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recAmount">Importe (€)</Label>
                  <Input
                    id="recAmount"
                    type="number"
                    value={newRecurring.amountEur}
                    onChange={(event) =>
                      setNewRecurring((prev) => ({ ...prev, amountEur: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recDay">Día del mes</Label>
                  <Input
                    id="recDay"
                    type="number"
                    min={1}
                    max={28}
                    value={newRecurring.dayOfMonth}
                    onChange={(event) =>
                      setNewRecurring((prev) => ({ ...prev, dayOfMonth: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="recCategory">Categoría</Label>
                  <Input
                    id="recCategory"
                    value={newRecurring.category}
                    onChange={(event) =>
                      setNewRecurring((prev) => ({ ...prev, category: event.target.value }))
                    }
                    placeholder="software"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recBucket">Bucket</Label>
                  <Select
                    value={newRecurring.bucket}
                    onValueChange={(value) =>
                      setNewRecurring((prev) => ({
                        ...prev,
                        bucket: value as ExpenseRow["bucket"],
                      }))
                    }
                  >
                    <SelectTrigger id="recBucket">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FACTURA">Factura</SelectItem>
                      <SelectItem value="SUSCRIPCION">Suscripción</SelectItem>
                      <SelectItem value="GASTO_VARIABLE">Gasto variable</SelectItem>
                      <SelectItem value="AHORRO">Ahorro</SelectItem>
                      <SelectItem value="DEUDA">Deuda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recAccount">Cuenta</Label>
                  <Select
                    value={newRecurring.accountId}
                    onValueChange={(value) =>
                      setNewRecurring((prev) => ({ ...prev, accountId: value }))
                    }
                  >
                    <SelectTrigger id="recAccount">
                      <SelectValue placeholder="Sin cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin cuenta</SelectItem>
                      {accounts
                        .filter((account) => account.isActive)
                        .map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={() => void submitRecurringExpense()}
                disabled={
                  savingRecurring ||
                  !newRecurring.name.trim() ||
                  !newRecurring.vendor.trim() ||
                  !newRecurring.amountEur.trim()
                }
              >
                {savingRecurring ? "Guardando..." : "Crear recurrente"}
              </Button>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Importe</TableHead>
                    <TableHead>Día</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Último periodo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurringExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                        No hay gastos recurrentes configurados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recurringExpenses.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.vendor}</TableCell>
                        <TableCell>{formatEur(item.amountEur)}</TableCell>
                        <TableCell>{item.dayOfMonth}</TableCell>
                        <TableCell>{BUCKET_LABEL[item.bucket]}</TableCell>
                        <TableCell>{item.account?.name ?? "-"}</TableCell>
                        <TableCell>{item.lastGeneratedPeriod ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.active ? "outline" : "secondary"}>
                            {item.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void toggleRecurringActive(item)}
                            >
                              {item.active ? "Desactivar" : "Activar"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar recurrente ${item.name}`}
                              onClick={() => void deleteRecurring(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Presupuesto base</CardTitle>
              <CardDescription>
                Configura el presupuesto mensual por bucket para usarlo como referencia del resumen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Presupuesto (€)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetRows.map((row) => (
                    <TableRow key={`config-budget-${row.bucket}`}>
                      <TableCell>{BUDGET_BUCKET_LABEL[row.bucket]}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.budgetEur}
                          onChange={(event) =>
                            updateBudgetRow(row.bucket, Number(event.target.value || "0"))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button onClick={() => void saveBudgets()} disabled={savingBudgets}>
                {savingBudgets ? "Guardando..." : "Guardar presupuesto base"}
              </Button>
            </CardContent>
          </Card>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

type SectionKey = "resumen" | "movimientos" | "gastos" | "ingresos" | "tesoreria" | "configuracion";

const SECTIONS: {
  key: SectionKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "resumen", label: "Resumen", description: "KPIs y vista global", icon: LineChart },
  { key: "movimientos", label: "Movimientos", description: "Gastos + ingresos", icon: Repeat },
  { key: "gastos", label: "Gastos", description: "Confirmados del periodo", icon: CreditCard },
  { key: "ingresos", label: "Ingresos", description: "Manuales y derivados", icon: Coins },
  { key: "tesoreria", label: "Tesorería", description: "Saldo inicial mensual", icon: Wallet },
  { key: "configuracion", label: "Configuración", description: "Cuentas, recurrentes, presupuesto", icon: Settings2 },
];

function FinanceSubnav({
  active,
  onChange,
}: {
  active: SectionKey;
  onChange: (key: SectionKey) => void;
}) {
  return (
    <nav aria-label="Secciones financieras" className="lg:sticky lg:top-4 lg:h-fit">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = active === section.key;
          return (
            <li key={section.key} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onChange(section.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 hidden h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-primary lg:block"
                  />
                ) : null}
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className="flex flex-col">
                  <span className={cn("font-medium leading-tight", isActive && "text-foreground")}>
                    {section.label}
                  </span>
                  <span className="hidden text-xs text-muted-foreground lg:block">
                    {section.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ResumenSection({
  overview,
  budgetRows,
  onEditBudget,
}: {
  overview: FinanceOverviewResponse;
  budgetRows: BudgetRow[];
  onEditBudget: () => void;
}) {
  const ebitdaTone: KpiTone = overview.ebitda > 0 ? "success" : overview.ebitda < 0 ? "danger" : "default";
  const cashTone: KpiTone = overview.cash > 0 ? "success" : overview.cash < 0 ? "danger" : "default";
  const remainingTone: KpiTone = overview.remaining > 0 ? "success" : overview.remaining < 0 ? "danger" : "default";

  return (
    <div className="space-y-6">
      <section aria-label="Indicadores principales" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Resumen del mes</h2>
            <p className="text-sm text-muted-foreground">Vista global del estado financiero del periodo.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Ingresos totales"
            value={overview.income.total}
            tone="default"
            icon={<ArrowUpRight className="h-4 w-4 text-urus-success" />}
            hint={
              overview.income.derived || overview.income.manual
                ? `${formatEur(overview.income.derived)} derivados · ${formatEur(overview.income.manual)} manuales`
                : undefined
            }
          />
          <KpiCard
            label="Gastos totales"
            value={overview.expenses.total}
            tone="default"
            icon={<ArrowDownRight className="h-4 w-4 text-urus-danger" />}
            hint={`${formatEur(overview.expenses.fixed)} fijo · ${formatEur(overview.expenses.variable)} variable`}
          />
          <KpiCard
            label="EBITDA"
            value={overview.ebitda}
            tone={ebitdaTone}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Ingresos − Gastos"
          />
          <KpiCard
            label="Cash"
            value={overview.cash}
            tone={cashTone}
            icon={<PiggyBank className="h-4 w-4" />}
            hint={
              overview.openingBalanceDeclared
                ? `Saldo inicial: ${formatEur(overview.openingBalanceEur)}`
                : "Falta declarar saldo inicial"
            }
          />
          <KpiCard
            label="Restante real"
            value={overview.remaining}
            tone={remainingTone}
            icon={<Landmark className="h-4 w-4" />}
            hint="Ingresos reales − gastos reales"
          />
          <KpiCard
            label="Restante presupuesto"
            value={overview.remainingBudget}
            tone="default"
            icon={<Landmark className="h-4 w-4" />}
            hint="Ingresos previstos − gastos previstos"
          />
        </div>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>Presupuesto vs real por bucket</CardTitle>
            <CardDescription>
              Comparativa de desviación por categoría financiera del periodo.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onEditBudget}>
            <Settings2 className="mr-2 h-4 w-4" />
            Editar presupuesto
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
                <TableHead className="text-right">Real</TableHead>
                <TableHead className="text-right">Δ Desviación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgetRows.map((row) => {
                const isIncome = row.bucket === "INGRESOS";
                const isOver = row.deltaEur > 0;
                const isUnder = row.deltaEur < 0;
                let badgeVariant: "outline" | "success" | "destructive" = "outline";
                if (isIncome) {
                  if (isOver) badgeVariant = "success";
                  else if (isUnder) badgeVariant = "destructive";
                } else {
                  if (isOver) badgeVariant = "destructive";
                  else if (isUnder) badgeVariant = "success";
                }
                const sign = row.deltaEur > 0 ? "+" : "";
                return (
                  <TableRow key={row.bucket}>
                    <TableCell className="font-medium">{BUDGET_BUCKET_LABEL[row.bucket]}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur(row.budgetEur)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur(row.realEur)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={badgeVariant}>
                        {sign}
                        {formatEur(row.deltaEur)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
