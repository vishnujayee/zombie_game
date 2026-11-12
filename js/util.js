// W13.Util — seeded RNG and small math helpers.
window.W13 = window.W13 || {};
W13.Util = (function () {
  const TAU = Math.PI * 2;
  // mulberry32
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function normAngle(a) {
    a = a % TAU;
    if (a <= -Math.PI) a += TAU;
    else if (a > Math.PI) a -= TAU;
    return a;
  }
  const angleDiff = (a, b) => normAngle(b - a);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  // Pack RGBA into a little-endian Uint32 (ImageData layout).
  const rgba = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const deg = d => (d * Math.PI) / 180;
  return { TAU, rng, clamp, lerp, normAngle, angleDiff, dist, rgba, deg };
})();
