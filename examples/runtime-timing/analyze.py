#!/usr/bin/env python3
"""Validate one complete timing_lab CSV run and summarize correlated durations."""
import argparse
import csv
import json
import statistics
import sys
from collections import defaultdict

FIELDS = ['timestamp_ns', 'thread_cpu_ns', 'seq', 'tid', 'event']
EVENTS = ['CYCLE_ENTER', 'BEFORE_CALL', 'WORK_ENTER', 'WORK_EXIT', 'AFTER_CALL']


def analyze(path, expected_count=None):
    groups = defaultdict(list)
    previous = {}
    row_count = 0
    with open(path, newline='', encoding='utf-8') as stream:
        reader = csv.DictReader(stream, strict=True)
        if reader.fieldnames != FIELDS:
            raise ValueError('unexpected CSV header')
        for line, row in enumerate(reader, 2):
            if set(row) != set(FIELDS) or any(value is None for value in row.values()):
                raise ValueError(f'line {line}: wrong column count')
            for field in FIELDS[:-1]:
                value = row[field]
                if not value.isascii() or not value.isdecimal():
                    raise ValueError(f'line {line}: invalid {field}')
                row[field] = int(value)
            if row['seq'] < 1 or row['tid'] < 1:
                raise ValueError(f'line {line}: seq and tid must be positive')
            tid = row['tid']
            if tid in previous and any(row[key] < previous[tid][key] for key in FIELDS[:2]):
                raise ValueError(f'line {line}: decreasing per-TID clock')
            if tid not in previous:
                expected_seq, event_index = 1, 0
            else:
                prior = previous[tid]
                event_index = (EVENTS.index(prior['event']) + 1) % len(EVENTS)
                expected_seq = prior['seq'] + (event_index == 0)
            if row['seq'] != expected_seq or row['event'] != EVENTS[event_index]:
                raise ValueError(f'line {line}: missing or reordered per-TID event')
            previous[tid] = row
            groups[(tid, row['seq'])].append(row)
            row_count += 1
    if not groups:
        raise ValueError('empty trace')
    if expected_count is not None and len(groups) != expected_count:
        raise ValueError(f'expected {expected_count} invocations, got {len(groups)}')

    values = defaultdict(list)
    last_entry = {}
    last_seq = defaultdict(int)
    for (tid, seq), records in groups.items():
        if [row['event'] for row in records] != EVENTS:
            raise ValueError(f'incomplete or reordered event sequence for {tid}/{seq}')
        if seq != last_seq[tid] + 1:
            raise ValueError(f'missing or reordered invocation for TID {tid}: {seq}')
        last_seq[tid] = seq
        _, before, entry, exit_record, after = records
        values['work_elapsed_ms'].append((exit_record['timestamp_ns'] - entry['timestamp_ns']) / 1e6)
        values['work_cpu_ms'].append((exit_record['thread_cpu_ns'] - entry['thread_cpu_ns']) / 1e6)
        values['call_transition_ms'].append((entry['timestamp_ns'] - before['timestamp_ns']) / 1e6)
        values['caller_elapsed_ms'].append((after['timestamp_ns'] - before['timestamp_ns']) / 1e6)
        if tid in last_entry:
            values['entry_interval_ms'].append((entry['timestamp_ns'] - last_entry[tid]) / 1e6)
        last_entry[tid] = entry['timestamp_ns']
    metrics = {name: {'samples': len(samples), 'min': min(samples),
                      'median': statistics.median(samples), 'max': max(samples)}
               for name, samples in values.items()}
    return {'invocations': len(groups), 'records': row_count,
            'threads': len(previous), 'metrics': metrics}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv')
    parser.add_argument('--expected-count', type=int,
                        help='total invocation count for this complete run')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    if args.expected_count is not None and args.expected_count < 1:
        parser.error('--expected-count must be positive')
    try:
        summary = analyze(args.csv, args.expected_count)
    except (OSError, ValueError, csv.Error) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(f'PASS: {summary["invocations"]} complete invocations, '
              f'{summary["records"]} records, {summary["threads"]} TID(s)')
        for name, metric in summary['metrics'].items():
            print(f'{name}: min={metric["min"]:.3f} median={metric["median"]:.3f} '
                  f'max={metric["max"]:.3f} samples={metric["samples"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
