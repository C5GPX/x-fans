(function startFollowerContentScript() {
  "use strict";

  const utils = globalThis.XFollowerUtils;
  const MESSAGE_SOURCE = "x-follower-count-extension";
  const STORAGE_KEY = "enabled";
  const RETRY_DELAYS = [1000, 3000, 10000];
  const state = {
    enabled: true,
    observer: null,
    processTimer: null,
    retryTimers: new Map(),
    retryAttempts: new Map(),
    recordsById: new Map(),
    recordsByHandle: new Map(),
    lastPageScope: null
  };

  function isSupportedPage() {
    return utils.isSupportedHomePath(window.location);
  }

  function injectPageBridge() {
    if (document.documentElement && document.documentElement.dataset.xFollowerBridgeInjected === "true") {
      return;
    }

    const inject = () => {
      if (!document.documentElement || document.documentElement.dataset.xFollowerBridgeInjected === "true") {
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("src/page-bridge.js");
      script.dataset.xFollowerBridge = "true";
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
      document.documentElement.dataset.xFollowerBridgeInjected = "true";
    };

    if (document.documentElement) {
      inject();
    } else {
      const waitForDocumentElement = () => {
        if (document.documentElement) {
          inject();
        } else {
          setTimeout(waitForDocumentElement, 0);
        }
      };
      waitForDocumentElement();
    }
  }

  function clearRetry(handle) {
    const timer = state.retryTimers.get(handle);
    if (timer) {
      clearTimeout(timer);
      state.retryTimers.delete(handle);
    }
    state.retryAttempts.delete(handle);
  }

  function scheduleRetry(handle) {
    if (!handle || state.retryTimers.has(handle) || !state.enabled || !isSupportedPage()) {
      return;
    }

    const attempt = state.retryAttempts.get(handle) || 0;
    if (attempt >= RETRY_DELAYS.length) {
      return;
    }

    const timer = setTimeout(() => {
      state.retryTimers.delete(handle);
      state.retryAttempts.set(handle, attempt + 1);
      processTweets();
    }, RETRY_DELAYS[attempt]);

    state.retryTimers.set(handle, timer);
  }

  function recordForHandle(handle) {
    if (!handle) {
      return null;
    }
    return state.recordsByHandle.get(handle.toLowerCase()) || null;
  }

  function getAuthorBlock(tweet) {
    return tweet.querySelector('[data-testid="User-Name"]')
      || Array.from(tweet.querySelectorAll("a[href]"))
        .find((link) => utils.handleFromProfileHref(link.getAttribute("href")))
        ?.closest("div[dir=\"ltr\"]")
      || null;
  }

  function getProfileLink(authorBlock) {
    const links = Array.from(authorBlock.querySelectorAll("a[href]"));
    return links.find((link) => utils.handleFromProfileHref(link.getAttribute("href"))) || null;
  }

  function getInsertTarget(authorBlock) {
    const links = Array.from(authorBlock.querySelectorAll("a[href]"));
    const displayNameLink = links.find((link) => link.getAttribute("tabindex") !== "-1") || links[0];
    return displayNameLink?.parentElement || authorBlock;
  }

  function createChip(handle) {
    const chip = document.createElement("span");
    chip.className = "x-follower-chip";
    chip.dataset.xFollowerChip = "true";
    chip.dataset.handle = handle || "";
    chip.dataset.hasValue = "false";
    chip.setAttribute("aria-label", "发帖人粉丝数暂未加载");
    chip.textContent = "—";
    return chip;
  }

  function updateChip(chip, record) {
    if (!chip) {
      return;
    }

    if (!record) {
      chip.textContent = "—";
      chip.dataset.hasValue = "false";
      chip.title = "发帖人粉丝数暂未加载";
      chip.setAttribute("aria-label", "发帖人粉丝数暂未加载");
      return;
    }

    const formatted = utils.formatFollowers(record.followersCount);
    if (formatted === null) {
      chip.textContent = "—";
      chip.dataset.hasValue = "false";
      chip.title = "发帖人粉丝数暂未加载";
      chip.setAttribute("aria-label", "发帖人粉丝数暂未加载");
      return;
    }

    chip.textContent = `${formatted}粉`;
    chip.dataset.hasValue = "true";
    chip.title = `发帖人粉丝数：${formatted}`;
    chip.setAttribute("aria-label", `发帖人粉丝数 ${formatted}`);
  }

  function processTweet(tweet) {
    const authorBlock = getAuthorBlock(tweet);
    if (!authorBlock) {
      return;
    }

    const profileLink = getProfileLink(authorBlock);
    const handle = profileLink ? utils.handleFromProfileHref(profileLink.getAttribute("href")) : null;
    if (!handle) {
      return;
    }

    let chip = authorBlock.querySelector('[data-x-follower-chip="true"]');
    if (!chip) {
      chip = createChip(handle);
      getInsertTarget(authorBlock).after(chip);
    }
    chip.dataset.handle = handle;

    const record = recordForHandle(handle);
    updateChip(chip, record);
    if (record) {
      clearRetry(handle.toLowerCase());
    } else {
      scheduleRetry(handle.toLowerCase());
    }
  }

  function processTweets() {
    if (!state.enabled || !isSupportedPage()) {
      return;
    }

    document.querySelectorAll('[data-testid="tweet"], article[role="article"]').forEach(processTweet);
  }

  function queueProcess() {
    if (state.processTimer || !state.enabled || !isSupportedPage()) {
      return;
    }

    state.processTimer = setTimeout(() => {
      state.processTimer = null;
      processTweets();
    }, 80);
  }

  function removeAllChips() {
    document.querySelectorAll('[data-x-follower-chip="true"]').forEach((chip) => chip.remove());
    for (const timer of state.retryTimers.values()) {
      clearTimeout(timer);
    }
    state.retryTimers.clear();
    state.retryAttempts.clear();
  }

  function updatePageScope() {
    const supported = isSupportedPage();
    const scope = `${window.location.hostname}${window.location.pathname}`;
    if (scope !== state.lastPageScope) {
      state.lastPageScope = scope;
      if (!supported) {
        removeAllChips();
      } else if (state.enabled) {
        queueProcess();
      }
    }
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    if (state.enabled) {
      queueProcess();
    } else {
      removeAllChips();
    }
  }

  function handleMetricMessage(event) {
    if (event.source !== window || !event.data || event.data.source !== MESSAGE_SOURCE || event.data.type !== "USER_METRICS") {
      return;
    }

    const record = event.data.payload;
    if (!record || typeof record !== "object") {
      return;
    }

    const normalizedCount = utils.normalizeFollowerCount(record.followersCount);
    if (normalizedCount === null) {
      return;
    }

    const normalized = {
      id: record.id ? String(record.id) : null,
      handle: record.handle ? String(record.handle).replace(/^@/, "") : null,
      followersCount: normalizedCount
    };

    if (normalized.id) {
      state.recordsById.set(normalized.id, normalized);
    }
    if (normalized.handle) {
      const key = normalized.handle.toLowerCase();
      state.recordsByHandle.set(key, normalized);
      clearRetry(key);
    }

    queueProcess();
  }

  function setupObserver() {
    const root = document.body || document.documentElement;
    if (!root) {
      document.addEventListener("DOMContentLoaded", setupObserver, { once: true });
      return;
    }

    state.observer = new MutationObserver(queueProcess);
    state.observer.observe(root, { childList: true, subtree: true });
    queueProcess();
  }

  function setupRuntimeMessage() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message) {
        return;
      }

      if (message.type === "SET_ENABLED") {
        setEnabled(message.enabled);
        sendResponse({ enabled: state.enabled, supported: isSupportedPage() });
        return;
      }

      if (message.type !== "GET_STATUS") {
        return;
      }

      sendResponse({
        enabled: state.enabled,
        supported: isSupportedPage()
      });
    });
  }

  function initialize() {
    // Edge 某些版本对 MAIN world 内容脚本支持不完整，保留页面脚本注入作为备用。
    // 两种方式同时存在时，page-bridge.js 内部的全局标记会自动去重。
    injectPageBridge();
    window.addEventListener("message", handleMetricMessage);
    window.addEventListener("popstate", updatePageScope);
    window.addEventListener("hashchange", updatePageScope);
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[STORAGE_KEY]) {
        setEnabled(changes[STORAGE_KEY].newValue !== false);
      }
    });
    setupRuntimeMessage();
    setupObserver();

    chrome.storage.local.get({ [STORAGE_KEY]: true }).then((settings) => {
      setEnabled(settings[STORAGE_KEY] !== false);
      updatePageScope();
    }).catch(() => {
      setEnabled(true);
      updatePageScope();
    });

    setInterval(updatePageScope, 1000);
  }

  initialize();
})();

