import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

const quotationEmailQueue = new Bull("quotationEmailQueue", bullQueueOptions());

export default quotationEmailQueue;
