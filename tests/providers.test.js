const test = require('node:test');
const assert = require('node:assert/strict');

test('open sky shape normalization mapping', () => {
  const s = ["abc123", "CALL", null, null, null, 10, 20, 1000, false, 200, 90];
  const mapped = {
    icao24: String(s[0]),
    callsign: String(s[1]).trim(),
    lon: Number(s[5]),
    lat: Number(s[6]),
    altitudeM: Number(s[7]),
    onGround: Boolean(s[8]),
    velocityMS: Number(s[9]),
    headingDeg: Number(s[10]),
  };
  assert.equal(mapped.lat, 20);
});
