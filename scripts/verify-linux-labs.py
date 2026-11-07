#!/usr/bin/env python3
"""Run published Linux/glibc fragments and bounded controls; no host policy changes."""
import argparse, hashlib, json, os, pathlib, platform, re, shutil, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
a = argparse.ArgumentParser()
a.add_argument('--output', type=pathlib.Path, default=ROOT / 'output/linux-validation')
args = a.parse_args()
if platform.system() != 'Linux':
    a.error('native Linux/glibc required; macOS compilation is not acceptance')
OUT = args.output.resolve(); OUT.mkdir(parents=True, exist_ok=True)
os.chdir(OUT)
report = {'host': platform.platform(), 'architecture': platform.machine(), 'sources': {}, 'checks': {}, 'commands': []}

def run(name, cmd, expected=0, env=None, timeout=30):
    p = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       env={**os.environ, 'LC_ALL': 'C', 'DEBUGINFOD_URLS': '', **(env or {})}, timeout=timeout)
    (OUT / (name + '.log')).write_text('$ ' + ' '.join(cmd) + '\n' + p.stdout + '\nSTDERR:\n' + p.stderr)
    report['commands'].append({'name': name, 'argv': cmd, 'exit': p.returncode, 'log': name + '.log'})
    if expected is not None:
        assert p.returncode == expected, (name, p.returncode, p.stdout, p.stderr)
    return p

def source(page, lang='c', index=0):
    path = ROOT / 'content' / (page + '.md')
    raw = path.read_text(); report['sources'][str(path.relative_to(ROOT))] = hashlib.sha256(raw.encode()).hexdigest()
    return re.findall(r'```' + lang + r'\n(.*?)\n```', raw, re.S)[index] + '\n'

def write(name, data):
    (OUT / name).write_text(data)

def cc(name, code, *flags):
    write(name + '.c', code)
    run('build-' + name, ['gcc', '-Wall', '-Wextra', '-Werror', '-O0', '-g', name + '.c', '-o', name, *flags])

def check(name, fn):
    try:
        details = fn(); report['checks'][name] = {'status': 'passed', 'details': details}
    except Exception as e:
        report['checks'][name] = {'status': 'failed', 'error': repr(e)}
    (OUT / 'report.json').write_text(json.dumps(report, indent=2))

run('environment', ['sh', '-c', 'uname -a; ldd --version; gcc --version; ld --version; gdb --version; strace -V; cat /proc/sys/kernel/core_pattern; cat /proc/sys/kernel/yama/ptrace_scope; capsh --print'])

def memory():
    cc('izin', source('laboratuvarlar/bellek-izinleri'))
    with open('memory.stdout', 'w') as out, open('memory.stderr', 'w') as err:
        p = subprocess.Popen(['strace', '-o', 'memory.strace', '-e', 'trace=mmap,mprotect,munmap', './izin'], stdout=out, stderr=err)
        stages = []
        try:
            for _ in range(120):
                output = pathlib.Path('memory.stdout').read_text()
                m = re.search(r'pid=(\d+) area=(0x[0-9a-f]+) size=(\d+)', output)
                if m:
                    maps = pathlib.Path('/proc/' + m[1] + '/maps').read_text()
                    addr = int(m[2],16)
                    line = next((l for l in maps.splitlines() if int(l.split('-')[0],16) <= addr < int(l.split()[0].split('-')[1],16)), '')
                    state = line.split()[1] if line else 'missing'
                    if not stages or stages[-1]['state'] != state:
                        stages.append({'state':state,'line':line}); write('maps-' + state + '.txt', maps)
                    if state == 'r-xp': break
                time.sleep(.1)
            assert [s['state'] for s in stages] == ['rw-p','r-xp'], stages
        finally:
            p.wait(timeout=15)
        assert p.returncode == 0
    trace = pathlib.Path('memory.strace').read_text()
    assert re.search(r'mprotect\(' + m[2] + r', ' + m[3] + r', PROT_READ\|PROT_EXEC\)\s+= 0', trace)
    cc('memory-negative', '#include <sys/mman.h>\n#include <errno.h>\n#include <unistd.h>\nint main(void){long n=sysconf(_SC_PAGESIZE); char*p=mmap(0,n,3,MAP_PRIVATE|MAP_ANONYMOUS,-1,0); if(p==MAP_FAILED)return 2; int r=mprotect(p+1,n,5); int e=errno; munmap(p,n); return !(r==-1 && e==EINVAL);}\n')
    run('memory-unaligned-EINVAL', ['./memory-negative'])
    return {'mapping_stages': stages, 'negative': 'unaligned mprotect -> EINVAL', 'execution': 'published source never calls mapping'}
