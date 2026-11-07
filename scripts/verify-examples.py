#!/usr/bin/env python3
"""Compile the published C parser and feed real malformed ELF files to it.

Uses only Python stdlib and a C11 compiler with ASan/UBSan. No Linux kernel
execution or ELF-loadability claim is made. Artifacts and logs stay in output/.
"""
import json
import math
import os
from pathlib import Path
import platform
import re
import shlex
import struct
import subprocess
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'technical-validation'
OUT.mkdir(parents=True, exist_ok=True)


def blocks(page, language):
    text = (ROOT / 'content' / page).read_text()
    return re.findall(r'^```' + language + r'\n(.*?)^```', text, re.M | re.S)


def run(args, **kw):
    return subprocess.run(args, text=True, capture_output=True, **kw)


def elf(*, phoff=64, count=1, entsize=56, offset=0, filesz=120,
        memsz=120, vaddr=0x400000, align=1, length=120):
    ident = b'\x7fELF\x02\x01\x01' + bytes(9)
    header = struct.pack('<16sHHIQQQIHHHHHH', ident, 2, 62, 1,
                         0x400000, phoff, 0, 0, 64, entsize, count, 0, 0, 0)
    data = bytearray(header + bytes(max(0, length - 64)))
    if 64 <= phoff <= len(data) - 56:
        data[phoff:phoff+56] = struct.pack('<IIQQQQQQ', 1, 5, offset,
                                         vaddr, 0, filesz, memsz, align)
    return data


compiler = shlex.split(os.environ.get('CC', 'cc'))
source = OUT / 'elf-envanter.c'
source.write_text(blocks('rehberler/elf-parser-ve-adresler.md', 'c')[0])
binary = OUT / 'elf-envanter'
compile_cmd = compiler + ['-std=c11', '-Wall', '-Wextra', '-Werror', '-g',
                          '-O1', '-fsanitize=address,undefined',
                          '-fno-sanitize-recover=all', str(source), '-o', str(binary)]
compiled = run(compile_cmd)
if compiled.returncode:
    raise SystemExit(compiled.stderr)

cases = {
    'valid-load': (elf(), 0, None),
    'valid-unaligned-phdr': (elf(phoff=65, length=121, filesz=121, memsz=121), 0, None),
    'valid-bss': (elf(filesz=0, memsz=4096), 0, None),
    'valid-empty-table': (elf(count=0, entsize=0, phoff=0, length=64), 0, None),
    'valid-last-byte': (elf(offset=119, filesz=1, memsz=1), 0, None),
    'empty': (b'', 1, 'short header'),
    'short-header': (bytes(63), 1, 'short header'),
    'zero-phentsize-at-eof': (elf(phoff=4096, entsize=0, length=4096), 1, 'e_phentsize'),
    'one-byte-phentsize': (elf(entsize=1, length=65), 1, 'e_phentsize'),
    'oversize-phentsize': (elf(entsize=57), 1, 'e_phentsize'),
    'phdr-at-eof': (elf(phoff=120), 1, 'program header file bounds'),
    'truncated-phdr': (elf(length=119), 1, 'program header file bounds'),
    'wrapped-phoff': (elf(phoff=2**64-32), 1, 'program header file bounds'),
    'count-exceeds-remainder': (elf(count=65534), 1, 'program header file bounds'),
    'extended-count': (elf(count=65535), 1, 'PN_XNUM'),
    'wrapped-segment': (elf(offset=2**64-16, filesz=32, memsz=32), 1, 'segment file bounds'),
    'huge-filesz': (elf(offset=1, filesz=2**64-1, memsz=2**64-1), 1, 'segment file bounds'),
    'segment-one-byte-past': (elf(offset=119, filesz=2, memsz=2), 1, 'segment file bounds'),
    'filesz-exceeds-memsz': (elf(memsz=119), 1, 'p_filesz > p_memsz'),
    'wrapped-vaddr': (elf(vaddr=2**64-16), 1, 'virtual address overflow'),
    'non-power-two-align': (elf(align=3), 1, 'segment alignment'),
    'incongruent-align': (elf(offset=1, filesz=0, align=4096), 1, 'segment alignment'),
}
for name, pos, val, reason in [
    ('bad-magic', 0, 0, 'magic'), ('elf32', 4, 1, 'ELF64'),
    ('big-endian', 5, 2, 'ELF64'), ('bad-ident-version', 6, 0, 'version'),
    ('bad-elf-version', 20, 0, 'version'), ('bad-ehsize', 52, 0, 'e_ehsize')
]:
    data = elf()
    data[pos] = val
    cases[name] = data, 1, reason

