import {
  Plus,
  Minus,
  Pencil,
  Braces,
  FileText,
  Network,
  Link,
  Unlink,
  Waypoints,
  TestTube,
  CornerDownRight,
  BookOpen,
  ShieldCheck,
  CircleHelp,
  CircleX,
  Code,
  Bug,
  LockKeyhole,
  Gauge,
  Accessibility,
  Plug,
  Database,
  Check,
  Circle,
  FileCode,
  FileImage,
  FileQuestion,
  MoveRight,
} from "lucide-react";
import type { StructuredChangeKind } from "./structured-diff";
import type {
  LanguageLevel,
  RelationshipKind,
  RelationshipProvenance,
} from "@senslop/contracts";
import type {
  ReviewUnitSchema,
  UnitKind,
  CriterionStatus,
  ReviewProfile,
} from "@senslop/contracts";

export const formatUnitKind = (kind: UnitKind) => {
  switch (kind) {
    case "text":
      return { label: "Changed source", Icon: FileCode };
    case "binary":
      return { label: "Binary change", Icon: FileImage };
    case "metadata":
      return { label: "File metadata", Icon: FileQuestion };
  }
};

export const formatUnitStatus = (unit: ReviewUnitSchema) => {
  if (unit.needsReview)
    return {
      label: "Needs review: ambiguous previous region",
      Icon: FileQuestion,
    };
  if (unit.reviewed)
    return {
      label: unit.moved ? "Reviewed; moved unchanged region" : "Reviewed",
      Icon: Check,
    };
  if (unit.moved) return { label: "Moved unchanged region", Icon: MoveRight };
  return { label: "Unreviewed", Icon: Circle };
};

export const formatCriterionStatus = (status: CriterionStatus) => {
  switch (status) {
    case "implemented":
      return { label: "Implemented", Icon: Code, className: "text-foreground" };
    case "verified":
      return {
        label: "Verified",
        Icon: ShieldCheck,
        className: "text-success",
      };
    case "missing":
      return { label: "Missing", Icon: CircleX, className: "text-destructive" };
    case "unclear":
      return {
        label: "Unclear",
        Icon: CircleHelp,
        className: "text-muted-foreground",
      };
  }
};

export const formatReviewProfile = (profile: ReviewProfile) => {
  switch (profile) {
    case "correctness":
      return { label: "Correctness", Icon: Bug };
    case "security":
      return { label: "Security", Icon: LockKeyhole };
    case "performance":
      return { label: "Performance", Icon: Gauge };
    case "accessibility":
      return { label: "Accessibility", Icon: Accessibility };
    case "api-compatibility":
      return { label: "API compatibility", Icon: Plug };
    case "migrations":
      return { label: "Migrations", Icon: Database };
  }
};

export const formatLanguageLevel = (level: LanguageLevel) => {
  switch (level) {
    case "semantic":
      return { label: "Semantic support", Icon: Network };
    case "parsing":
      return { label: "Parsing only", Icon: Braces };
    case "text":
      return { label: "Text only", Icon: FileText };
  }
};

export const formatRelationshipProvenance = (
  provenance: RelationshipProvenance,
) => {
  switch (provenance) {
    case "compiler-resolved":
      return { label: "Resolved", Icon: Link };
    case "syntactic":
      return { label: "Parsed", Icon: Braces };
    case "inferred":
      return { label: "Inferred", Icon: Waypoints };
    case "unresolved":
      return { label: "Unresolved", Icon: Unlink };
  }
};

export const formatRelationshipKind = (kind: RelationshipKind) => {
  switch (kind) {
    case "reference":
      return { label: "References", Icon: Link };
    case "caller":
      return { label: "Callers", Icon: CornerDownRight };
    case "dependency":
      return { label: "Dependencies", Icon: Network };
    case "dependent":
      return { label: "Dependents", Icon: Network };
    case "test":
      return { label: "Related tests", Icon: TestTube };
    case "definition":
      return { label: "Definition", Icon: BookOpen };
  }
};

export const formatStructuredChange = (kind: StructuredChangeKind) => {
  switch (kind) {
    case "added":
      return { label: "Added", Icon: Plus };
    case "removed":
      return { label: "Removed", Icon: Minus };
    case "changed":
      return { label: "Changed", Icon: Pencil };
  }
};
