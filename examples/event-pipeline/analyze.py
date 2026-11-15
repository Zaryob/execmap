#!/usr/bin/env python3
"""Validate one complete six-point trace, including cross-thread handoff."""
import argparse
import csv
import json
import re
import sys
from collections import defaultdict

FIELDS = ['run_id', 'timestamp_ns', 'seq', 'tid', 'event']
EVENTS = ['RECEIVED', 'DISPATCH_ENTER', 'BEFORE_CALL', 'WORK_ENTER', 'WORK_EXIT', 'AFTER_CALL']


def analyze(path, mode, expected_count):
    groups = defaultdict(list)
    run_ids = set()
    clocks = {}
    producer_tid = consumer_tid = None
    with open(path, newline='', encoding='utf-8') as stream:
        reader = csv.DictReader(stream, strict=True)
        if reader.fieldnames != FIELDS:
            raise ValueError('unexpected header')
        for line, row in enumerate(reader, 2):
            if set(row) != set(FIELDS) or any(value is None for value in row.values()):
                raise ValueError(f'line {line}: wrong column count')
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', row['run_id']):
                raise ValueError(f'line {line}: invalid run ID')
            run_ids.add(row['run_id'])
            if len(run_ids) > 1:
                raise ValueError('input mixes multiple runs')
            for key in ['timestamp_ns', 'seq', 'tid']:
                if not row[key].isascii() or not row[key].isdecimal():
                    raise ValueError(f'line {line}: invalid {key}')
                row[key] = int(row[key])
            if row['seq'] < 1 or row['tid'] < 1:
                raise ValueError('seq and tid must be positive')
            if row['timestamp_ns'] < clocks.get(row['tid'], 0):
                raise ValueError('decreasing per-TID clock')
            clocks[row['tid']] = row['timestamp_ns']
            groups[row['seq']].append(row)
    if not groups or sorted(groups) != list(range(1, expected_count + 1)):
        raise ValueError('missing, extra or non-contiguous invocations')
    output = []
    previous = None
    for seq in range(1, expected_count + 1):
        records = groups[seq]
        if [r['event'] for r in records] != EVENTS:
            raise ValueError(f'{seq}: incomplete, duplicate or reordered events')
        if any(b['timestamp_ns'] < a['timestamp_ns'] for a, b in zip(records, records[1:])):
            raise ValueError(f'{seq}: decreasing correlated clock')
        tids = [r['tid'] for r in records]
        if len(set(tids[1:])) != 1 or ((tids[0] == tids[1]) != (mode == 'direct')):
            raise ValueError(f'{seq}: thread relationship does not match mode')
        if producer_tid is None:
            producer_tid, consumer_tid = tids[:2]
        if tids[:2] != [producer_tid, consumer_tid]:
            raise ValueError('this single-producer/consumer lab requires stable TIDs')
        if previous and (records[0]['timestamp_ns'] < previous[0]['timestamp_ns'] or
                         records[1]['timestamp_ns'] < previous[-1]['timestamp_ns']):
            raise ValueError('source or synchronous consumer invocation order is invalid')
        times = [r['timestamp_ns'] for r in records]
        names = ['receive_to_dispatch_ms', 'dispatch_prepare_ms', 'call_transition_ms',
                 'work_elapsed_ms', 'return_transition_ms']
        metrics = {name: (times[i + 1] - times[i]) / 1e6 for i, name in enumerate(names)}
        metrics['caller_elapsed_ms'] = (times[5] - times[2]) / 1e6
        if previous:
            metrics['source_interval_ms'] = (times[0] - previous[0]['timestamp_ns']) / 1e6
            metrics['work_entry_interval_ms'] = (times[3] - previous[3]['timestamp_ns']) / 1e6
        output.append({'seq': seq, **metrics})
        previous = records
    return {'run_id': next(iter(run_ids)), 'mode': mode, 'count': len(groups),
            'producer_tid': producer_tid, 'consumer_tid': consumer_tid, 'invocations': output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv')
    parser.add_argument('--mode', choices=['direct', 'queued'], required=True)
    parser.add_argument('--expected-count', type=int, required=True)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.expected_count <= 1000:
        parser.error('--expected-count must be in 1..1000')
    try:
        result = analyze(args.csv, args.mode, args.expected_count)
    except (OSError, ValueError, csv.Error) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f'PASS: run={result["run_id"]} count={result["count"]} mode={result["mode"]}')
        for invocation in result['invocations']:
            print(' '.join(f'{key}={value:.3f}' if isinstance(value, float) else f'{key}={value}'
                           for key, value in invocation.items()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
