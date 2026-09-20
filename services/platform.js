export const SUPPORTED_PLATFORMS = ["tiktok", "twitch", "kick"];

export function normalizePlatform(value, fallback = "tiktok") {
    const candidate = String(value ?? "").trim().toLowerCase();
    if (SUPPORTED_PLATFORMS.includes(candidate)) return candidate;
    if (candidate === "both") return "both";
    return SUPPORTED_PLATFORMS.includes(fallback) ? fallback : "tiktok";
}

export function platformLabel(value) {
    switch (normalizePlatform(value)) {
        case "twitch": return "Twitch";
        case "kick": return "Kick";
        default: return "TikTok";
    }
}

export function platformShortLabel(value) {
    switch (normalizePlatform(value)) {
        case "twitch": return "TW";
        case "kick": return "K";
        default: return "TT";
    }
}
