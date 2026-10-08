import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

const engineerEmailQueue = new Bull("engineerEmailQueue", bullQueueOptions());

export default engineerEmailQueue;
