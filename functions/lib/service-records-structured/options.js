"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsStructuredOptions = handleServiceRecordsStructuredOptions;
const catalog_1 = require("./catalog");
function handleServiceRecordsStructuredOptions(_req, res) {
    res.status(200).json({
        ok: true,
        options: catalog_1.STRUCTURED_OPTIONS,
    });
}
