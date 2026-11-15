#!/usr/bin/env python3
"""Check published runtime sources and trace validation without timing thresholds."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / 'examples/runtime-timing'
FIELDS = ['timestamp_ns', 'thread_cpu_ns', 'seq', 'tid', 'event']


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def write_csv(path, rows):
    with path.open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(FIELDS)
        writer.writerows(rows)


def verify(args, report):
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)

    def run(name, command, *, success=True):
        result = subprocess.run(command, cwd=out, text=True, capture_output=True,
                                timeout=60, env={**os.environ, 'LC_ALL': 'C'})
        (out / f'{name}.log').write_text(result.stdout + result.stderr)
        report['commands'].append({'name': name, 'argv': command,
                                   'exit': result.returncode, 'log': f'{name}.log'})
        require((result.returncode == 0) == success,
                f'{name}: unexpected exit {result.returncode}; see {out / (name + ".log")}')
        return result

    def analyze(name, path, count, *, success=True):
        command = [sys.executable, str(LAB / 'analyze.py'), str(path),
                   '--expected-count', str(count), '--json']
        result = run(name, command, success=success)
        if not success:
            require('FAIL:' in result.stderr and 'Traceback' not in result.stderr,
                    f'{name}: expected a useful validation failure')
            return None
        return json.loads(result.stdout)

    report['sources'] = {file.name: hashlib.sha256(file.read_bytes()).hexdigest()
                         for file in sorted(LAB.iterdir()) if file.is_file()
                         and file.name not in {'.gitignore', 'evidence.txt', 'validation.txt'}}
    report['python'] = sys.version
    report['verifier_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    report['analyzer']['status'] = 'running'
    # Known durations validate metric meanings, including sub-millisecond transitions.
    events = ['CYCLE_ENTER', 'BEFORE_CALL', 'WORK_ENTER', 'WORK_EXIT', 'AFTER_CALL']
    one = [[wall, cpu, 1, 11, event] for wall, cpu, event in zip(
        [0, 100000, 300000, 20300000, 20400000],
        [0, 10000, 20000, 40000, 50000], events)]
    two = [[r[0] + 50000000, r[1] + 60000, 2, r[3], r[4]] for r in one]
    fixture = out / 'known.csv'
    write_csv(fixture, one + two)
    summary = analyze('known-durations', fixture, 2)
    expected = {'work_elapsed_ms': 20, 'work_cpu_ms': 0.02,
                'call_transition_ms': 0.2, 'caller_elapsed_ms': 20.3,
                'entry_interval_ms': 50}
    for name, value in expected.items():
        require(abs(summary['metrics'][name]['median'] - value) < 1e-9,
                f'wrong meaning or units for {name}')

    other = [[r[0], r[1], r[2], 22, r[4]] for r in one]
    interleaved = [row for pair in zip(one, other) for row in pair]
    write_csv(fixture, interleaved)
    summary = analyze('interleaved-threads', fixture, 2)
    require(summary['threads'] == 2 and 'entry_interval_ms' not in summary['metrics'],
            'cross-thread entries must not become an interval')

    bad_cases = {
        'empty': [], 'missing-event': one[:-1], 'duplicate-event': one + [one[-1]],
        'missing-final-cycle': one, 'missing-whole-cycle': one + [
            [r[0], r[1], 3, r[3], r[4]] for r in two],
        'reordered-events': [one[1], one[0], *one[2:]],
        'overlapping-same-tid': [one[0], two[0], *one[1:], *two[1:]],
        'clock-backwards-between-cycles': one + [
            [r[0], r[1], 2, r[3], r[4]] for r in one],
        'cpu-backwards': [*one[:3], [20300000, 1, 1, 11, 'WORK_EXIT'], one[4]],
        'bad-number': [['oops', *one[0][1:]], *one[1:]],
        'negative-tid': [[r[0], r[1], r[2], -1, r[4]] for r in one],
        'extra-column': [[*one[0], 'extra'], *one[1:]],
        'missing-column': [one[0][:-1], *one[1:]],
    }
    for name, rows in bad_cases.items():
        write_csv(fixture, rows)
        analyze(f'reject-{name}', fixture, 2 if name in {
            'missing-final-cycle', 'missing-whole-cycle', 'overlapping-same-tid',
            'clock-backwards-between-cycles'} else 1, success=False)
    fixture.write_text('wrong,header\n1,2\n')
    analyze('reject-header', fixture, 1, success=False)
    report['analyzer'] = {'status': 'passed', 'rejected_inputs': len(bad_cases) + 1}

    if platform.system() != 'Linux':
        report['linux'].update(status='skipped', reason='Linux required')
        require(not (args.require_linux or args.gdb or args.cmake), 'Linux required')
        return

    report['linux']['status'] = 'running'
    compiler = shlex.split(os.environ.get('CXX', 'g++'))
    require(bool(compiler) and shutil.which(compiler[0]), 'C++ compiler not found')
    report['compiler'] = run('compiler-version', compiler + ['--version']).stdout
    report['compiler_target'] = run('compiler-target', compiler + ['-dumpmachine']).stdout.strip()
    report['kernel'] = run('kernel', ['uname', '-a']).stdout.strip()
    report['linux']['proc_version'] = Path('/proc/version').read_text().strip()
    report['linux']['os_release'] = Path('/etc/os-release').read_text()
    binary = out / 'timing_lab'
    run('build', compiler + ['-std=c++11', '-g3', '-O0', '-fno-omit-frame-pointer',
                            '-Wall', '-Wextra', '-Wpedantic', '-pthread',
                            str(LAB / 'timing_lab.cpp'), '-o', str(binary)])
    report['binary_sha256'] = hashlib.sha256(binary.read_bytes()).hexdigest()
    symbols = run('symbols', ['nm', str(binary)]).stdout
    for symbol in ['perform_work', 'run_cycle']:
        require(re.search(r'\bT ' + symbol + r'$', symbols, re.M), f'missing {symbol}')
    run('elf-notes', ['readelf', '-n', str(binary)])
    for mode, count, period, name in [('sleep', 20, 50, 'sleep'),
                                       ('busy', 20, 50, 'busy'),
                                       ('sleep', 5, 10, 'overrun')]:
        path = out / f'{name}.csv'
        result = run(name, [str(binary), mode, str(count), str(period), str(path)])
        require(re.search(r'pid=\d+ tid=\d+ mode=' + mode, result.stderr), 'missing run identity')
        summary = analyze(f'{name}-analysis', path, count)
        require(summary['records'] == count * 5 and summary['threads'] == 1,
                f'{name}: unexpected event coverage')
        report['linux'][name] = summary

    invalid = [['wrong'], ['sleep', '0'], ['sleep', '-1'], ['sleep', '+1'],
               ['sleep', ' 1'], ['sleep', '1x'], ['sleep', '10001'],
               ['sleep', '999999999999999999999999999999999'],
               ['sleep', '1', '0'], ['sleep', '1', '-1'], ['sleep', '1', '10001'],
               ['sleep', '1', '1', str(out / 'absent-directory' / 'trace.csv')],
               ['sleep', '1', '1', '/dev/full'], ['sleep', '1', '1', 'x', 'extra']]
    for index, command_args in enumerate(invalid):
        result = run(f'invalid-argument-{index}', [str(binary), *command_args], success=False)
        require(result.stderr.strip(), 'invalid arguments need a diagnostic')
    report['linux']['invalid_arguments'] = len(invalid)

    if args.cmake:
        report['cmake']['status'] = 'running'
        # A fresh cache also works after moving a checkout or changing compilers.
        cmake_build = Path(tempfile.mkdtemp(prefix='cmake-', dir=out))
        run('cmake-version', ['cmake', '--version'])
        run('cmake-configure', ['cmake', '-S', str(LAB), '-B', str(cmake_build)])
        run('cmake-build', ['cmake', '--build', str(cmake_build)])
        path = out / 'cmake.csv'
        run('cmake-execute', [str(cmake_build / 'timing_lab'), 'sleep', '2', '30', str(path)])
        analyze('cmake-analysis', path, 2)
        report['cmake']['status'] = 'passed'

    if args.gdb:
        report['gdb']['status'] = 'running'
        run('gdb-version', ['gdb', '--version'])
        page = (ROOT / 'content/laboratuvarlar/zamanlama-ve-bekleme.md').read_text()
        blocks = re.findall(r'^```text gdb\n(.*?)^```', page, re.M | re.S)
        require(len(blocks) == 1, 'expected one published GDB session')
        (out / 'results').mkdir(exist_ok=True)
        script = out / 'session.gdb'
        script.write_text('set disable-randomization off\n' + blocks[0] + 'quit\n')
        result = run('gdb-session', ['gdb', '-nx', '-q', '-batch', '-x', str(script),
                                    '--args', str(binary), 'sleep', '3', '50', 'results/gdb.csv'])
        for symbol in ['perform_work', 'run_cycle', 'main']:
            require(re.search(r'^#\d+\s+.*\b' + symbol + r'\b', result.stdout, re.M),
                    f'GDB: missing frame {symbol}')
        require('exited normally' in result.stdout, 'GDB inferior did not exit normally')
        analyze('gdb-analysis', out / 'results/gdb.csv', 3)
        report['gdb']['status'] = 'passed'
    report['linux']['status'] = 'passed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/runtime-validation')
    parser.add_argument('--require-linux', action='store_true')
    parser.add_argument('--gdb', action='store_true', help='also run the published GDB session')
    parser.add_argument('--cmake', action='store_true', help='also build and run with CMake')
    args = parser.parse_args()
    report = {'status': 'running', 'host': platform.platform(), 'commands': [],
              'analyzer': {'status': 'not-run'}, 'linux': {'status': 'not-run'},
              'gdb': {'status': 'not-run'}, 'cmake': {'status': 'not-run'},
              'perf': {'status': 'not-run'}, 'bpftrace': {'status': 'not-run'}}
    try:
        verify(args, report)
        report['status'] = 'passed'
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        report.update(status='failed', error=str(error))
        for section in ['analyzer', 'linux', 'gdb', 'cmake']:
            if report[section]['status'] == 'running':
                report[section]['status'] = 'failed'
        print(error, file=sys.stderr)
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / 'report.json'
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(f'Runtime lab: {report["status"]}; Linux={report["linux"]["status"]}. Report: {path}')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
