import { Logger } from "../utils/Logger";

export type StatusType = "TODO" | "DONE" | "IN_PROGRESS" | "CANCELLED" | "NON_TASK" | "EMPTY";

export interface StatusDefinition {
  symbol: string;
  name: string;
  nextStatusSymbol: string;
  type: StatusType;
}

/**
 * The subset of the Tasks plugin's own configuration we depend on. Read from its
 * `data.json` instead of duplicated in our settings, so the two can never disagree.
 */
export interface TasksInterop {
  statuses: Map<string, StatusDefinition>;
  useFilenameAsScheduledDate: boolean;
  filenameAsScheduledDateFormat: string;
  filenameAsDateFolders: string[];
  setDoneDate: boolean;
  setCancelledDate: boolean;
  setCreatedDate: boolean;
}

export const TASKS_PLUGIN_DATA = ".obsidian/plugins/obsidian-tasks-plugin/data.json";

const CORE_STATUSES: StatusDefinition[] = [
  { symbol: " ", name: "Todo", nextStatusSymbol: "x", type: "TODO" },
  { symbol: "x", name: "Done", nextStatusSymbol: " ", type: "DONE" },
  { symbol: "/", name: "In Progress", nextStatusSymbol: "x", type: "IN_PROGRESS" },
  { symbol: "-", name: "Cancelled", nextStatusSymbol: " ", type: "CANCELLED" },
];

export const DEFAULT_INTEROP: TasksInterop = {
  statuses: toMap(CORE_STATUSES),
  useFilenameAsScheduledDate: false,
  filenameAsScheduledDateFormat: "",
  filenameAsDateFolders: [],
  setDoneDate: true,
  setCancelledDate: true,
  setCreatedDate: false,
};

interface RawStatus {
  symbol?: unknown;
  name?: unknown;
  nextStatusSymbol?: unknown;
  type?: unknown;
}

interface RawTasksData {
  statusSettings?: { coreStatuses?: RawStatus[]; customStatuses?: RawStatus[] };
  useFilenameAsScheduledDate?: unknown;
  filenameAsScheduledDateFormat?: unknown;
  filenameAsDateFolders?: unknown;
  setDoneDate?: unknown;
  setCancelledDate?: unknown;
  setCreatedDate?: unknown;
}

/** Never throws: a missing or malformed file falls back to `DEFAULT_INTEROP`. */
export function parseTasksData(json: string): TasksInterop {
  let raw: RawTasksData;
  try {
    raw = JSON.parse(json) as RawTasksData;
  } catch (err) {
    Logger.warn("Tasks data.json is not valid JSON, using defaults", err);
    return DEFAULT_INTEROP;
  }

  const statuses = toMap(CORE_STATUSES);
  for (const group of [raw.statusSettings?.coreStatuses, raw.statusSettings?.customStatuses]) {
    for (const entry of group ?? []) {
      const symbol = typeof entry.symbol === "string" ? entry.symbol : null;
      if (!symbol) continue;
      statuses.set(symbol, {
        symbol,
        name: typeof entry.name === "string" ? entry.name : symbol,
        nextStatusSymbol: typeof entry.nextStatusSymbol === "string" ? entry.nextStatusSymbol : "x",
        type: isStatusType(entry.type) ? entry.type : "TODO",
      });
    }
  }

  return {
    statuses,
    useFilenameAsScheduledDate: raw.useFilenameAsScheduledDate === true,
    filenameAsScheduledDateFormat:
      typeof raw.filenameAsScheduledDateFormat === "string" ? raw.filenameAsScheduledDateFormat : "",
    filenameAsDateFolders: Array.isArray(raw.filenameAsDateFolders)
      ? raw.filenameAsDateFolders.filter((f): f is string => typeof f === "string")
      : [],
    setDoneDate: raw.setDoneDate !== false,
    setCancelledDate: raw.setCancelledDate !== false,
    setCreatedDate: raw.setCreatedDate === true,
  };
}

export function statusTypeOf(interop: TasksInterop, symbol: string): StatusType {
  return interop.statuses.get(symbol)?.type ?? "TODO";
}

export function isOpenStatus(interop: TasksInterop, symbol: string): boolean {
  const type = statusTypeOf(interop, symbol);
  return type === "TODO" || type === "IN_PROGRESS";
}

function toMap(list: StatusDefinition[]): Map<string, StatusDefinition> {
  return new Map(list.map((s) => [s.symbol, s]));
}

function isStatusType(value: unknown): value is StatusType {
  return (
    value === "TODO" ||
    value === "DONE" ||
    value === "IN_PROGRESS" ||
    value === "CANCELLED" ||
    value === "NON_TASK" ||
    value === "EMPTY"
  );
}
