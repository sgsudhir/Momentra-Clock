'use strict';

const assert = require('node:assert/strict');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const rows = input.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 2);
  const [disconnected, connected] = rows;
  assert.deepEqual(Object.keys(disconnected).sort(), [
    'alarms', 'brightness', 'buzzer_configured', 'display_ready', 'font', 'chip_id',
    'format_12h', 'free_heap_bytes', 'hourly_enabled', 'hourly_pattern', 'feedback_enabled',
    'min_free_heap_bytes', 'ringing', 'ringing_mask', 'setup_ap',
    'stopwatch_state', 'stopwatch_ms', 'reminder_state', 'reminder_ms',
    'sync_age_seconds', 'time_valid', 'unix_time', 'unix_time_ms', 'uptime_seconds',
    'wifi_connected', 'wifi_rssi', 'wifi_mac', 'local_ip',
  ].sort());
  assert.equal(disconnected.wifi_rssi, null);
  assert.equal(disconnected.unix_time, null);
  assert.equal(disconnected.local_ip, null);
  assert.equal(disconnected.unix_time_ms, null);
  assert.equal(disconnected.sync_age_seconds, null);
  assert.equal(disconnected.alarms.length, 5);
  assert.equal(disconnected.feedback_enabled, 1);
  assert.equal(connected.wifi_rssi, -67);
  assert.equal(connected.local_ip, '192.168.1.23');
  assert.equal(connected.chip_id, '1200000000AB');
  assert.equal(connected.wifi_mac, '34:00:00:00:00:CD');
  assert.equal(connected.unix_time, 1700000000);
  assert.equal(connected.unix_time_ms, 1700000000123);
  assert.equal(connected.sync_age_seconds, 15);
  assert.equal(connected.ringing, true);
  assert.equal(connected.feedback_enabled, 0);
  assert.equal(connected.ringing_mask, 4);
  assert.equal(connected.stopwatch_state, 1);
  assert.equal(connected.stopwatch_ms, 1234);
  assert.equal(connected.reminder_state, 2);
  assert.equal(connected.reminder_ms, 5000);
  assert.deepEqual(connected.alarms[2], {
    enabled: 1, hour: 7, minute: 30, repeat: 1, duration_seconds: 180,
  });
  console.log('status JSON tests passed');
});
