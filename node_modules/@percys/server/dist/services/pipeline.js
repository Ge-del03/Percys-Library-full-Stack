"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFormat = detectFormat;
exports.getExtractor = getExtractor;
const node_path_1 = __importDefault(require("node:path"));
const cbz_1 = require("./extractors/cbz");
const cbr_1 = require("./extractors/cbr");
const pdf_1 = require("./extractors/pdf");
const folder_1 = require("./extractors/folder");
function detectFormat(filePath, isDirectory) {
    if (isDirectory)
        return "folder";
    const ext = node_path_1.default.extname(filePath).toLowerCase();
    if (ext === ".cbz" || ext === ".zip")
        return "cbz";
    if (ext === ".cbr" || ext === ".rar")
        return "cbr";
    if (ext === ".pdf")
        return "pdf";
    return null;
}
function getExtractor(format) {
    switch (format) {
        case "cbz":
            return cbz_1.cbzExtractor;
        case "cbr":
            return cbr_1.cbrExtractor;
        case "pdf":
            return pdf_1.pdfExtractor;
        case "folder":
            return folder_1.folderExtractor;
    }
}
//# sourceMappingURL=pipeline.js.map