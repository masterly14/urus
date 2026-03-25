"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  flattenContractPayloadForDisplay,
  type PayloadFlatRow,
} from "@/lib/legal/smart-closing/flatten-payload-for-display";
import { isEditablePayloadPath } from "@/lib/legal/smart-closing/payload-path-edit";
import { cn } from "@/lib/utils";

function groupRows(rows: PayloadFlatRow[]): Map<string, PayloadFlatRow[]> {
  const map = new Map<string, PayloadFlatRow[]>();
  for (const row of rows) {
    const g = row.group || "—";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(row);
  }
  return map;
}

function EditablePayloadValue({
  path,
  displayValue,
  payloadRoot,
  disabled,
  onCommit,
}: {
  path: string;
  displayValue: string;
  payloadRoot: unknown;
  disabled: boolean;
  onCommit: (path: string, raw: string) => Promise<boolean>;
}) {
  const editable = isEditablePayloadPath(payloadRoot, path);
  const [local, setLocal] = useState(displayValue);

  useEffect(() => {
    setLocal(displayValue);
  }, [displayValue]);

  if (!editable) {
    return (
      <Input
        readOnly
        value={displayValue}
        title={displayValue}
        aria-label={`Valor de ${path}`}
        className="h-auto min-h-8 cursor-default bg-muted/20 py-1.5 font-mono text-[11px] leading-snug text-muted-foreground break-all"
      />
    );
  }

  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        void (async () => {
          if (disabled) return;
          if (local === displayValue) return;
          const ok = await onCommit(path, local);
          if (!ok) setLocal(displayValue);
        })();
      }}
      disabled={disabled}
      title={local}
      aria-label={`Valor editable de ${path}. Se aplica al salir del campo.`}
      className="h-auto min-h-8 py-1.5 font-mono text-[11px] leading-snug text-foreground break-all"
    />
  );
}

export interface PayloadSummaryFieldsProps {
  payload: unknown;
  disabled?: boolean;
  onCommit: (path: string, raw: string) => Promise<boolean>;
  className?: string;
}

export function PayloadSummaryFields({
  payload,
  disabled = false,
  onCommit,
  className,
}: PayloadSummaryFieldsProps) {
  const rows = useMemo(() => flattenContractPayloadForDisplay(payload), [payload]);
  const byGroup = useMemo(() => groupRows(rows), [rows]);

  if (rows.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Sin datos que mostrar.</p>;
  }

  return (
    <div className={cn("space-y-5 px-1", className)}>
      {Array.from(byGroup.entries()).map(([group, items]) => (
        <section key={group} className="space-y-2">
          <h3 className="border-b border-border/40 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group}
          </h3>
          <div className="space-y-2">
            {items.map((row) => (
              <div
                key={row.path}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,42%)_minmax(0,58%)] sm:items-start"
              >
                <Select value={row.path} disabled>
                  <SelectTrigger
                    size="sm"
                    className="h-auto min-h-8 w-full min-w-0 cursor-default py-1.5 font-mono text-[11px] leading-snug whitespace-normal text-left [&>svg]:shrink-0"
                    title={row.path}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={row.path}>{row.path}</SelectItem>
                  </SelectContent>
                </Select>
                <EditablePayloadValue
                  path={row.path}
                  displayValue={row.value}
                  payloadRoot={payload}
                  disabled={disabled}
                  onCommit={onCommit}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
