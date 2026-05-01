"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.naturalCompare = naturalCompare;
exports.isImageName = isImageName;
// Natural alphanumeric sort — "page2.jpg" before "page10.jpg".
function naturalCompare(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
function isImageName(name) {
    return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name);
}
//# sourceMappingURL=natural-sort.js.map