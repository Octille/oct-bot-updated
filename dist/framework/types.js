"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineCommand = defineCommand;
exports.defineComponent = defineComponent;
function defineCommand(command) {
    return command;
}
function defineComponent(handler) {
    if (handler.prefix.startsWith('~'))
        throw new Error('`~` prefixes are reserved for collector-managed components');
    return handler;
}
//# sourceMappingURL=types.js.map