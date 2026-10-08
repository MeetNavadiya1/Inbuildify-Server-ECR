import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

const pdfQueue = new Bull("pdfQueue", bullQueueOptions());

export default pdfQueue;
