"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDateJstByOffset = getDateJstByOffset;
exports.fetchHelperSummaryByDate = fetchHelperSummaryByDate;
exports.createHelperSummaryHandler = createHelperSummaryHandler;
const supabase_1 = require("./lib/supabase");
function getJstDateParts(date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find(function (part) {
        return part.type === "year";
    })?.value);
    const month = Number(parts.find(function (part) {
        return part.type === "month";
    })?.value);
    const day = Number(parts.find(function (part) {
        return part.type === "day";
    })?.value);
    return { year, month, day };
}
function getDateJstByOffset(dayOffset) {
    const { year, month, day } = getJstDateParts(new Date());
    const targetDate = new Date(Date.UTC(year, month - 1, day + dayOffset));
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(targetDate);
}
function buildScheduleUrl(routePath, helperEmail) {
    const query = new URLSearchParams({
        helper_email: helperEmail,
    });
    return `/${routePath}/?${query.toString()}`;
}
function compareStartTime(a, b) {
    if (!a && !b) {
        return 0;
    }
    if (!a) {
        return 1;
    }
    if (!b) {
        return -1;
    }
    return a.localeCompare(b);
}
async function fetchHelperSummaryByDate(date, routePath) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("date, name, helper_email, start_time")
        .eq("date", date)
        .not("helper_email", "is", null)
        .neq("helper_email", "")
        .order("start_time", { ascending: true });
    if (error) {
        throw error;
    }
    const rows = (data ?? []);
    const helperMap = new Map();
    for (const row of rows) {
        const helperEmail = row.helper_email.trim();
        if (helperEmail === "") {
            continue;
        }
        const existing = helperMap.get(helperEmail);
        if (!existing) {
            helperMap.set(helperEmail, {
                helperName: row.name,
                helperEmail,
                scheduleCount: 1,
                firstStartTime: row.start_time,
            });
            continue;
        }
        existing.scheduleCount += 1;
        if (!existing.helperName && row.name) {
            existing.helperName = row.name;
        }
        if (compareStartTime(row.start_time, existing.firstStartTime) < 0) {
            existing.firstStartTime = row.start_time;
        }
    }
    return Array.from(helperMap.values())
        .sort(function (a, b) {
        const timeOrder = compareStartTime(a.firstStartTime, b.firstStartTime);
        if (timeOrder !== 0) {
            return timeOrder;
        }
        return a.helperEmail.localeCompare(b.helperEmail);
    })
        .map(function (helper) {
        return {
            helperName: helper.helperName,
            helperEmail: helper.helperEmail,
            scheduleCount: helper.scheduleCount,
            firstStartTime: helper.firstStartTime,
            scheduleUrl: buildScheduleUrl(routePath, helper.helperEmail),
        };
    });
}
function createHelperSummaryHandler(dayOffset, logLabel, routePath) {
    return async function handleHelperSummary(_req, res) {
        try {
            const targetDate = getDateJstByOffset(dayOffset);
            const helpers = await fetchHelperSummaryByDate(targetDate, routePath);
            res.status(200).json({
                ok: true,
                date: targetDate,
                count: helpers.length,
                helpers,
            });
        }
        catch (error) {
            console.error(`[${logLabel}] error:`, error);
            res.status(500).json({
                ok: false,
                message: "internal error",
            });
        }
    };
}
