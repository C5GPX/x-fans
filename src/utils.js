(function attachFollowerUtils(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.XFollowerUtils = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createFollowerUtils() {
  const compactFormatter = typeof Intl !== "undefined" && Intl.NumberFormat
    ? new Intl.NumberFormat("zh-CN", {
        notation: "compact",
        maximumFractionDigits: 1
      })
    : null;

  function normalizeFollowerCount(value) {
    if (typeof value === "string" && value.trim() !== "") {
      value = Number(value);
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    const count = Math.floor(value);
    return count >= 0 ? count : null;
  }

  function formatFollowers(value) {
    const count = normalizeFollowerCount(value);
    if (count === null) {
      return null;
    }

    if (compactFormatter) {
      return compactFormatter.format(count);
    }

    if (count >= 100000000) {
      return `${(count / 100000000).toFixed(1).replace(/\.0$/, "")}亿`;
    }
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1).replace(/\.0$/, "")}万`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}千`;
    }
    return String(count);
  }

  function firstValue(values) {
    return values.find((value) => value !== undefined && value !== null && value !== "");
  }

  function extractUserRecord(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const legacy = value.legacy && typeof value.legacy === "object" ? value.legacy : {};
    const metrics = value.public_metrics && typeof value.public_metrics === "object"
      ? value.public_metrics
      : {};
    const relationshipCounts = value.relationship_counts && typeof value.relationship_counts === "object"
      ? value.relationship_counts
      : {};
    const relationshipCountsCamel = value.relationshipCounts && typeof value.relationshipCounts === "object"
      ? value.relationshipCounts
      : {};

    const followersCount = normalizeFollowerCount(firstValue([
      legacy.followers_count,
      legacy.normal_followers_count,
      legacy.followersCount,
      metrics.followers_count,
      metrics.normal_followers_count,
      metrics.followersCount,
      relationshipCounts.followers,
      relationshipCounts.followers_count,
      relationshipCountsCamel.followers,
      value.followers_count,
      value.normal_followers_count,
      value.followersCount,
      value.follower_count
    ]));

    if (followersCount === null) {
      return null;
    }

    const core = value.core && typeof value.core === "object" ? value.core : {};
    const handle = firstValue([
      legacy.screen_name,
      value.screen_name,
      value.username,
      value.handle,
      value.screenName,
      value.userName,
      core.screen_name,
      core.username
    ]);
    const id = firstValue([
      value.rest_id,
      legacy.id_str,
      value.id_str,
      value.id
    ]);

    if (handle === undefined && id === undefined) {
      return null;
    }

    return {
      id: id === undefined ? null : String(id),
      handle: handle === undefined ? null : String(handle).replace(/^@/, ""),
      followersCount
    };
  }

  function handleFromProfileHref(href) {
    if (!href || typeof href !== "string") {
      return null;
    }

    let pathname = href;
    try {
      pathname = new URL(href, "https://x.com").pathname;
    } catch (_error) {
      pathname = href.split(/[?#]/, 1)[0];
    }

    const segments = pathname.split("/").filter(Boolean);
    if (segments.length !== 1) {
      return null;
    }

    const handle = decodeURIComponent(segments[0]).replace(/^@/, "");
    const reservedPaths = new Set([
      "home",
      "explore",
      "notifications",
      "messages",
      "settings",
      "compose",
      "search",
      "i"
    ]);

    return handle && !reservedPaths.has(handle.toLowerCase()) ? handle : null;
  }

  function isSupportedHomePath(locationLike) {
    if (!locationLike) {
      return false;
    }

    const hostname = String(locationLike.hostname || "").toLowerCase();
    const pathname = String(locationLike.pathname || "");
    return (hostname === "x.com" || hostname === "www.x.com" || hostname === "twitter.com" || hostname === "www.twitter.com")
      && /^\/(?:home\/?)?$/.test(pathname);
  }

  return {
    extractUserRecord,
    formatFollowers,
    handleFromProfileHref,
    isSupportedHomePath,
    normalizeFollowerCount
  };
});

