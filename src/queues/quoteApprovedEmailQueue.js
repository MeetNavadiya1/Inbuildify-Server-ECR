import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

const quoteApprovedEmailQueue = new Bull("quoteApprovedEmailQueue", bullQueueOptions());

export default quoteApprovedEmailQueue;
