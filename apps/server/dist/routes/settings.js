"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../db");
const async_handler_1 = require("../lib/async-handler");
const owner_1 = require("../lib/owner");
exports.settingsRouter = (0, express_1.Router)();
exports.settingsRouter.get("/", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    await (0, db_1.ensureSettings)(ownerId);
    const settings = await db_1.prisma.settings.findUnique({ where: { ownerId } });
    res.json(settings);
}));
// Avatars are either a built-in preset reference or a small data URL.
// Cap the data URL at ~256KB encoded to keep a single Settings row sane.
const AVATAR_MAX_LEN = 350_000;
const avatarSchema = zod_1.z
    .string()
    .max(AVATAR_MAX_LEN)
    .regex(/^(preset:[a-z0-9-]{1,32}|data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+)$/);
const settingsSchema = zod_1.z.object({
    userName: zod_1.z.string().min(1).max(40).optional(),
    userLastName: zod_1.z.string().max(40).optional(),
    // Theme id matches one of the presets in apps/web/src/lib/themes.ts. We
    // keep this open-ended (string) so the client can ship new themes
    // without a backend change. The shape is constrained to be safe.
    theme: zod_1.z.string().regex(/^[a-z0-9-]{1,32}$/).optional(),
    accentColor: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    avatar: avatarSchema.nullable().optional(),
    coverSize: zod_1.z.enum(["sm", "md", "lg"]).optional(),
    readingMode: zod_1.z.enum(["scroll-v", "paged-h", "paged-v", "webtoon", "paged-h-2"]).optional(),
    fitMode: zod_1.z.enum(["fit-width", "fit-height", "original"]).optional(),
    direction: zod_1.z.enum(["ltr", "rtl"]).optional(),
    showThumbStrip: zod_1.z.boolean().optional(),
    autoCropMargins: zod_1.z.boolean().optional(),
    uiHideDelayMs: zod_1.z.number().int().min(1000).max(60_000).optional(),
    autoAdvanceToNext: zod_1.z.boolean().optional(),
    autoScrollSpeed: zod_1.z.number().int().min(10).max(400).optional(),
    showTopProgress: zod_1.z.boolean().optional(),
    libraryView: zod_1.z.enum(["grid", "list"]).optional(),
    librarySort: zod_1.z.enum(["title", "lastReadAt", "progress", "addedAt"]).optional(),
    reduceMotion: zod_1.z.boolean().optional(),
    imageFilter: zod_1.z.enum(["none", "sepia", "night", "high-contrast"]).optional(),
    libraryPath: zod_1.z.string().optional(),
    dailyGoalPages: zod_1.z.number().int().min(0).max(2_000).optional(),
    customThemes: zod_1.z.string().optional(),
    keyboardShortcuts: zod_1.z.string().optional(),
    hasOnboarded: zod_1.z.boolean().optional(),
    autoApplySettings: zod_1.z.boolean().optional(),
    animationsEnabled: zod_1.z.boolean().optional(),
});
exports.settingsRouter.put("/", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    await (0, db_1.ensureSettings)(ownerId);
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const updated = await db_1.prisma.settings.update({ where: { ownerId }, data: parsed.data });
    res.json(updated);
}));
exports.settingsRouter.post("/reset-profile", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    await (0, db_1.ensureSettings)(ownerId);
    await db_1.prisma.$transaction([
        db_1.prisma.bookmark.deleteMany({ where: { ownerId } }),
        db_1.prisma.comic.deleteMany({ where: { ownerId } }),
        db_1.prisma.readingDay.deleteMany({ where: { ownerId } }),
        db_1.prisma.achievement.deleteMany({ where: { ownerId } }),
        db_1.prisma.settings.update({
            where: { ownerId },
            data: {
                userName: "Percy",
                userLastName: null,
                avatar: null,
                dailyGoalPages: 0,
                hasOnboarded: false,
                autoApplySettings: true,
                animationsEnabled: true,
                customThemes: "[]",
                keyboardShortcuts: "{}",
            },
        }),
    ]);
    res.json({ ok: true });
}));
exports.settingsRouter.post("/reset-defaults", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    await (0, db_1.ensureSettings)(ownerId);
    const updated = await db_1.prisma.settings.update({
        where: { ownerId },
        data: {
            theme: "dark",
            accentColor: "#7c5cff",
            coverSize: "md",
            readingMode: "paged-h",
            fitMode: "fit-width",
            direction: "ltr",
            showThumbStrip: true,
            autoCropMargins: false,
            uiHideDelayMs: 2500,
            autoAdvanceToNext: false,
            autoScrollSpeed: 80,
            showTopProgress: true,
            libraryView: "grid",
            librarySort: "lastReadAt",
            reduceMotion: false,
            imageFilter: "none",
            dailyGoalPages: 0,
            customThemes: "[]",
            keyboardShortcuts: "{}",
            autoApplySettings: true,
            animationsEnabled: true,
        },
    });
    res.json(updated);
}));
//# sourceMappingURL=settings.js.map