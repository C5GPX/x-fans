(function installXPageBridge() {
  "use strict";

  if (window.__xFollowerCountBridgeInstalled) {
    return;
  }
  window.__xFollowerCountBridgeInstalled = true;

  const MESSAGE_SOURCE = "x-follower-count-extension";
  const lastCounts = new Map();

  function postRecord(record) {
    if (!record || (!record.id && !record.handle)) {
      return;
    }

    const key = record.handle
      ? `handle:${String(record.handle).toLowerCase()}`
      : `id:${record.id || ""}`;
    if (lastCounts.get(key) === record.followersCount) {
      return;
    }
    lastCounts.set(key, record.followersCount);

    window.postMessage({
      source: MESSAGE_SOURCE,
      type: "USER_METRICS",
      payload: record
    }, window.location.origin);
  }

  function readRecord(value) {
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
    const core = value.core && typeof value.core === "object" ? value.core : {};
    // X has used both followers_count and normal_followers_count in user
    // objects. Keep all variants because the home timeline can mix them.
    const countValues = [
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
    ];
    const followersCount = countValues.find((candidate) => {
      const number = typeof candidate === "string" ? Number(candidate) : candidate;
      return typeof number === "number" && Number.isFinite(number) && number >= 0;
    });

    if (followersCount === undefined) {
      return null;
    }

    const handleValue = [
      legacy.screen_name,
      value.screen_name,
      value.username,
      value.handle,
      value.screenName,
      value.userName,
      core.screen_name,
      core.username
    ].find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
    const idValue = [value.rest_id, legacy.id_str, value.id_str, value.id]
      .find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");

    if (handleValue === undefined && idValue === undefined) {
      return null;
    }

    return {
      id: idValue === undefined ? null : String(idValue),
      handle: handleValue === undefined ? null : String(handleValue).replace(/^@/, ""),
      followersCount: Math.floor(Number(followersCount))
    };
  }

  function scanPayload(payload) {
    const visited = new WeakSet();
    const state = { nodes: 0 };

    function walk(value, depth) {
      if (!value || typeof value !== "object" || depth > 14 || state.nodes > 50000) {
        return;
      }

      if (visited.has(value)) {
        return;
      }
      visited.add(value);
      state.nodes += 1;

      const record = readRecord(value);
      if (record) {
        postRecord(record);
      }

      for (const child of Object.values(value)) {
        walk(child, depth + 1);
      }
    }

    walk(payload, 0);
  }

  function parseAndScan(value) {
    if (!value) {
      return;
    }

    if (typeof value === "object") {
      scanPayload(value);
      return;
    }

    if (typeof value === "string") {
      try {
        scanPayload(JSON.parse(value));
      } catch (_error) {
        // X also returns non-JSON responses for some requests. Ignore them.
      }
    }
  }

  function requestUrl(input) {
    try {
      return typeof input === "string" ? input : input && input.url ? input.url : "";
    } catch (_error) {
      return "";
    }
  }

  function shouldInspect(url) {
    if (typeof url !== "string") {
      return false;
    }

    const normalizedUrl = url.toLowerCase();
    return normalizedUrl.includes("/graphql/")
      || normalizedUrl.includes("/i/api/")
      || normalizedUrl.includes("api.x.com")
      || normalizedUrl.includes("api.twitter.com");
  }

  function inspectResponse(response) {
    if (!response) {
      return;
    }

    try {
      const clone = typeof response.clone === "function" ? response.clone() : response;
      if (clone && typeof clone.text === "function") {
        clone.text().then(parseAndScan).catch(() => {});
        return;
      }
      if (clone && typeof clone.json === "function") {
        clone.json().then(parseAndScan).catch(() => {});
      }
    } catch (_error) {
      // Some response types cannot be cloned or read by the page script.
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function bridgedFetch(...args) {
      const url = requestUrl(args[0]);
      const result = originalFetch.apply(this, args);

      if (shouldInspect(url) && result && typeof result.then === "function") {
        result.then(inspectResponse).catch(() => {});
      }

      return result;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR && OriginalXHR.prototype) {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function bridgedOpen(method, url, ...rest) {
      this.__xFollowerRequestUrl = requestUrl(url);
      return originalOpen.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function bridgedSend(...args) {
      if (shouldInspect(this.__xFollowerRequestUrl)) {
        this.addEventListener("load", () => {
          try {
            parseAndScan(this.responseType === "json" ? this.response : this.responseText);
          } catch (_error) {
            // Ignore responses that are unavailable to the page script.
          }
        });
      }
      return originalSend.apply(this, args);
    };
  }
})();

