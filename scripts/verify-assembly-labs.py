#!/usr/bin/env python3
"""Verify the actual published assembly-lab sources and GDB command blocks.

No third-party Python modules. Portable C behavior is distinct from native
Linux x86-64 ABI/GDB checks. Every run writes its status, including failures.
"""
import argparse
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'assembly-validation'


def blocks(markdown, language):
    return re.findall(r'^```' + language + r'\n(.*?)^```', markdown, re.M | re.S)


def run(args, *, timeout=20):
    return subprocess.run(args, cwd=OUT, text=True, capture_output=True,
                          timeout=timeout, env={**os.environ, 'LC_ALL': 'C'})


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def gdb_assert(expression):
    return (f'if !({expression})\n'
            '  echo Assembly lab assertion failed\\n\n'
            '  quit 1\nend\n')


def check_gdb(name, binary, commands, expected, report):
    script = OUT / f'{name}.gdb'
    script.write_text(commands)
    command = ['gdb', '-nx', '-q', '-batch', '-x', str(script), str(binary)]
    result = run(command, timeout=60)
    (OUT / f'{name}.log').write_text(result.stdout + result.stderr)
    report['linux_gdb']['sessions'].append({
        'name': name, 'command': command, 'exit': result.returncode,
        'log': f'{name}.log', 'commands': script.name,
    })
    require(result.returncode == 0,
            f'{name}: GDB failed; see {OUT / (name + ".log")}')
    require(expected in result.stdout, f'{name}: missing {expected!r}')