check('memory-permissions', memory)

def interposition():
    page='laboratuvarlar/sembol-secimi'
    for name,i in [('liba',0),('libb',1)]:
        write(name+'.c',source(page,index=i)); run('build-'+name,['gcc','-Wall','-Wextra','-fPIC','-shared',name+'.c','-o',name+'.so'])
    cc('ana', source(page,index=2), '-L.', '-la', '-Wl,-rpath,.')
    assert '11' in run('selection-normal',['./ana']).stdout
    assert '22' in run('selection-preload',['./ana'],env={'LD_PRELOAD':'./libb.so'}).stdout
    p=run('selection-LD_DEBUG',['./ana'],env={'LD_PRELOAD':'./libb.so','LD_DEBUG':'symbols,bindings'})
    lines=[l for l in p.stderr.splitlines() if 'symbol=secim' in l or ('binding file' in l and 'secim' in l)]
    write('secim.ld-debug', '\n'.join(lines))
    assert any('symbol=secim' in l for l in lines)
    assert any('binding file ./ana' in l and 'libb.so' in l for l in lines)
    run('build-liba-Bsymbolic',['gcc','-fPIC','-shared','liba.c','-Wl,-Bsymbolic','-o','liba.so'])
    assert '22' in run('selection-external-Bsymbolic',['./ana'],env={'LD_PRELOAD':'./libb.so'}).stdout
    # An explicit extra fixture tests internal references; published sources stay unchanged.
    write('internal.c',source(page,index=0)+'int ic_secim(void){return secim();}\n')
    write('internal-main.c','#include <stdio.h>\nint ic_secim(void); int main(void){printf("%d\\n",ic_secim());}\n')
    for mode,flags,expected in [('default',[],22),('symbolic',['-Wl,-Bsymbolic'],11)]:
        run('build-internal-'+mode,['gcc','-fPIC','-shared','internal.c',*flags,'-o','liba.so'])
        run('link-internal-'+mode,['gcc','internal-main.c','-L.','-la','-Wl,-rpath,.','-o','internal-main'])
        assert run('internal-'+mode,['./internal-main'],env={'LD_PRELOAD':'./libb.so'}).stdout.strip()==str(expected)
    return {'normal':11,'preload':22,'external_Bsymbolic':22,'internal_default':22,'internal_Bsymbolic':11,'LD_DEBUG':'lookup and binding both captured'}
check('interposition-LD_DEBUG-Bsymbolic', interposition)

def debug():
    cc('hesap', source('laboratuvarlar/debug-bilgisi'))
    assert run('debug-run',['./hesap']).stdout.strip()=='Total: 30'
    run('keep-debug',['objcopy','--only-keep-debug','hesap','hesap.debug'])
    shutil.copy('hesap.debug','hesap.debug.good')
    run('strip',['strip','--strip-debug','--strip-unneeded','hesap'])
    run('add-debuglink',['objcopy','--add-gnu-debuglink=hesap.debug','hesap'])
    run('debuglink-hex',['readelf','-x','.gnu_debuglink','hesap'])
    def gdb(name,binary='hesap',debugdir='/nonexistent'):
        return run(name,['gdb','-nx','-q','-batch','-ex','set debuginfod enabled off','-ex','set debug-file-directory '+debugdir,'-ex','file '+binary,'-ex','info line topla'],expected=None)
    assert 'Line ' in gdb('debuglink-GDB').stdout
    with open('hesap.debug','ab') as f: f.write(b'crc-negative')
    bad=gdb('debuglink-CRC-negative')
    assert 'CRC mismatch' in bad.stderr and 'Line ' not in bad.stdout, (bad.stdout,bad.stderr)
    shutil.copy('hesap.debug.good','hesap.debug')
    run('remove-debuglink',['objcopy','--remove-section=.gnu_debuglink','hesap','hesap-buildid'])
    buildid=re.search(r'Build ID: ([a-f0-9]+)',run('buildid',['readelf','-n','hesap-buildid']).stdout)[1]
    dest=OUT/'debug-root/.build-id'/buildid[:2]/(buildid[2:]+'.debug');dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy('hesap.debug.good',dest)
    assert 'Line ' in gdb('buildid-GDB','hesap-buildid',str(OUT/'debug-root')).stdout
    cc('other','int main(void){return 0;}\n')
    shutil.copy('other',dest)
    bad=gdb('buildid-mismatch-negative','hesap-buildid',str(OUT/'debug-root'))
    assert 'Line ' not in bad.stdout
    return {'debuglink':'source line found; CRC mismatch rejected', 'build_id':buildid, 'build_id_path':str(dest.relative_to(OUT)), 'negative':'different embedded Build-ID rejected'}
