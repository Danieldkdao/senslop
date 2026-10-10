"use client";

import * as icons from "@lobehub/icons/es/icons";
import { createElement, type ComponentProps, type ElementType } from "react";

type Registry = typeof icons;
export type ProviderIconName = keyof Registry;
type RegistryVariant<Name extends ProviderIconName> =
  | "Mono"
  | {
      [
        Variant in keyof Registry[Name]
      ]: Registry[Name][Variant] extends ElementType ? Variant : never;
    }[keyof Registry[Name]];
type RegistryComponent<
  Name extends ProviderIconName,
  Variant extends RegistryVariant<Name>,
> = Variant extends "Mono"
  ? Registry[Name]
  : Variant extends keyof Registry[Name]
    ? Extract<Registry[Name][Variant], ElementType>
    : never;
export type ProviderIconProps<
  Name extends ProviderIconName,
  Variant extends RegistryVariant<Name> = "Mono",
> = {
  name: Name;
  variant?: Variant;
} & Omit<ComponentProps<RegistryComponent<Name, Variant>>, "name">;

export const ProviderIcon = <
  Name extends ProviderIconName,
  Variant extends RegistryVariant<Name> = "Mono",
>({
  name,
  variant,
  ...props
}: ProviderIconProps<Name, Variant>) => {
  if (!Object.hasOwn(icons, name))
    throw new Error(`Unknown LobeHub icon registry name: ${name}`);
  const base = icons[name];
  const selected =
    !variant || variant === "Mono"
      ? base
      : Object.hasOwn(base, variant)
        ? base[variant as keyof typeof base]
        : null;
  if (!selected)
    throw new Error(`Icon ${name} does not have variant ${String(variant)}.`);
  // The registry is heterogeneous; the generic props contract validates this dynamic boundary.
  return createElement(selected as ElementType, { size: 24, ...props });
};
