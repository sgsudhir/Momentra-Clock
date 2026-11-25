#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

const source = '/usr/share/zoneinfo/tzdata.zi';
const lines = readFileSync(source, 'utf8').split('\n');
const version = /^# version (\S+)$/.exec(lines[0])?.[1];
if (!version) throw Error('Cannot determine timezone database version');
const names = lines.flatMap(line => {
  const fields = line.split(' ');
  return fields[0] === 'Z' ? [fields[1]] : fields[0] === 'L' ? [fields[2]] : [];
}).sort();
if (new Set(names).size !== names.length) throw Error('Duplicate timezone names');

function offset(value) {
  if (!/^[+-]\d{2}(\d{2})?(\d{2})?$/.test(value)) throw Error(`Invalid offset ${value}`);
  const digits = value.slice(1).padEnd(6, '0');
  const seconds = Number(digits.slice(0, 2)) * 3600 +
    Number(digits.slice(2, 4)) * 60 + Number(digits.slice(4, 6));
  return value[0] === '-' ? -seconds : seconds;
}

const sequences = new Map(), transitions = [], zones = [];
for (const name of names) {
  if (!/^[A-Za-z0-9_+./-]+$/.test(name) || name.length >= 40) throw Error(`Invalid name ${name}`);
  const result = execFileSync('zdump', ['-i', '-c', '1970,2101', name], {
    encoding: 'utf8', env: {...process.env, LC_ALL: 'C'}, maxBuffer: 1024 * 1024,
  });
  const rows = result.split('\n').filter(line => line && !line.startsWith('TZ='));
  const initial = rows.shift()?.split(/\s+/);
  if (!initial || initial[0] !== '-' || initial[1] !== '-') throw Error(`Missing initial offset for ${name}`);
  const base = offset(initial[2]);
  const series = [];
  for (const row of rows) {
    const [day, localTime, localOffset] = row.split(/\s+/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}(:\d{2}){0,2}$/.test(localTime)) {
      throw Error(`Invalid transition ${name}: ${row}`);
    }
    const parts = localTime.split(':').map(Number);
    const [year, month, date] = day.split('-').map(Number);
    const utc = Date.UTC(year, month - 1, date, parts[0], parts[1] || 0, parts[2] || 0) / 1000 - offset(localOffset);
    if (!Number.isInteger(utc) || utc < 0 || utc >= 4133980800 ||
        (series.length && utc <= series[series.length - 1][0])) throw Error(`Invalid transition timestamp ${name}: ${row}`);
    series.push([utc, offset(localOffset)]);
  }
  const key = JSON.stringify(series);
  let start = sequences.get(key);
  if (start === undefined) {
    start = transitions.length;
    transitions.push(...series);
    sequences.set(key, start);
  }
  zones.push({name, base, start, count: series.length});
}
const header = `/* Generated from IANA tzdb ${version}; run tools/generate-timezones.mjs. */\n`;
const declarations = zones.map(z => `    {"${z.name}", ${z.base}, ${z.start}, ${z.count}},`).join('\n');
const rules = transitions.map(([time, seconds]) => `    {${time}U, ${seconds}},`).join('\n');
writeFileSync('main/clock_timezone_data.inc', `${header}static const timezone_entry_t zones[] = {\n${declarations}\n};\nstatic const timezone_transition_t transitions[] = {\n${rules}\n};\n`);
console.log(`Generated ${zones.length} names and ${transitions.length} transitions from tzdb ${version}`);
