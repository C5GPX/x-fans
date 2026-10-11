const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractUserRecord,
  formatFollowers,
  handleFromProfileHref,
  isSupportedHomePath,
  normalizeFollowerCount
} = require("../src/utils.js");

test("normalizes valid follower counts and rejects invalid values", () => {
  assert.equal(normalizeFollowerCount(1234.9), 1234);
  assert.equal(normalizeFollowerCount("5678"), 5678);
  assert.equal(normalizeFollowerCount(-1), null);
  assert.equal(normalizeFollowerCount(""), null);
  assert.equal(normalizeFollowerCount("not-a-number"), null);
});

test("formats follower counts using compact Chinese notation", () => {
  assert.equal(formatFollowers(0), "0");
  assert.equal(formatFollowers(999), "999");
  assert.equal(formatFollowers(1000), "1000");
  assert.equal(formatFollowers(12345), "1.2万");
  assert.equal(formatFollowers(1230000), "123万");
});

test("extracts legacy and public metrics user records", () => {
  assert.deepEqual(extractUserRecord({
    rest_id: "42",
    legacy: {
      screen_name: "example",
      followers_count: 12345
    }
  }), {
    id: "42",
    handle: "example",
    followersCount: 12345
  });

  assert.deepEqual(extractUserRecord({
    id_str: "43",
    username: "publicMetricsUser",
    public_metrics: { followers_count: 99 }
  }), {
    id: "43",
    handle: "publicMetricsUser",
    followersCount: 99
  });

  assert.equal(extractUserRecord({ rest_id: "44", legacy: { screen_name: "missing" } }), null);
});

test("recognizes profile links and supported home paths", () => {
  assert.equal(handleFromProfileHref("/OpenAI"), "OpenAI");
  assert.equal(handleFromProfileHref("https://x.com/OpenAI?src=home"), "OpenAI");
  assert.equal(handleFromProfileHref("/home"), null);
  assert.equal(handleFromProfileHref("/OpenAI/status/123"), null);

  assert.equal(isSupportedHomePath({ hostname: "x.com", pathname: "/home" }), true);
  assert.equal(isSupportedHomePath({ hostname: "twitter.com", pathname: "/home/" }), true);
  assert.equal(isSupportedHomePath({ hostname: "x.com", pathname: "/" }), true);
  assert.equal(isSupportedHomePath({ hostname: "x.com", pathname: "/explore" }), false);
});

