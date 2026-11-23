"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("./config/env");
const logger_1 = require("./lib/logger");
async function connectDatabase(uri = (0, env_1.resolveMongoUri)()) {
    mongoose_1.default.set('strictQuery', true);
    await mongoose_1.default.connect(uri, { serverSelectionTimeoutMS: 15_000 });
    const { host, name } = mongoose_1.default.connection;
    (0, logger_1.logInfo)('db', `Connected to MongoDB (${host}/${name})`);
}
//# sourceMappingURL=db.js.map