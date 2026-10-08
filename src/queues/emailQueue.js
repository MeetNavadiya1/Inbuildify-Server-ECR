import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

const emailQueue = new Bull("emailQueue", bullQueueOptions({
  settings: {
    lockDuration: 300000,
    stalledInterval: 60000,
    maxStalledCount: 1,
  },
}));

export default emailQueue;
