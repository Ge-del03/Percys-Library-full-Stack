"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pdfExtractor = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const canvas_1 = require("@napi-rs/canvas");
const archive_cache_1 = require("../archive-cache");
// pdfjs-dist legacy build runs in plain Node.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
async function getPdfMetadata(filePath) {
    const cacheKey = `metadata:pdf:${filePath}`;
    const cached = archive_cache_1.archiveCache.get(cacheKey);
    if (cached)
        return cached;
    const data = await promises_1.default.readFile(filePath);
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(data),
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: false,
    });
    const doc = await loadingTask.promise;
    const numPages = doc.numPages;
    await doc.destroy(); // Free memory immediately after getting metadata
    archive_cache_1.archiveCache.set(cacheKey, numPages);
    return numPages;
}
async function getDocInstance(filePath) {
    // We don't cache the full document instance anymore because it holds onto
    // a large buffer. We load it on-demand for page rendering.
    const data = await promises_1.default.readFile(filePath);
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(data),
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: false,
    });
    return loadingTask.promise;
}
exports.pdfExtractor = {
    async count(filePath) {
        return getPdfMetadata(filePath);
    },
    async list(filePath) {
        const numPages = await getPdfMetadata(filePath);
        const refs = [];
        for (let i = 0; i < numPages; i++)
            refs.push({ index: i, name: `page-${i + 1}.png` });
        return refs;
    },
    async page(filePath, index) {
        const doc = await getDocInstance(filePath);
        try {
            const page = await doc.getPage(index + 1);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = (0, canvas_1.createCanvas)(Math.ceil(viewport.width), Math.ceil(viewport.height));
            const ctx = canvas.getContext("2d");
            await page.render({ canvasContext: ctx, viewport }).promise;
            return canvas.toBuffer("image/png");
        }
        finally {
            await doc.destroy();
        }
    },
};
//# sourceMappingURL=pdf.js.map