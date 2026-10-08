"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import type { Manifest } from "material-icon-theme";
import materialManifest from "material-icon-theme/dist/material-icons.json";
import { version } from "material-icon-theme/package.json";
import { cn } from "cn";

type FileIconProps = { fileName: string; isDir?: boolean; className?: string };

const manifest: Manifest = materialManifest;

const association = (
  values: Record<string, string> | undefined,
  key: string,
) => (values && Object.hasOwn(values, key) ? values[key] : undefined);

const formatIconName = (fileName: string, isDir: boolean, light: boolean) => {
  const segments = fileName
    .replaceAll("\\", "/")
    .replace(/\/+$/, "")
    .toLowerCase()
    .split("/");
  const name = segments.at(-1) ?? "";
  const parent = segments.at(-2);
  const theme = light ? manifest.light : undefined;

  const match = (
    key: "fileNames" | "fileExtensions" | "folderNames",
    value: string,
  ) => association(theme?.[key], value) ?? association(manifest[key], value);

  const named = (key: "fileNames" | "folderNames") =>
    (parent ? match(key, `${parent}/${name}`) : undefined) ?? match(key, name);

  if (isDir) return named("folderNames") ?? theme?.folder ?? manifest.folder!;

  const namedFile = named("fileNames");
  if (namedFile) return namedFile;

  const extensions = name
    .split(".")
    .slice(1)
    .map((_part, index, parts) => parts.slice(index).join("."));
  // Parent-specific matches precede generic extensions; compound suffixes precede shorter ones.
  const extensionIcon =
    (parent
      ? extensions
          .map((extension) => match("fileExtensions", `${parent}/${extension}`))
          .find(Boolean)
      : undefined) ??
    extensions
      .map((extension) => match("fileExtensions", extension))
      .find(Boolean);
  return extensionIcon ?? theme?.file ?? manifest.file!;
};

export const FileIcon = ({
  fileName,
  isDir = false,
  className,
}: FileIconProps) => {
  const { resolvedTheme } = useTheme();
  const icon = formatIconName(fileName, isDir, resolvedTheme === "light");
  const asset = manifest.iconDefinitions?.[icon]?.iconPath?.split("/").at(-1);
  return (
    <Image
      src={`/file-icons/${version}/${asset}`}
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      unoptimized
      // Material's multicolor assets preserve their upstream identity.
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
};
