import { Router } from "express";
import { prisma } from "../db";
import { ACHIEVEMENTS, computeContext, evaluateAchievements } from "../services/achievements";
import { asyncHandler } from "../lib/async-handler";
import { getOwnerId } from "../lib/owner";

export const statsRouter = Router();

statsRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    const ctx = await computeContext(ownerId);
    const totalComics = await prisma.comic.count({ where: { ownerId } });
    const days = await prisma.readingDay.findMany({ where: { ownerId }, orderBy: { date: "asc" } });
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
  }),
);

statsRouter.get(
  "/achievements",
  asyncHandler(async (req, res) => {
    const ownerId = getOwnerId(req);
    await evaluateAchievements(ownerId);
    const unlockedRows = (await prisma.achievement.findMany({ where: { ownerId } })) as Array<{ id: string }>;
    const unlocked = new Set(unlockedRows.map((a: { id: string }) => a.id));
    res.json(
      ACHIEVEMENTS.map((a) => {
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
      }),
    );
  }),
);