def verify(report, require_linux):
    compiler = shlex.split(os.environ.get('CC', 'gcc'))
    require(bool(compiler) and shutil.which(compiler[0]), 'C compiler not found')
    report['compiler'] = run(compiler + ['--version']).stdout
    report['compiler_target'] = run(compiler + ['-dumpmachine']).stdout.strip()
    pages = {}
    for slug in ['gdb-ilk-inceleme', 'dallanma-ve-pointer']:
        page = ROOT / 'content' / 'laboratuvarlar' / f'{slug}.md'
        markdown = page.read_text()
        sources = blocks(markdown, 'c')
        require(len(sources) == 1, f'{slug}: expected one C source block')
        commands = [shlex.split(line) for block in blocks(markdown, 'bash')
                    for line in block.splitlines() if line.startswith('gcc -std=')]
        require(bool(commands), f'{slug}: no published compilation commands')
        source_name = 'ilk-inceleme.c' if slug == 'gdb-ilk-inceleme' else 'dallanma.c'
        (OUT / source_name).write_text(sources[0])
        for args in commands:
            command = compiler + args[1:]
            result = run(command)
            report['builds'].append({'page': str(page.relative_to(ROOT)),
                                    'source_sha256': hashlib.sha256(sources[0].encode()).hexdigest(),
                                    'command': command, 'exit': result.returncode,
                                    'stderr': result.stderr})
            require(result.returncode == 0, result.stderr)
        pages[slug] = markdown

    first = OUT / 'ilk-inceleme'
    result = run([str(first)])
    require(result.returncode == 0 and result.stdout == 'value=12 result=12\n',
            f'first lab: unexpected result {result}')
    report['portable']['first_lab'] = result.stdout.strip()

    for optimization in ['O0', 'O2']:
        binary = OUT / f'dallanma_{optimization}'
        for value in range(-1000, 1001):
            expected_value = -value if value < 0 else value + 3
            expected = f'input={value} target={expected_value} result={expected_value}\n'
            result = run([str(binary), str(value)])
            require(result.returncode == 0 and result.stdout == expected,
                    f'{optimization}, input {value}: {result}')
        invalid = [[], [''], ['abc'], ['7x'], ['1001'], ['-1001'],
                   ['999999999999999999999999999999999999'],
                   ['-999999999999999999999999999999999999'], ['1', '2']]
        for args in invalid:
            result = run([str(binary), *args])
            require(result.returncode == 2 and not result.stdout and result.stderr,
                    f'{optimization}, invalid {args!r}: {result}')
        report['portable'][optimization] = {'valid_integer_inputs': 2001,
                                           'invalid_argument_cases': len(invalid)}
    report['portable']['status'] = 'passed'

    supported = platform.system() == 'Linux' and platform.machine() == 'x86_64'
    missing = [tool for tool in ['gdb', 'objdump', 'readelf'] if not shutil.which(tool)]
    if not supported or missing:
        reason = ('Native Linux x86-64 required' if not supported
                  else 'Missing tools: ' + ', '.join(missing))
        report['linux_gdb'].update(status='skipped', reason=reason)
        require(not require_linux, reason)
        return

    report['linux_gdb']['status'] = 'running'
    for tool in ['gdb', 'objdump', 'readelf']:
        report['linux_gdb'][tool] = run([tool, '--version']).stdout.splitlines()[0]
    for binary_name, symbol in [('ilk-inceleme', 'hesapla'),
                                ('dallanma_O0', 'sec_ve_yaz'),
                                ('dallanma_O2', 'sec_ve_yaz')]:
        binary = OUT / binary_name
        header = run(['readelf', '-hW', str(binary)])
        require(header.returncode == 0 and 'Advanced Micro Devices X86-64' in header.stdout,
                f'{binary_name}: expected x86-64 ELF')
        (OUT / f'{binary_name}.elf-header.txt').write_text(header.stdout)
        disasm = run(['objdump', '-d', '-M', 'intel', f'--disassemble={symbol}', str(binary)])
        require(disasm.returncode == 0 and f'<{symbol}>:' in disasm.stdout,
                f'{binary_name}: missing disassembly')
        (OUT / f'{binary_name}.disassembly.txt').write_text(disasm.stdout)

    first_blocks = blocks(pages['gdb-ilk-inceleme'], 'gdb')
    require(len(first_blocks) == 4, 'first lab: GDB command blocks changed')
    baseline = first_blocks[0] + gdb_assert(
        '(int)$esi == 5 && *$hedef_adresi == 7 && (unsigned long)$rsp % 16 == 8')
    baseline += first_blocks[1]
    baseline += ('set $adim = 0\nwhile *$hedef_adresi == 7 && $adim < 128\n'
                 '  stepi\n  set $adim = $adim + 1\nend\n')
    baseline += gdb_assert('*$hedef_adresi == 12')
    baseline += 'finish\n' + gdb_assert(
        '(int)$eax == 12 && sayi == 12 && (void *)$pc == $donus_adresi')
    baseline += 'continue\nquit\n'
    check_gdb('first-entry-step-return', first, baseline,
              'value=12 result=12', report)
    check_gdb('first-intervention', first, first_blocks[3],
              'value=16 result=16', report)

    # Keep the published watchpoint session, adding assertions before deletion.
    branch_blocks = blocks(pages['dallanma-ve-pointer'], 'gdb')
    require(len(branch_blocks) == 1, 'branch lab: GDB command blocks changed')
    watch = branch_blocks[0].replace('delete $bpnum\n',
                                    gdb_assert('*$hedef_adresi == 7') + 'delete $bpnum\n')
    check_gdb('branch-watchpoint', OUT / 'dallanma_O0', watch,
              'input=-7 target=7 result=7', report)

    optimized = ('set pagination off\nset disassembly-flavor intel\n'
                 'set disable-randomization off\nstart -7\n'
                 'break *sec_ve_yaz\ncontinue\n'
                 'set $hedef_adresi = (int *)$rdi\n')
    # The initial zero in main is a dead store: this callee overwrites the
    # target before reading it. GCC may remove it at -O2 even without inlining.
    # Check the entry argument and the observable final store/return instead.
    optimized += gdb_assert('(int)$esi == -7')
    optimized += 'disassemble /r sec_ve_yaz\nfinish\n'
    optimized += gdb_assert('(int)$eax == 7 && *$hedef_adresi == 7')
    optimized += 'continue\nquit\n'
    check_gdb('branch-optimized-entry', OUT / 'dallanma_O2', optimized,
              'input=-7 target=7 result=7', report)
    result = run([str(first)])
    require(result.returncode == 0 and result.stdout == 'value=12 result=12\n',
            'debugger intervention must not persist in executable')
    report['linux_gdb']['status'] = 'passed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-linux-gdb', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'host': platform.platform(), 'builds': [], 'portable': {'status': 'running'},
              'linux_gdb': {'status': 'not-run', 'sessions': []}, 'status': 'running'}
    try:
        verify(report, args.require_linux_gdb)
        report['status'] = 'passed'
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        report.update(status='failed', error=str(error))
        for section in ['portable', 'linux_gdb']:
            if report[section]['status'] == 'running':
                report[section]['status'] = 'failed'
        print(str(error), file=sys.stderr)
    finally:
        (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'Assembly labs: {report["status"]}; portable={report["portable"]["status"]}; '
          f'Linux/GDB={report["linux_gdb"]["status"]}. Report: {OUT / "report.json"}')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