check('debuglink-Build-ID',debug)

def linker():
    cc('bounds',source('rehberler/linker-duzeni'))
    run('linker-bounds',['./bounds'])
    write('main.c','int helper(void); int main(void){return helper()!=42;}\n')
    write('helper.c','int helper(void){return 42;} int unused(void){return 99;}\n')
    for gc in [True,False]:
        tag='gc' if gc else 'no-gc'
        flags='--gc-sections,' if gc else ''
        run('linker-'+tag,['gcc','-O2','-ffunction-sections','-fdata-sections','-Wl,'+flags+'-Map,'+tag+'.map','main.c','helper.c','-o','program-'+tag])
        run('linker-run-'+tag,['./program-'+tag])
        symbols=run('nm-'+tag,['nm','program-'+tag]).stdout
        assert (' unused' in symbols) != gc
    run('linker-layout',['readelf','-lW','program-gc'])
    assert '.text.unused' in pathlib.Path('gc.map').read_text().split('Memory Configuration')[0]
    return {'gc':'unused in discarded input sections, absent from nm', 'negative':'without GC unused remains in nm', 'bounds':'published etext/edata/end C ran'}
check('linker-map',linker)

def tracer():
    cc('tracer',source('rehberler/analiz-aracinin-etkisi'))
    assert run('tracer-untraced',['./tracer']).stdout.strip()=='TracerPid: 0'
    traced=run('tracer-GDB',['gdb','-nx','-q','-batch','-ex','run','./tracer'])
    assert re.search(r'TracerPid: [1-9]\d*',traced.stdout) and 'code 01' in traced.stdout
    cc('traceme',r'''#include <stdio.h>
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
int tracer(void){FILE*f=fopen("/proc/self/status","r");char b[256];int t=-1;if(!f)return -1;while(fgets(b,sizeof b,f))if(sscanf(b,"TracerPid: %d",&t)==1)break;fclose(f);return t;}
int main(void){pid_t c=fork();if(c<0)return 2;if(!c){int before=tracer();long r=ptrace(PTRACE_TRACEME,0,0,0);int after=tracer();errno=0;long twice=ptrace(PTRACE_TRACEME,0,0,0);int e=errno;printf("before=%d result=%ld after=%d parent=%d repeat=%ld errno=%d\n",before,r,after,getppid(),twice,e);fflush(stdout);if(before||r||after!=getppid()||twice!=-1||e!=EPERM)_exit(3);raise(SIGSTOP);_exit(0);}int s;if(waitpid(c,&s,0)<0||!WIFSTOPPED(s))return 4;if(ptrace(PTRACE_CONT,c,0,0))return 5;if(waitpid(c,&s,0)<0)return 6;return !WIFEXITED(s)||WEXITSTATUS(s);}
''')
    p=run('traceme-parent-relationship',['./traceme'])
    return {'published_reader':'0 untraced; nonzero and exit 1 under GDB','TRACEME':p.stdout.strip(),'negative':'second TRACEME -> EPERM; not an independent debugger diagnosis'}
check('TRACEME-TracerPid',tracer)

