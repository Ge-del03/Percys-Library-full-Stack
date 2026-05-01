"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = asyncHandler;
/**
 * Express 4 does not forward rejected promises from async handlers to the
 * error middleware automatically. This wrapper does that, so every route
 * fails cleanly with a 500 instead of becoming an unhandled promise rejection.
 */
function asyncHandler(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}
//# sourceMappingURL=async-handler.js.map