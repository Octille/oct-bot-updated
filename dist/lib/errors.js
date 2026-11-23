"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EconomyError = exports.UserError = void 0;
/** An error whose message is safe to show the user (sent as an ephemeral reply). */
class UserError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UserError';
    }
}
exports.UserError = UserError;
class EconomyError extends UserError {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'EconomyError';
    }
}
exports.EconomyError = EconomyError;
//# sourceMappingURL=errors.js.map