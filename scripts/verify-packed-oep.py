#!/usr/bin/env python3
"""Compare a known native Linux ELF entry with a locally packed UPX fixture."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import struct
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--upx', type=Path, required=True, help='Explicit path to a trusted UPX executable')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'output/packed-oep')
args = parser.parse_args()
if platform.system() != 'Linux' or platform.machine() not in ('aarch64', 'x86_64'):
    parser.error('native Linux aarch64 or x86_64 required')
upx = args.upx.resolve()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
if any(out.iterdir()):
    parser.error('choose an empty output directory to preserve earlier evidence')
os.chdir(out)
report = {'host': platform.platform(), 'architecture': platform.machine(), 'commands': []}

def run(name, cmd):
    result = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env={**os.environ, 'LC_ALL': 'C', 'DEBUGINFOD_URLS': ''}, timeout=60)
    Path(name + '.log').write_text('$ ' + ' '.join(cmd) + '\n' + result.stdout + '\nSTDERR:\n' + result.stderr)
    report['commands'].append({'name': name, 'argv': cmd, 'exit': result.returncode})
    if result.returncode:
        raise RuntimeError(f'{name}: exit {result.returncode}; see {name}.log')
    return result

try:
    report['upx_version'] = run('upx-version', [str(upx), '--version']).stdout.splitlines()[0]
    Path('fixture.c').write_text('#include <stdio.h>\nint main(void){puts("known fixture reached main");return 0;}\n')
    report['compiler'] = run('compiler', ['gcc', '--version']).stdout.splitlines()[0]
    report['gdb'] = run('gdb-version', ['gdb', '--version']).stdout.splitlines()[0]
    run('compile', ['gcc', '-g', '-O0', '-static', '-no-pie', 'fixture.c', '-o', 'original'])
    run('original-run', ['./original'])
    run('pack', [str(upx), '-o', 'packed', 'original'])
    run('packed-test', [str(upx), '-t', 'packed'])
    run('packed-run', ['./packed'])
    original = Path('original').read_bytes()
    packed = Path('packed').read_bytes()
    assert original[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', original, 16)[0] == 2
    entry = struct.unpack_from('<Q', original, 24)[0]
    packed_entry = struct.unpack_from('<Q', packed, 24)[0]
    phoff = struct.unpack_from('<Q', original, 32)[0]
    phsize, phnum = struct.unpack_from('<HH', original, 54)
    for i in range(phnum):
        kind, flags, offset, address, _, file_size, _, _ = struct.unpack_from('<IIQQQQQQ', original, phoff + i * phsize)
        if kind == 1 and flags & 1 and address <= entry and entry + 32 <= address + file_size:
            expected = original[offset + entry - address:offset + entry - address + 32]
            break
    else:
        raise AssertionError('32 entry bytes must be inside an executable file-backed LOAD')
    Path('expected-entry.bin').write_bytes(expected)
    # Create a live inferior first: local hardware breakpoint support is queried then.
    commands = '\n'.join([
        'set pagination off', 'set confirm off', 'set disable-randomization off',
        'starti', f'hbreak *{entry:#x}', 'continue', 'printf "OEP_PC=%p\\n", $pc',
        'x/8i $pc', f'dump binary memory observed-entry.bin {entry:#x} {entry + 32:#x}',
        'continue', 'quit',
    ]) + '\n'
    Path('oep.gdb').write_text(commands)
    result = run('packed-OEP-GDB', ['gdb', '-nx', '-q', '-batch', '-x', 'oep.gdb', './packed'])
    assert Path('observed-entry.bin').read_bytes() == expected
    observed_pc = int(re.search(r'OEP_PC=(0x[0-9a-f]+)', result.stdout)[1], 16)
    assert observed_pc == entry and entry != packed_entry
    assert 'known fixture reached main' in result.stdout and 'exited normally' in result.stdout
    run('unpack', [str(upx), '-d', '-o', 'roundtrip', 'packed'])
    assert Path('roundtrip').read_bytes() == original
    report.update(status='passed', original_entry=hex(entry), packed_stub_entry=hex(packed_entry),
                  entry_bytes_equal=True, roundtrip_sha256_equal=True,
                  negative='packed e_entry is the stub and differs from the known original entry',
                  scope='one static ET_EXEC fixture on the recorded architecture; no generic packer, PT, or syscall-register claim')
except Exception as error:
    report.update(status='failed', reason=repr(error))
finally:
    names = ['fixture.c', 'original', 'packed', 'expected-entry.bin', 'observed-entry.bin', 'roundtrip']
    report['hashes'] = {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in names if Path(name).exists()}
    Path('report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
raise SystemExit(report['status'] != 'passed')
