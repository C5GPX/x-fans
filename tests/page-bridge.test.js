const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const bridgeSource = fs.readFileSync(require.resolve("../src/page-bridge.js"), "utf8");

test("page bridge forwards a follower metric from a loaded GraphQL response", async () => {
  const messages = [];
  const originalFetch = () => Promise.resolve({
    clone: () => ({
      text: () => Promise.resolve(JSON.stringify({
        data: {
          user: {
            rest_id: "1",
            legacy: {
              screen_name: "alice",
              followers_count: 1234
            }
          }
        }
      }))
    })
  });
  const window = {
    fetch: originalFetch,
    XMLHttpRequest: function XMLHttpRequest() {},
    location: { origin: "https://x.com" },
    postMessage: (message, origin) => messages.push({ message, origin })
  };
  window.XMLHttpRequest.prototype = { open() {}, send() {} };

  vm.runInNewContext(bridgeSource, {
    window,
    Map,
    WeakSet,
    Object,
    Array,
    JSON,
    Number,
    String,
    Promise,
    Math,
    console,
    setTimeout
  });

  await window.fetch("https://x.com/i/api/graphql/test");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.payload.id, "1");
  assert.equal(messages[0].message.payload.handle, "alice");
  assert.equal(messages[0].message.payload.followersCount, 1234);
});

test("page bridge accepts X's normal_followers_count field", async () => {
  const messages = [];
  const window = {
    fetch: () => Promise.resolve({
      clone: () => ({
        text: () => Promise.resolve(JSON.stringify({
          data: {
            user_results: {
              result: {
                rest_id: "42",
                legacy: {
                  screen_name: "example",
                  normal_followers_count: 1234
                }
              }
            }
          }
        }))
      })
    }),
    XMLHttpRequest: function XMLHttpRequest() {},
    location: { origin: "https://x.com" },
    postMessage: (message, origin) => messages.push({ message, origin })
  };
  window.XMLHttpRequest.prototype = { open() {}, send() {} };

  vm.runInNewContext(bridgeSource, {
    window,
    Map,
    WeakSet,
    Object,
    Array,
    JSON,
    Number,
    String,
    Promise,
    Math,
    console,
    setTimeout
  });

  await window.fetch("https://x.com/i/api/graphql/test");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.payload.id, "42");
  assert.equal(messages[0].message.payload.handle, "example");
  assert.equal(messages[0].message.payload.followersCount, 1234);
});

test("page bridge accepts X's relationship_counts.followers field", async () => {
  const messages = [];
  const window = {
    fetch: () => Promise.resolve({
      clone: () => ({
        text: () => Promise.resolve(JSON.stringify({
          data: {
            user_results: {
              result: {
                rest_id: "43",
                core: { screen_name: "newShape" },
                relationship_counts: { followers: 5678 }
              }
            }
          }
        }))
      })
    }),
    XMLHttpRequest: function XMLHttpRequest() {},
    location: { origin: "https://x.com" },
    postMessage: (message, origin) => messages.push({ message, origin })
  };
  window.XMLHttpRequest.prototype = { open() {}, send() {} };

  vm.runInNewContext(bridgeSource, {
    window,
    Map,
    WeakSet,
    Object,
    Array,
    JSON,
    Number,
    String,
    Promise,
    Math,
    console,
    setTimeout
  });

  await window.fetch("https://api.x.com/graphql/test");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.payload.id, "43");
  assert.equal(messages[0].message.payload.handle, "newShape");
  assert.equal(messages[0].message.payload.followersCount, 5678);
});

