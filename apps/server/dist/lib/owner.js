"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOwnerId = getOwnerId;
function getOwnerId(req) {
    const raw = req.header("x-owner-id")?.trim();
    if (!raw)
        return "default";
    return raw.slice(0, 64);
}
//# sourceMappingURL=owner.js.map