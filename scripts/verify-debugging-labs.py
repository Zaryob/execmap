#!/usr/bin/env python3
"""Verify six-point correlation, C++ member debugging, and read-only procfs sampling."""
import argparse
import csv
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / 'examples/event-pipeline'
SAMPLER = ROOT / 'examples/thread-observation/sample_thread.py'
sys.dont_write_bytecode = True


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify(args, report):
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)

    def run(name, command, success=True):
        result = subprocess.run(command, cwd=out, text=True, capture_output=True,
                                timeout=60, env={**os.environ, 'LC_ALL': 'C'})
        (out / f'{name}.log').write_text(result.stdout + result.stderr)
        report['commands'].append({'name': name, 'argv': command,
                                   'exit': result.returncode, 'log': f'{name}.log'})
        require((result.returncode == 0) == success, f'{name}: see {out / (name + ".log")}')
        return result

    analyzer = load('pipeline_analysis', PIPELINE / 'analyze.py')
    sampler = load('thread_sampler', SAMPLER)
    report['sources'] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                         for p in [PIPELINE / 'event_pipeline.cpp', PIPELINE / 'analyze.py',
                                   SAMPLER, Path(__file__)]}
    report['python'] = sys.version
    fixture = out / 'fixture.csv'

    def save(rows):
        with fixture.open('w', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(analyzer.FIELDS)
            writer.writerows(rows)

    def rejected(rows, mode='direct', count=2):
        save(rows)
        result = run('reject-trace-' + str(report['rejected_traces']),
                     [sys.executable, str(PIPELINE / 'analyze.py'), str(fixture),
                      '--mode', mode, '--expected-count', str(count)], False)
        require('FAIL:' in result.stderr and 'Traceback' not in result.stderr,
                'malformed input needs an actionable diagnostic')
        report['rejected_traces'] += 1

    first = [['fixture', value * 1000000, 1, 11, event] for value, event in zip(
        [0, 1, 2, 5, 9, 10], analyzer.EVENTS)]
    second = [[r[0], r[1] + 100000000, 2, r[3], r[4]] for r in first]
    save(first + second)
    summary = analyzer.analyze(fixture, 'direct', 2)
    one = summary['invocations'][0]
    for metric, value in {'receive_to_dispatch_ms': 1, 'dispatch_prepare_ms': 1,
                          'call_transition_ms': 3, 'work_elapsed_ms': 4,
                          'return_transition_ms': 1, 'caller_elapsed_ms': 8}.items():
        require(one[metric] == value, f'wrong stage: {metric}')
    require(summary['invocations'][1]['source_interval_ms'] == 100, 'wrong source interval')
    # Producer can receive the next sequence before the previous consumer finishes.
    queued = [list(row) for row in first + second]
    for row in queued:
        if row[4] != 'RECEIVED':
            row[3] = 22
    queued[6][1] = 500000  # next receipt interleaves the previous handler
    queued.sort(key=lambda row: row[1])
    save(queued)
    require(analyzer.analyze(fixture, 'queued', 2)['consumer_tid'] == 22,
            'cross-thread sequence correlation failed')
    for rows in [[], first, first[:-1] + second, first + [first[-1]] + second,
                 [first[1], first[0], *first[2:], *second],
                 first + [[r[0], r[1], 3, r[3], r[4]] for r in second],
                 first + [['another-run', *r[1:]] for r in second],
                 [['bad,run', *first[0][1:]], *first[1:], *second],
                 [['fixture', 'bad', *first[0][2:]], *first[1:], *second],
                 [[*first[0], 'extra'], *first[1:], *second],
                 [first[0][:-1], *first[1:], *second],
                 first + [[r[0], r[1] - 100000000, r[2], r[3], r[4]] for r in second]]:
        rejected(rows)
    rejected(first + second, 'queued')
    rejected(queued, 'direct')
    report['correlation']['status'] = 'passed'

    report['procfs_fixtures']['status'] = 'running'
    # Field 22 follows a comm value that contains spaces and a closing parenthesis.
    stat = '77 (worker ) pool) ' + ' '.join(['S'] + ['0'] * 18 + ['123'])
    require(sampler.identity(stat) == (77, 123), 'incorrect stat field parsing')
    before = {'process': (77, 123), 'task': (78, 125), 'counters': [100, 20, 2],
              'sched_schedstats': '1', 'sample_ns': 100}
    after = {**before, 'counters': [300, 70, 5], 'sample_ns': 200}
    delta = sampler.difference(before, after)
    require(delta['runtime_ns'] == 200 and delta['runqueue_wait_ns'] == 50 and
            delta['timeslices'] == 3, 'incorrect scheduler counter delta')
    require(sampler.difference({**before, 'sched_schedstats': '0'}, after)[
        'runqueue_wait_ns'] is None, 'disabled accounting must not mean zero waiting')
    for changed in [{'task': (78, 126)}, {'process': (77, 124)},
                    {'counters': [99, 70, 5]}, {'sample_ns': 100}]:
        try:
            sampler.difference(before, {**after, **changed})
        except ValueError:
            pass
        else:
            raise RuntimeError(f'failed to reject invalid counter window: {changed}')
    report['procfs_fixtures']['status'] = 'passed'

    if platform.system() != 'Linux':
        report['linux'].update(status='skipped', reason='Linux required')
        require(not (args.require_linux or args.gdb), 'Linux required')
        return
    report['linux']['status'] = 'running'
    compiler = shlex.split(os.environ.get('CXX', 'g++'))
    require(bool(compiler) and shutil.which(compiler[0]), 'C++ compiler not found')
    report['compiler'] = run('compiler-version', compiler + ['--version']).stdout
    report['compiler_target'] = run('compiler-target', compiler + ['-dumpmachine']).stdout.strip()
    report['kernel'] = run('kernel', ['uname', '-a']).stdout.strip()
    report['os_release'] = Path('/etc/os-release').read_text()
    flags = ['-std=c++11', '-g3', '-O0', '-fno-omit-frame-pointer',
             '-Wall', '-Wextra', '-Wpedantic', '-pthread']
    binary = out / 'event_pipeline'
    run('build', compiler + flags + [str(PIPELINE / 'event_pipeline.cpp'), '-o', str(binary)])
    report['binary_sha256'] = hashlib.sha256(binary.read_bytes()).hexdigest()
    report['linux']['runs'] = {}
    for mode in ['direct', 'queued']:
        for scenario in ['baseline', 'source-gap', 'dispatch-wait']:
            name = f'{mode}-{scenario}'
            csv_path = out / f'{name}.csv'
            run(name, [str(binary), mode, scenario, '8', name, str(csv_path)])
            summary = analyzer.analyze(csv_path, mode, 8)
            report['linux']['runs'][name] = summary
            if scenario == 'dispatch-wait':
                require(summary['invocations'][2]['call_transition_ms'] >= 25,
                        'controlled 30 ms caller wait was not observed')
            if scenario == 'source-gap':
                require(summary['invocations'][2]['source_interval_ms'] >= 25,
                        'controlled source wait was not observed')
    for index, arguments in enumerate([
            ['invalid', 'baseline', '3', 'id'], ['direct', 'unknown', '3', 'id'],
            ['direct', 'baseline', '0', 'id'], ['direct', 'baseline', '-3', 'id'],
            ['direct', 'baseline', '1001', 'id'], ['direct', 'baseline', '3', 'bad,id']]):
        run(f'invalid-arguments-{index}', [str(binary), *arguments, str(out / 'invalid.csv')], False)
    run('output-write-failure', [str(binary), 'queued', 'baseline', '3', 'id', '/dev/full'], False)

    timing_binary = out / 'timing_lab'
    timing_source = ROOT / 'examples/runtime-timing/timing_lab.cpp'
    run('build-timing-target', compiler + flags + [str(timing_source), '-o', str(timing_binary)])
    report['timing_binary_sha256'] = hashlib.sha256(timing_binary.read_bytes()).hexdigest()
    report['sources'][str(timing_source.relative_to(ROOT))] = hashlib.sha256(timing_source.read_bytes()).hexdigest()
    child_command = [str(timing_binary), 'sleep', '40', '50', str(out / 'sample-target.csv')]
    child = subprocess.Popen(child_command, cwd=out, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        sampled = run('live-thread-sample', [sys.executable, str(SAMPLER),
                                            str(child.pid), str(child.pid), '--interval', '0.05'])
        report['live_procfs'] = json.loads(sampled.stdout)
        require(report['live_procfs']['status'] == 'measured', 'live procfs sample unavailable')
    finally:
        stdout, stderr = child.communicate(timeout=10)
        (out / 'sample-target.log').write_text(stdout + stderr)
        report['commands'].append({'name': 'sample-target', 'argv': child_command,
                                   'exit': child.returncode, 'log': 'sample-target.log'})
    require(child.returncode == 0, 'finite sample target failed')

    if args.gdb:
        report['gdb']['status'] = 'running'
        run('gdb-version', ['gdb', '--version'])
        page = (ROOT / 'content/rehberler/cpp-cagri-zinciri.md').read_text()
        sessions = re.findall(r'^```text gdb\n(.*?)^```', page, re.M | re.S)
        require(len(sessions) == 1, 'expected one published C++ GDB session')
        session = sessions[0].replace('print this->completed\n',
            'print this->completed\nif seq != 1 || this->completed != 0\nquit 1\nend\n')
        session = session.replace('print worker_.completed\n',
            'print worker_.completed\nif worker_.completed != 1\nquit 1\nend\n')
        script = out / 'member-session.gdb'
        script.write_text('set disable-randomization off\n' + session + 'quit\n')
        (out / 'results').mkdir(exist_ok=True)
        result = run('member-gdb', ['gdb', '-nx', '-q', '-batch', '-x', str(script), '--args',
                                  str(binary), 'direct', 'baseline', '3', 'gdb-run', 'results/gdb.csv'])
        for symbol in ['Worker::process', 'Dispatcher::dispatch', 'main']:
            require(re.search(r'^#\d+\s+.*' + re.escape(symbol), result.stdout, re.M),
                    'missing GDB frame: ' + symbol)
        require('exited normally' in result.stdout, 'GDB inferior did not exit normally')
        analyzer.analyze(out / 'results/gdb.csv', 'direct', 3)
        report['gdb']['status'] = 'passed'
    report['linux']['status'] = 'passed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/debugging-validation')
    parser.add_argument('--require-linux', action='store_true')
    parser.add_argument('--gdb', action='store_true')
    args = parser.parse_args()
    report = {'status': 'running', 'host': platform.platform(), 'commands': [],
              'correlation': {'status': 'running'}, 'procfs_fixtures': {'status': 'not-run'},
              'linux': {'status': 'not-run'}, 'gdb': {'status': 'not-run'}, 'rejected_traces': 0,
              'perf': {'status': 'not-run'}, 'bpftrace': {'status': 'not-run'}}
    try:
        verify(args, report)
        report['status'] = 'passed'
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        report.update(status='failed', error=str(error))
        for key in ['correlation', 'procfs_fixtures', 'linux', 'gdb']:
            if report[key]['status'] == 'running':
                report[key]['status'] = 'failed'
        print(error, file=sys.stderr)
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / 'report.json'
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(f'Debugging labs: {report["status"]}; Linux={report["linux"]["status"]}. Report: {path}')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