results = []
for name, (data, code, reason) in cases.items():
    fixture = OUT / (name + '.elf')
    fixture.write_bytes(data)
    result = run([str(binary), str(fixture)])
    assert result.returncode == code, (name, result.returncode, result.stderr)
    assert 'Sanitizer' not in result.stderr, (name, result.stderr)
    if reason:
        assert reason in result.stderr, (name, result.stderr)
    results.append(dict(case=name, bytes=len(data), exit=result.returncode,
                        stdout=result.stdout, stderr=result.stderr))

# A real oversized sparse file exercises the advertised resource limit.
oversized = OUT / 'oversized.elf'
with oversized.open('wb') as f:
    f.truncate(64 * 1024 * 1024 + 1)
result = run([str(binary), str(oversized)])
assert result.returncode == 1 and '64 MiB' in result.stderr
results.append(dict(case='oversized', exit=result.returncode, stderr=result.stderr))

# Portable examples: execute the exact published sources, not replicas.
portable = []
for page, expected in [('laboratuvarlar/debug-bilgisi.md', 'Total: 30'),
                       ('laboratuvarlar/derleme-farklari.md', 'Result: 285')]:
    code = blocks(page, 'c')[0]
    src = OUT / (Path(page).stem + '.c')
    src.write_text(code)
    for opt in (['-O0', '-O2', '-Os'] if 'derleme' in page else ['-O0']):
        exe = src.with_suffix('.' + opt[1:])
        result = run(compiler + ['-std=c11', '-Wall', '-Wextra', '-Werror', opt,
                                 str(src), '-o', str(exe)])
        assert result.returncode == 0, result.stderr
        result = run([str(exe)])
        assert result.returncode == 0 and result.stdout.strip() == expected, result
        portable.append(dict(page=page, optimization=opt, stdout=result.stdout))

# The procfs observer is portable C, but its successful observation needs Linux.
tracer_source = OUT / 'tracer.c'
tracer_source.write_text(blocks('rehberler/analiz-aracinin-etkisi.md', 'c')[0])
tracer_binary = OUT / 'tracer'
result = run(compiler + ['-std=c11', '-Wall', '-Wextra', '-Werror',
                         str(tracer_source), '-o', str(tracer_binary)])
assert result.returncode == 0, result.stderr
tracer_check = 'compiled; Linux observation not run by this check'
if platform.system() == 'Darwin':
    result = run([str(tracer_binary)])
    assert result.returncode == 2 and '/proc/self/status' in result.stderr
    tracer_check = 'compiled; missing procfs correctly returns unknown (exit 2) on macOS'

def entropy(data):
    return -sum((n / len(data)) * math.log2(n / len(data))
                for n in Counter(data).values())


deterministic = bytes(range(256)) * 16
constant = b'A' * 4096
assert entropy(deterministic) == 8.0
assert entropy(constant) == entropy(bytes(x ^ 0x5a for x in constant)) == 0.0
heuristics = dict(deterministic_histogram_entropy=entropy(deterministic),
                  constant_entropy=entropy(constant),
                  single_byte_xor_entropy=entropy(bytes(x ^ 0x5a for x in constant)))
report = dict(host=platform.platform(), compiler=run(compiler+['--version']).stdout,
              compile_command=compile_cmd, parser=results, portable=portable,
              entropy_counterexamples=heuristics,
              tracer=tracer_check,
              linux_runtime='not run by this portable check')
(OUT / 'results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
print(f'{len(results)} real ELF parser fixtures passed with ASan/UBSan; '
      f'{len(portable)} portable example runs passed. Logs: {OUT}')
