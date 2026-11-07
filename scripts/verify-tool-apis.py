#!/usr/bin/env python3
"""Check the published LIEF/pyelftools examples; optionally run Frida and fq.

Pinned validation dependencies: lief==0.17.1 pyelftools==0.32 frida==17.5.1.
Only the helper created by this script is instrumented. The ELF is inspected,
never executed: successful rewriting does not prove Linux loadability.
"""
import argparse
import gc
import json
import os
from pathlib import Path
import platform
import re
import shlex
import struct
import subprocess
import time

import lief
from elftools.elf.elffile import ELFFile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'technical-validation'
WORK = OUT / 'api'
WORK.mkdir(parents=True, exist_ok=True)


def block(page, language):
    text = (ROOT / 'content' / page).read_text()
    return re.findall(r'^\s*```' + language + r'\n(.*?)^\s*```', text, re.M | re.S)[0]


args = argparse.ArgumentParser(description=__doc__)
args.add_argument('--frida', action='store_true', help='instrument our own native child')
args.add_argument('--fq', help='path to fq, e.g. /tmp/execmap-validation-bin/fq')
options = args.parse_args()

# ELF64 LE x86-64 fixture: executable LOAD, exit(0), and a section name table.
# It has enough structure to exercise Binary.add; no assertion of OS execution.
ident = b'\x7fELF\x02\x01\x01' + bytes(9)
header = struct.pack('<16sHHIQQQIHHHHHH', ident, 2, 62, 1,
                     0x400078, 64, 144, 0, 64, 56, 1, 64, 2, 1)
phdr = struct.pack('<IIQQQQQQ', 1, 5, 0, 0x400000, 0x400000, 129, 129, 4096)
payload = b'\xb8\x3c\x00\x00\x00\x31\xff\x0f\x05'
names = b'\0.shstrtab\0'
data = header + phdr + payload + names
data += bytes(144 - len(data)) + bytes(64)
data += struct.pack('<IIQQQQIIQQ', 1, 3, 0, 0, 129, len(names), 0, 0, 1, 0)
(WORK / 'ornek').write_bytes(data)
os.chdir(WORK)
example_namespace = {}
exec(block('rehberler/ozel-yukleyiciler.md', 'python'), example_namespace)
example_namespace.clear()
patched = lief.ELF.parse('ornek_yamali')
section = patched.get_section('.yukleyici')
entry = patched.header.entrypoint
assert section is not None and entry == section.virtual_address
assert bytes(section.content[:len(payload)]) == payload
assert any(s.type == lief.ELF.Segment.TYPE.LOAD and s.has(lief.ELF.Segment.FLAGS.X)
           and s.virtual_address <= entry < s.virtual_address + s.virtual_size
           for s in patched.segments)
namespace = {'__name__': 'example'}
exec(block('rehberler/elf-parser-ve-adresler.md', 'python'), namespace)
namespace['analyze_elf']('ornek_yamali')
with open('ornek_yamali', 'rb') as f:
    assert ELFFile(f).header['e_entry'] == entry
report = dict(host=platform.platform(), lief=lief.__version__,
              lief_check='PASS: entry and bytes in executable PT_LOAD; not Linux-executed',
              pyelftools='PASS: 0.32 inventory and entry check',
              frida='not requested', fq='not requested')
# Regression guard for the section-table precondition found during validation.
without_sections = bytearray(data[:129])
struct.pack_into('<Q', without_sections, 40, 0)
struct.pack_into('<HHH', without_sections, 58, 0, 0, 0)
(WORK / 'ornek').write_bytes(without_sections)
try:
    exec(block('rehberler/ozel-yukleyiciler.md', 'python'), example_namespace)
except ValueError as error:
    assert 'section table' in str(error), error
else:
    raise AssertionError('The published example must reject a missing section table')
finally:
    example_namespace.clear()
    (WORK / 'ornek').write_bytes(data)
report['lief_missing_section_table'] = 'PASS: explicit precondition rejection'
del section, patched
gc.collect()

if options.fq:
    inventory = subprocess.run([options.fq, '-d', 'elf', '.', './ornek'],
                               check=True, capture_output=True, text=True)
    assert 'program_headers' in inventory.stdout
    (OUT / 'fq-inventory.txt').write_text(inventory.stdout)
    version = subprocess.run([options.fq, '--version'], check=True,
                             capture_output=True, text=True).stdout.strip()
    report['fq'] = 'PASS: published inventory command; ' + version

if options.frida:
    import frida
    helper = WORK / 'puts-test.c'
    helper.write_text('#include <stdio.h>\n#include <unistd.h>\n'
                      'int main(void){sleep(8); puts("execmap-api-check"); return 0;}\n')
    exe = WORK / 'puts-test'
    subprocess.run(shlex.split(os.environ.get('CC', 'cc')) +
                   [str(helper), '-o', str(exe)], check=True)
    child = subprocess.Popen([str(exe)], stdout=subprocess.PIPE, text=True)
    session = None
    logs, messages = [], []
    try:
        session = frida.attach(child.pid)
        script = session.create_script(block('rehberler/dinamik-baglama.md', 'javascript'))
        script.set_log_handler(lambda level, text: logs.append(dict(level=level, text=text)))
        script.on('message', lambda message, data: messages.append(message))
        script.load()
        stdout = child.communicate(timeout=20)[0]
        time.sleep(0.1)
        assert any('[+] puts: execmap-api-check' in item['text'] for item in logs), logs
        assert not any(m['type'] == 'error' for m in messages), messages
        report['frida'] = dict(version=frida.__version__, result='PASS: published hook in own native child',
                               stdout=stdout, logs=logs, messages=messages)
    finally:
        if session:
            try:
                session.detach()
            except frida.InvalidOperationError:
                pass  # The helper may already have exited.
        if child.poll() is None:
            child.kill()
            child.wait()

(OUT / 'api-results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(report, indent=2, ensure_ascii=False))