def memfd():
    fragment=source('rehberler/ozel-yukleyiciler')
    wrapper=r'''
#include <sys/stat.h>
#include <string.h>
extern char **environ;
int main(int argc,char**argv){if(argc!=2)return 2;FILE*f=fopen(argv[1],"rb");if(!f)return 2;fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);unsigned char*b=malloc(n?n:1);if(!b)return 2;if(fread(b,1,n,f)!=(size_t)n)return 2;fclose(f);printf("before pid=%ld\n",(long)getpid());fflush(stdout);char*av[]={"payload","argument-ok",NULL};return run_from_memory(b,n,av,environ)==-1?3:4;}
'''
    cc('memfd-run',fragment+wrapper)
    cc('payload',r'''#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
int main(int argc,char**argv){char p[64],buf[256];int count=0;for(int i=3;i<64;i++){snprintf(p,sizeof p,"/proc/self/fd/%d",i);ssize_t n=readlink(p,buf,sizeof buf-1);if(n>0){buf[n]=0;if(strstr(buf,"memory_module"))count++;}}printf("after pid=%ld argc=%d arg=%s env=%s open_memfd=%d\n",(long)getpid(),argc,argc>1?argv[1]:"",getenv("EXE_TEST"),count);return !(argc==2&&!strcmp(argv[1],"argument-ok")&&getenv("EXE_TEST")&&!strcmp(getenv("EXE_TEST"),"env-ok")&&count==0);}
''')
    env={'EXE_TEST':'env-ok'}
    p=run('memfd-ELF',['strace','-f','-o','memfd.strace','-e','trace=memfd_create,write,execve,execveat,close','./memfd-run','payload'],env=env)
    before=re.search(r'before pid=(\d+)',p.stdout)[1];after=re.search(r'after pid=(\d+)',p.stdout)[1];assert before==after
    trace=pathlib.Path('memfd.strace').read_text();assert 'execveat(' in trace and 'AT_EMPTY_PATH) = 0' in trace
    write('script.sh','#!/bin/sh\necho SHOULD-NOT-RUN\n')
    p=run('memfd-script-CLOEXEC-negative',['./memfd-run','script.sh'],expected=3)
    assert 'No such file or directory' in p.stderr
    write('empty','')
    p=run('memfd-empty-negative',['./memfd-run','empty'],expected=3);assert 'Exec format error' in p.stderr
    # Fault injection changes write only, not the published function.
    write('write-injection.c',r'''#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <stdlib.h>
#include <unistd.h>
ssize_t write(int fd,const void*b,size_t n){static int calls;ssize_t(*real)(int,const void*,size_t)=dlsym(RTLD_NEXT,"write");if(calls++==0){errno=EINTR;return -1;}if(calls==2){if(getenv("ZERO_WRITE"))return 0;return real(fd,b,n>7?7:n);}return real(fd,b,n);}
''')
    run('build-write-injection',['gcc','-Wall','-Wextra','-Werror','-fPIC','-shared','write-injection.c','-o','write-injection.so','-ldl'])
    run('memfd-EINTR-shortwrite',['./memfd-run','payload'],env={**env,'LD_PRELOAD':str(OUT/'write-injection.so')})
    p=run('memfd-zero-write-negative',['./memfd-run','payload'],expected=3,env={**env,'LD_PRELOAD':str(OUT/'write-injection.so'),'ZERO_WRITE':'1'});assert 'Input/output error' in p.stderr
    return {'glibc_path':'strace confirms execveat(fd, "", ..., AT_EMPTY_PATH)', 'pid_preserved':before==after, 'payload':'argv/env verified, CLOEXEC memfd not in fd list', 'negative':['script CLOEXEC -> ENOENT','empty image -> ENOEXEC','zero write -> EIO'], 'short_write':'EINTR then 7 bytes then remainder succeeds'}
check('memfd-fexecve-execveat',memfd)

