#!/usr/bin/env python3
"""Compile and run the C programs published in the beginner perf/bpftrace labs.

The C blocks are extracted from the Markdown pages themselves, so the check
covers exactly what a reader copies. It verifies the deterministic results the
labs tell readers to expect (counts, sums, checksums) and the qualitative
timing claims (which stage dominates, quadratic scaling, the fix's effect).

This is a portable check: it runs on Linux or macOS with a C compiler and does
not run perf or bpftrace. Tool output on a Linux machine is not validated here.
"""
import argparse, hashlib, json, os, platform, re, shutil, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABS = {
    'hotspot': 'laboratuvarlar/cpu-profili',
    'worker': 'laboratuvarlar/bpftrace-ilk-adimlar',
    'slowjobs': 'laboratuvarlar/yavas-program-teshisi',
}

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument('--output', type=Path, default=ROOT / 'output/perf-lab-validation')
parser.add_argument('--cc', default=os.environ.get('CC') or shutil.which('gcc') or shutil.which('cc') or 'cc')
args = parser.parse_args()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
report = {'host': platform.platform(), 'compiler': args.cc, 'sources': {}, 'checks': {}}
failures = 0


def source(page):
    path = ROOT / 'content' / (page + '.md')
    raw = path.read_text()
    report['sources'][str(path.relative_to(ROOT))] = hashlib.sha256(raw.encode()).hexdigest()
    blocks = re.findall(r'```c(?: [A-Za-z0-9_.-]+\.[A-Za-z0-9]+)?\n(.*?)\n```', raw, re.S)
    assert len(blocks) == 1, f'{page}: expected exactly one C block, found {len(blocks)}'
    return blocks[0] + '\n'


def build(name):
    (out / f'{name}.c').write_text(source(LABS[name]))
    flags = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', '-g', '-fno-omit-frame-pointer']
    if name == 'slowjobs':
        flags.append('-pthread')
    subprocess.run([args.cc, *flags, f'{name}.c', '-o', name], cwd=out, check=True)


def run(*argv):
    start = time.monotonic()
    p = subprocess.run([str(out / argv[0]), *argv[1:]], cwd=out, text=True, capture_output=True, timeout=60)
    assert p.returncode == 0, (argv, p.returncode, p.stderr)
    return p.stdout, p.stderr, time.monotonic() - start


def stages(stderr):
    return {k: float(v) for k, v in re.findall(r'(\w+)=([\d.]+)ms', stderr)}


def check(name, fn):
    global failures
    try:
        report['checks'][name] = {'status': 'passed', 'result': fn()}
        print(f'ok   {name}')
    except Exception as error:  # record every failure, keep checking the rest
        failures += 1
        report['checks'][name] = {'status': 'failed', 'error': repr(error)}
        print(f'FAIL {name}: {error!r}')


def hotspot():
    build('hotspot')
    slow_out, slow_err, _ = run('hotspot')
    fixed_out, fixed_err, _ = run('hotspot', '40000', 'fixed')
    assert 'found=20051 ' in slow_out, slow_out
    assert slow_out.replace('slow', 'X') == fixed_out.replace('fixed', 'X'), (slow_out, fixed_out)
    s, f = stages(slow_err), stages(fixed_err)
    total = sum(s.values())
    assert s['lookup'] / total > 0.6, s          # lab: lookup dominates the slow run
    assert f['checksum'] > f['lookup'], f         # lab: checksum becomes the top stage
    small, large = stages(run('hotspot', '20000')[1]), stages(run('hotspot', '40000')[1])
    lookup_ratio = large['lookup'] / small['lookup']
    checksum_ratio = large['checksum'] / small['checksum']
    assert 2.8 < lookup_ratio < 6, lookup_ratio   # quadratic: about 4x per doubling
    assert 1.4 < checksum_ratio < 3, checksum_ratio  # linear: about 2x per doubling
    return {'slow': s, 'fixed': f, 'lookup_ratio': round(lookup_ratio, 2), 'checksum_ratio': round(checksum_ratio, 2)}


def worker():
    build('worker')
    stdout, _, elapsed = run('worker')
    assert re.match(r'items=50 result_sum=147 pid=\d+\n$', stdout), stdout
    data = (out / 'worker-input.txt').read_bytes()
    assert len(data) == 10000 and set(data) == {ord('x')}
    assert not (out / 'missing.conf').exists()
    assert elapsed >= 0.1, elapsed                  # 50 sleeps of 2 ms
    expected = sum(i % 7 for i in range(50))
    assert expected == 147
    return {'stdout': stdout.strip().rsplit(' ', 1)[0], 'elapsed_s': round(elapsed, 3)}


def slowjobs():
    build('slowjobs')
    slow_out, _, slow_s = run('slowjobs')
    fixed_out, _, fixed_s = run('slowjobs', '200', 'fixed')
    assert 'jobs=200 sum=1480 ' in slow_out and 'jobs=200 sum=1480 ' in fixed_out, (slow_out, fixed_out)
    assert slow_s > 1.0, slow_s                     # lab: seconds, dominated by lock waits
    assert fixed_s < slow_s / 4, (fixed_s, slow_s)  # lab: fix removes most of the time
    return {'slow': slow_out.strip(), 'fixed': fixed_out.strip(), 'slow_s': round(slow_s, 2), 'fixed_s': round(fixed_s, 2)}


check('cpu-profili: results, dominant stage, scaling', hotspot)
check('bpftrace-ilk-adimlar: deterministic counts', worker)
check('yavas-program-teshisi: results and fix effect', slowjobs)
(out / 'report.json').write_text(json.dumps(report, indent=2))
print(f'report: {out / "report.json"}')
sys.exit(1 if failures else 0)
