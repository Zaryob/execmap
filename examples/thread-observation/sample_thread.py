#!/usr/bin/env python3
"""Read bounded per-thread procfs counter deltas without changing kernel settings."""
import argparse
import json
import math
from pathlib import Path
import sys
import time


def identity(text):
    # comm is parenthesized and can itself contain spaces and parentheses.
    head, separator, tail = text.rpartition(') ')
    fields = tail.split()
    if not separator or '(' not in head or len(fields) < 20:
        raise ValueError('invalid /proc task stat record')
    return int(head.split(' (', 1)[0]), int(fields[19])  # fields 1 and 22


def snapshot(pid, tid, proc=Path('/proc')):
    task = proc / str(pid) / 'task' / str(tid)
    process_id = identity((proc / str(pid) / 'stat').read_text())
    before = identity((task / 'stat').read_text())
    values = [int(value) for value in (task / 'schedstat').read_text().split()]
    if len(values) != 3 or any(value < 0 for value in values):
        raise ValueError('expected three nonnegative schedstat counters')
    after = identity((task / 'stat').read_text())
    process_after = identity((proc / str(pid) / 'stat').read_text())
    if process_id != process_after or before != after or before[0] != tid or process_id[0] != pid:
        raise ValueError('task identity changed during snapshot')
    try:
        enabled = (proc / 'sys/kernel/sched_schedstats').read_text().strip()
    except OSError:
        enabled = 'unknown'
    return {'process': process_id, 'task': before, 'counters': values,
            'sched_schedstats': enabled, 'sample_ns': time.monotonic_ns()}


def difference(before, after):
    if before['process'] != after['process'] or before['task'] != after['task']:
        raise ValueError('PID/TID identity changed; cannot subtract samples')
    deltas = [b - a for a, b in zip(before['counters'], after['counters'])]
    if len(deltas) != 3 or any(value < 0 for value in deltas):
        raise ValueError('counters decreased; cannot interpret this interval')
    if after['sample_ns'] <= before['sample_ns']:
        raise ValueError('invalid observation interval')
    known = before['sched_schedstats'] == after['sched_schedstats'] == '1'
    return {'status': 'measured', 'sample_interval_ns': after['sample_ns'] - before['sample_ns'],
            'runtime_ns': deltas[0], 'timeslices': deltas[2],
            'runqueue_wait_ns': deltas[1] if known else None,
            'runqueue_status': 'enabled-at-endpoints' if known else 'disabled-or-unknown',
            'before': before, 'after': after}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pid', type=int)
    parser.add_argument('tid', type=int)
    parser.add_argument('--interval', type=float, default=0.25)
    args = parser.parse_args()
    if args.pid < 1 or args.tid < 1 or not math.isfinite(args.interval) or not 0.01 <= args.interval <= 5:
        parser.error('positive PID/TID and interval in 0.01..5 seconds required')
    try:
        before = snapshot(args.pid, args.tid)
        time.sleep(args.interval)
        result = difference(before, snapshot(args.pid, args.tid))
    except (OSError, ValueError) as error:
        print(json.dumps({'status': 'unavailable', 'reason': str(error)}))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
