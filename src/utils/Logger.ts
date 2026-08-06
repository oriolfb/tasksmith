const PREFIX = "[TaskSmith]";

export const Logger = {
  // `debug` rather than `log`: a rebuild happens on every save, and Obsidian's guidelines ask
  // plugins not to fill the console with routine chatter. It is still there behind the filter.
  info: (msg: string, ...args: unknown[]) => console.debug(`${PREFIX} ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`${PREFIX} ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`${PREFIX} ${msg}`, ...args),
};
