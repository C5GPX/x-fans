(function setupPopup() {
  "use strict";

  const enabledInput = document.getElementById("enabled");
  const status = document.getElementById("status");

  function setStatus(text) {
    status.textContent = text;
  }

  function queryActiveTab() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0] || null);
  }

  function sendStatusRequest(tab) {
    if (!tab || !tab.id) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "GET_STATUS" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    });
  }

  function refreshStatus() {
    queryActiveTab().then(sendStatusRequest).then((response) => {
      if (!response) {
        setStatus("当前页面不是 X 首页，或页面还未加载完成");
        return;
      }
      setStatus(response.supported ? "当前页面已连接" : "当前页面不是 X 首页");
    }).catch(() => {
      setStatus("无法读取当前页面状态");
    });
  }

  chrome.storage.local.get({ enabled: true }).then((settings) => {
    enabledInput.checked = settings.enabled !== false;
    refreshStatus();
  }).catch(() => {
    enabledInput.checked = true;
    refreshStatus();
  });

  enabledInput.addEventListener("change", () => {
    const enabled = enabledInput.checked;
    chrome.storage.local.set({ enabled }).then(() => {
      queryActiveTab().then((tab) => {
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "SET_ENABLED", enabled }, () => {
            void chrome.runtime.lastError;
          });
        }
      });
      setStatus(enabled ? "已开启" : "已关闭");
    }).catch(() => {
      setStatus("保存设置失败");
    });
  });
})();