def core():
    cc('core-fixture',r'''#define _GNU_SOURCE
#include <sys/mman.h>
#include <unistd.h>
#include <string.h>
#include <stdlib.h>
char *included,*excluded;
__attribute__((noinline)) void ready(void){abort();}
int main(void){long n=sysconf(_SC_PAGESIZE);included=mmap(0,n,3,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);excluded=mmap(0,n,3,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);if(included==MAP_FAILED||excluded==MAP_FAILED)return 2;strcpy(included,"EXE_CORE_INCLUDE_20261107");strcpy(excluded,"EXE_CORE_EXCLUDE_20261107");if(madvise(excluded,n,MADV_DONTDUMP))return 3;ready();}
''')
    run('gcore-snapshot',['gdb','-nx','-q','-batch','-ex','set use-coredump-filter on','-ex','set dump-excluded-mappings off','-ex','break ready','-ex','run','-ex','generate-core-file snapshot.core','-ex','continue','./core-fixture'])
    p=run('core-header',['readelf','-h','snapshot.core']);assert 'CORE (Core file)' in p.stdout
    run('core-notes',['readelf','-n','snapshot.core'])
    p=run('core-postmortem',['gdb','-nx','-q','-batch','./core-fixture','snapshot.core','-ex','bt full','-ex','info registers','-ex','info proc mappings','-ex','x/s included','-ex','x/s excluded'])
    assert 'EXE_CORE_INCLUDE_20261107' in p.stdout
    assert 'EXE_CORE_EXCLUDE_20261107' not in p.stdout and 'Cannot access memory' in p.stdout + p.stderr
    # Kernel-generated crash dump, without altering global core_pattern.
    kernel_start = time.time_ns()
    p=run('core-kernel',['sh','-c','ulimit -c unlimited; ./core-fixture'],expected=None)
    candidates=[p for p in OUT.glob('core*') if p.is_file() and re.fullmatch(r'core(?:\.\d+)?',p.name) and p.stat().st_mtime_ns >= kernel_start and p.read_bytes()[:4]==b'\x7fELF']
    kernel=[]
    for f in candidates:
        if f.stat().st_size>10000:
            run('kernel-core-header-'+f.name,['readelf','-h',f.name]);kernel.append(f.name)
    assert kernel, 'core_pattern did not create a local kernel core; see log'
    return {'gdb_snapshot':'ET_CORE; bt/registers/mappings read', 'coverage':'included anonymous marker readable; MADV_DONTDUMP marker inaccessible', 'kernel_core':kernel, 'architecture_note':'aarch64 registers are used, no x86 RIP assertion'}
check('core-and-snapshot',core)

# Read-only feature checks: no sysctl, mounts, capabilities or security policy changed.
for name,cmd in [
 ('kernel-features',['sh','-c','uname -a; cat /proc/cpuinfo; cat /proc/self/status; cat /proc/sys/kernel/perf_event_paranoid; ls -ld /sys/kernel/tracing /sys/kernel/debug /sys/kernel/btf/vmlinux; ls /sys/bus/event_source/devices; cat /proc/sys/kernel/core_pattern']),
 ('bpftrace-info',['bpftrace','--info']),
 ('bpftrace-fields',['bpftrace','-lv','tracepoint:syscalls:sys_enter_mprotect']),
 ('bpftrace-entry-exit',['bpftrace','-e','tracepoint:syscalls:sys_enter_mprotect { @a[tid] = args.start; } tracepoint:syscalls:sys_exit_mprotect /@a[tid]/ { printf("tid=%d addr=%lx ret=%ld\\n", tid, @a[tid], args.ret); delete(@a[tid]); }','-c','./izin']),
 ('bpftrace-uprobe',['bpftrace','-e','uprobe:./hesap:topla { @calls = count(); }','-c','./hesap']),
 ('perf-version',['perf','version','--build-options']),
 ('perf-PT',['perf','record','-e','intel_pt//u','--','./hesap']),
 ('perf-software',['perf','stat','-e','task-clock','--','./hesap']),
 ('criu-version',['criu','--version']),
 ('criu-check',['criu','check'])]:
    try:run(name,cmd,expected=None,timeout=15)
    except Exception as e:write(name+'.log',str(e))
report['limitations']={'bpftrace':'inspect raw feature/entry-exit/uprobe logs; no successful capture means overhead and loss unmeasured', 'Intel_PT':'requires Intel PT PMU and XED decoder; ARM virtual machine cannot validate PT or AUX loss', 'OEP':'separate version-pinned packed fixture experiment required; unpacked program entry alone is not packer OEP evidence', 'ECFS_ecfs_exec':'no selected built revision or restore performed; separate x86-64/live-procfs prototype prerequisites', 'CRIU':'version and feature probe only; no successful check is a restore experiment'}
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report['checks'],indent=2))
raise SystemExit(any(v['status']=='failed' for v in report['checks'].values()))
