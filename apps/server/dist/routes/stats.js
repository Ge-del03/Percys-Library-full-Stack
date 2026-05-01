"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRouter = void 0;
const express_1 = require("express");
const db_1 = require("../db");
const achievements_1 = require("../services/achievements");
const async_handler_1 = require("../lib/async-handler");
const owner_1 = require("../lib/owner");
exports.statsRouter = (0, express_1.Router)();
exports.statsRouter.get("/stats", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    const ctx = await (0, achievements_1.computeContext)(ownerId);
    const totalComics = await db_1.prisma.comic.count({ where: { ownerId } });
    const days = await db_1.prisma.readingDay.findMany({ where: { ownerId }, orderBy: { date: "asc" } });
    res.json({
        totalComics,
        completedComics: ctx.totalRead,
        pagesRead: ctx.totalPages,
        favorites: ctx.favorites,
        currentStreak: ctx.currentStreak,
        longestStreak: ctx.longestStreak,
        todayPages: ctx.todayPages,
        bestDayPages: ctx.bestDayPages,
        days,
    });
}));
exports.statsRouter.get("/achievements", (0, async_handler_1.asyncHandler)(async (req, res) => {
    const ownerId = (0, owner_1.getOwnerId)(req);
    await (0, achievements_1.evaluateAchievements)(ownerId);
    const unlockedRows = (await db_1.prisma.achievement.findMany({ where: { ownerId } }));
    const unlocked = new Set(unlockedRows.map((a) => a.id));
    res.json(achievements_1.ACHIEVEMENTS.map((a) => {
        const isUnlocked = unlocked.has(a.id);
        return {
            id: a.id,
            // Hide secret achievements until unlocked: the UI shows a placeholder
            // so the user is encouraged to discover them.
            title: a.secret && !isUnlocked ? "???" : a.title,
            description: a.secret && !isUnlocked ? "Logro secreto" : a.description,
            group: a.group,
            tier: a.tier ?? 1,
            secret: !!a.secret,
            unlocked: isUnlocked,
        };
    }));
}));
//# sourceMappingURL=stats.js.map