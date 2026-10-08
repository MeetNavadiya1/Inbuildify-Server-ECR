import Bull from "bull";
import { bullQueueOptions } from "../config/redisBull.config.js";

const pdfGenerationQueue = new Bull("pdfGenerationQueue", bullQueueOptions());

export default pdfGenerationQueue;
