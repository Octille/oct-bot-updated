"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.componentRegistry = exports.commandRegistry = void 0;
const discord_js_1 = require("discord.js");
const commands_1 = require("../commands");
const components_1 = require("../components");
exports.commandRegistry = new discord_js_1.Collection();
exports.componentRegistry = new discord_js_1.Collection();
for (const command of commands_1.commands) {
    if (exports.commandRegistry.has(command.data.name))
        throw new Error(`Duplicate command /${command.data.name}`);
    exports.commandRegistry.set(command.data.name, command);
}
for (const handler of components_1.components) {
    if (exports.componentRegistry.has(handler.prefix))
        throw new Error(`Duplicate component prefix "${handler.prefix}"`);
    exports.componentRegistry.set(handler.prefix, handler);
}
//# sourceMappingURL=registry.js.map