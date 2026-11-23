"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../lib/logger");
const tasks = [];
/** Starts every job. A job never overlaps with itself; errors are logged, never thrown. */
function startScheduler(client, jobs) {
    for (const job of jobs) {
        let running = false;
        const task = node_cron_1.default.schedule(job.schedule, async () => {
            if (running)
                return;
            running = true;
            try {
                await job.run(client);
            }
            catch (err) {
                (0, logger_1.logError)(`job ${job.name}`, err);
            }
            finally {
                running = false;
            }
        }, { timezone: 'UTC', name: job.name });
        tasks.push(task);
    }
    (0, logger_1.logInfo)('scheduler', `${jobs.length} job(s) scheduled`);
}
function stopScheduler() {
    for (const task of tasks.splice(0))
        task.stop();
}
//# sourceMappingURL=index.js.map