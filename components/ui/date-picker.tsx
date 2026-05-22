"use client";

import * as React from "react";
import { format, parse, startOfDay } from "date-fns";
import { es as dateFnsEs } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { es as dayPickerEs } from "react-day-picker/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DatePickerProps = {
  /** Fecha en formato `yyyy-MM-dd` */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Si true, no permite elegir fechas anteriores a hoy */
  disablePast?: boolean;
};

function ymdToDate(ymd: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const parsed = parse(ymd, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function dateToYmd(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  placeholder = "Elegir fecha",
  disablePast = true,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = ymdToDate(value);
  const minDate = disablePast ? startOfDay(new Date()) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          data-empty={!selected}
          className={cn(
            "w-full justify-start gap-2 text-left font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0" />
          {selected ? (
            format(selected, "PPP", { locale: dateFnsEs })
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={dayPickerEs}
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(dateToYmd(date));
            setOpen(false);
          }}
          disabled={minDate ? { before: minDate } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
