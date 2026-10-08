import logger from "./logger.js";

const formatArgs = (args) => {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack;
      }
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
};

const handleLog = (level, args) => {
  if (
    args.length > 1 &&
    typeof args[args.length - 1] === "object" &&
    args[args.length - 1] !== null &&
    !Array.isArray(args[args.length - 1])
  ) {
    const meta = args.pop();
    logger.log(level, formatArgs(args), meta);
  } else if (
    args.length === 1 &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    !Array.isArray(args[0])
  ) {
    logger.log(level, "", args[0]);
  } else {
    logger.log(level, formatArgs(args));
  }
};

console.log = (...args) => {
  handleLog("info", args);
};

console.info = (...args) => {
  handleLog("info", args);
};

console.warn = (...args) => {
  handleLog("warn", args);
};

console.error = (...args) => {
  handleLog("error", args);
};
