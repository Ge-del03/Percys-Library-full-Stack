"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.ensureSettings = ensureSettings;
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient();
async function ensureSettings(ownerId = "default") {
    const existing = await exports.prisma.settings.findUnique({ where: { ownerId } });
    if (!existing) {
        await exports.prisma.settings.create({ data: { ownerId } });
    }
}
//# sourceMappingURL=db.js.map