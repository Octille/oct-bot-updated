"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collect = collect;
const discord_js_1 = require("discord.js");
const components_1 = require("./components");
const customId_1 = require("./customId");
/**
 * Collects button/select presses on a message from the component's owner only
 * (the router tells everyone else "this isn't yours"), and disables the components when it ends.
 * Use `~prefix` custom IDs for components handled this way.
 */
function collect(message, opts) {
    const collector = message.createMessageComponentCollector({
        time: opts.time,
        max: opts.max,
        idle: opts.idle,
        filter: (i) => {
            if (i.componentType !== discord_js_1.ComponentType.Button && i.componentType !== discord_js_1.ComponentType.StringSelect)
                return false;
            const { ownerId } = (0, customId_1.parseId)(i.customId);
            return ownerId === customId_1.ANYONE || ownerId === i.user.id;
        },
    });
    if (opts.disableOnEnd !== false) {
        collector.on('end', () => {
            (0, components_1.disableComponents)(message).catch(() => undefined);
        });
    }
    return collector;
}
//# sourceMappingURL=collect.js.map