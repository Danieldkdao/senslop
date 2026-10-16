"use client";

import { useId, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "./ui/input-group";

type NumberInputProps = {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onValueChange: (value: number) => void;
};

export const NumberInput = ({
  id,
  label,
  value,
  min,
  max,
  unit,
  disabled,
  onValueChange,
}: NumberInputProps) => {
  const rangeId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const numericDraft =
    draft === null || draft.trim() === "" ? value : Number(draft);
  const boundedValue = Math.min(
    max,
    Math.max(
      min,
      Number.isFinite(numericDraft) ? Math.round(numericDraft) : value,
    ),
  );
  const invalid =
    draft !== null &&
    draft !== "" &&
    (!Number.isInteger(numericDraft) ||
      numericDraft < min ||
      numericDraft > max);
  const commit = (next: number) => {
    setDraft(null);
    onValueChange(next);
  };
  return (
    <InputGroup data-disabled={disabled} className="w-44">
      <InputGroupInput
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        aria-label={label}
        aria-describedby={rangeId}
        aria-invalid={invalid || undefined}
        value={draft ?? value}
        className="min-w-0 appearance-none text-center text-base md:text-base tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          const parsed = Number(next);
          if (
            next !== "" &&
            Number.isInteger(parsed) &&
            parsed >= min &&
            parsed <= max
          )
            onValueChange(parsed);
        }}
        onBlur={() => commit(boundedValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <InputGroupAddon align="inline-start">
        <InputGroupButton
          size="icon-sm"
          aria-label={`Decrease ${label}`}
          disabled={disabled || boundedValue <= min}
          onClick={() => commit(Math.max(min, boundedValue - 1))}
        >
          <MinusIcon />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupAddon align="inline-end" className="gap-1">
        {unit && <InputGroupText className="text-base">{unit}</InputGroupText>}
        <InputGroupButton
          size="icon-sm"
          aria-label={`Increase ${label}`}
          disabled={disabled || boundedValue >= max}
          onClick={() => commit(Math.min(max, boundedValue + 1))}
        >
          <PlusIcon />
        </InputGroupButton>
      </InputGroupAddon>
      <span id={rangeId} className="sr-only">
        {min} to {max}
        {unit ? ` ${unit}` : ""}
      </span>
    </InputGroup>
  );
};
