"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeThumbnail = makeThumbnail;
exports.autoCropWhiteMargins = autoCropWhiteMargins;
exports.detectMime = detectMime;
const sharp_1 = __importDefault(require("sharp"));
async function makeThumbnail(input, width) {
    return (0, sharp_1.default)(input)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
}
async function autoCropWhiteMargins(input) {
    return (0, sharp_1.default)(input).trim({ background: "white", threshold: 18 }).toBuffer();
}
function detectMime(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
        return "image/jpeg";
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
        return "image/png";
    if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
        return "image/webp";
    if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
        return "image/gif";
    return "application/octet-stream";
}
//# sourceMappingURL=image-utils.js.map