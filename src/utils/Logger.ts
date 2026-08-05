const PREFIX = "[TaskConsole]";

export const Logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`${PREFIX} ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`${PREFIX} ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`${PREFIX} ${msg}`, ...args),
};
