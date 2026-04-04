"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRUCTURED_OPTIONS = exports.SOURCE_TYPE_MOVE = void 0;
exports.isAllowedValue = isAllowedValue;
exports.areAllowedValues = areAllowedValues;
exports.getAllowedActionDetails = getAllowedActionDetails;
exports.SOURCE_TYPE_MOVE = "move";
exports.STRUCTURED_OPTIONS = {
    sourceTypes: [exports.SOURCE_TYPE_MOVE],
    physicalStates: ["良好", "不安定", "疲労", "その他"],
    mentalStates: ["落ち着き", "不穏", "拒否", "無反応"],
    riskFlags: [
        "転倒リスク",
        "ふらつき",
        "交通量多い",
        "段差注意",
        "混雑あり",
        "待機長い",
        "体調不安",
    ],
    actionTypes: [
        "移動",
        "乗車",
        "降車",
        "歩行見守り",
        "買い物同行",
        "声かけ",
        "安全確認",
    ],
    actionDetailsByType: {
        "移動": ["徒歩移動", "バス利用", "電車利用", "タクシー利用", "施設間移動"],
        "乗車": ["車両乗り込み支援", "シート着席支援", "手すり利用確認"],
        "降車": ["車両降り支援", "足元確認", "周囲安全確認"],
        "歩行見守り": ["屋外歩行見守り", "横断歩道見守り", "段差通過支援"],
        "買い物同行": ["店舗内同行", "商品確認支援", "会計同行"],
        "声かけ": ["移動促し", "不安軽減", "順番案内"],
        "安全確認": ["周囲確認", "体調確認", "持ち物確認"],
    },
    actors: ["helper", "user"],
    targets: ["利用者"],
    actionResults: ["成功", "失敗"],
    difficulties: ["楽", "普通", "大変"],
    assistLevels: ["全介助", "半介助", "見守り"],
    eventTypes: ["転倒未遂", "拒否", "体調変化", "遅延", "その他"],
    locations: ["indoor", "outdoor", "transit", "facility", "home"],
    timeOfDay: ["朝", "昼", "夕"],
};
function isAllowedValue(allowedValues, value) {
    return allowedValues.includes(value);
}
function areAllowedValues(allowedValues, values) {
    return values.every((value) => isAllowedValue(allowedValues, value));
}
function getAllowedActionDetails(actionType) {
    return exports.STRUCTURED_OPTIONS.actionDetailsByType[actionType] ?? [];
}
