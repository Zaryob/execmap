---
title: bpftrace from zero: probes, filters, and maps
---

# bpftrace from zero: probes, filters, and maps

**bpftrace** is a small scripting language for asking a running Linux system questions such as "which files does this process open?", "how long does this function take?", or "where is this thread when it goes to sleep?". You write a few lines; bpftrace compiles them to an eBPF program, the kernel verifies and attaches it to the events you named, and bpftrace prints the results.

This guide teaches the language from the first command. It assumes the machine preparation from [performance analysis from zero](performans-analizine-giris.md). The background on tracepoints, kprobes, and uprobes is in [runtime events with eBPF](ebpf-ile-olaylar.md); the practice is in the [first bpftrace lab](../laboratuvarlar/bpftrace-ilk-adimlar.md).

The syntax shown targets **bpftrace 0.21 or newer**. Older releases differ in details noted below. Always check `bpftrace --version` and `man bpftrace` on your machine.

## 1. Your first program

```bash
sudo bpftrace -e 'BEGIN { printf("hello from bpftrace\n"); exit(); }'
```

`-e` passes the program on the command line. `BEGIN` is a special probe that fires once when tracing starts; `exit()` ends the program. Without `exit()`, bpftrace runs until you press Ctrl-C.

Every bpftrace program is a list of **probe blocks**:

```text bpftrace
probe_type:target:event
/filter/
{
    actions;
}
```

- The **probe** says *when* the block runs: on a kernel tracepoint, at a function entry, every 10 ms, and so on.
- The **filter** (also called a predicate) is optional. The actions run only when it is true.
- The **actions** say *what* to do: count, record a time, print.

A second example counts system calls per process name for five seconds:

```bash
sudo bpftrace -e '
tracepoint:raw_syscalls:sys_enter { @calls[comm] = count(); }
interval:s:5 { exit(); }'
```

When the program exits, bpftrace prints every map automatically:

```text
@calls[bash]: 12
@calls[sshd]: 40
@calls[Xorg]: 381
```

That output shape is illustrative; your process names and numbers will differ.

## 2. Probe types you will use first

| Probe | Fires when | Example |
| --- | --- | --- |
| `tracepoint:` | a stable, named kernel event occurs | `tracepoint:syscalls:sys_enter_openat` |
| `kprobe:` / `kretprobe:` | a kernel function is entered / returns | `kprobe:vfs_read` |
| `uprobe:` / `uretprobe:` | a function in a user program or library is entered / returns | `uprobe:/bin/bash:readline` |
| `profile:hz:99` | 99 times per second on every CPU (sampling) | `profile:hz:99 { @[ustack] = count(); }` |
| `interval:s:1` | once per second on one CPU (timer for printing) | `interval:s:1 { print(@x); clear(@x); }` |
| `BEGIN` / `END` | at program start / end | `END { clear(@start); }` |

Prefer **tracepoints** when one exists: their names and fields are a maintained interface. kprobes attach to internal kernel functions that can be renamed, inlined, or removed between kernel versions. uprobes attach to code in a specific file: the probe follows that binary, so rebuilding the program means re-checking the probe.

## 3. Finding probes and their arguments

Never guess probe names or argument fields. List them:

```bash
sudo bpftrace -l 'tracepoint:syscalls:sys_enter_open*'
sudo bpftrace -lv 'tracepoint:syscalls:sys_enter_openat'
sudo bpftrace -l 'uprobe:/usr/bin/bash:*readline*'
```

`-l` lists matching probes; `-v` adds the fields. For `sys_enter_openat` the field list includes `filename`, `flags`, and `mode`. In a program you read them as `args.filename`.

> [!NOTE]
> bpftrace 0.19 changed tracepoint arguments from a pointer to a structure. On 0.19 and newer write `args.filename`; on older releases, such as Debian bookworm's 0.17, write `args->filename`. Some newer releases print a deprecation warning for the arrow form.

For kprobes and uprobes, arguments are available by position as `arg0`, `arg1`, …, following the platform calling convention. On return probes the return value is `retval`. Positional arguments have no types: you must know what the function's parameters mean.

## 4. Built-in variables

| Variable | Meaning |
| --- | --- |
| `pid` | process ID (all threads of one process share it) |
| `tid` | thread ID |
| `comm` | process or thread name, up to 15 characters |
| `uid` | user ID |
| `cpu` | CPU number that ran the probe |
| `nsecs` | a nanosecond timestamp (see the clock note below) |
| `elapsed` | nanoseconds since bpftrace started |
| `probe`, `func` | the full probe name, the function name |
| `kstack`, `ustack` | the kernel and user call stacks at this moment |
| `cpid` | PID of the child started with `-c` |
| `$1`, `$2` | positional parameters passed after the script |

`comm` names can be shared by unrelated processes and can be changed by the program. When precision matters, filter by PID. The [process and thread guide](process-thread-ve-zamanlayici.md) explains the PID/TID distinction.

> [!NOTE]
> In bpftrace 0.21 the plain `nsecs` uses the boot clock, which includes time spent suspended. For intervals inside one run, `nsecs(monotonic)` makes the choice explicit, as the [function probe lab](../laboratuvarlar/fonksiyon-problari.md) does. Older releases may not accept the argument.

## 5. Filters: limiting the noise

A system-wide tracepoint fires for every process. Filter as early as possible:

```bash
# Only one process ID
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat /pid == 1234/ { printf("%s\n", str(args.filename)); }'

# Only processes named "worker"
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat /comm == "worker"/ { printf("%s\n", str(args.filename)); }'

# Only the command bpftrace starts itself
sudo bpftrace -c './worker 50' -e 'tracepoint:syscalls:sys_enter_openat /pid == cpid/ { printf("%s\n", str(args.filename)); }'
```

`-c` is the most reliable choice for experiments: bpftrace attaches its probes, starts the command, and exits when it ends. The command runs with bpftrace's privileges, so under `sudo` it runs as root; use it only with programs you trust. `str()` copies a string from the traced process's memory; `filename` is just a pointer until you do.

## 6. Maps: counting and summarizing inside the kernel

Variables that start with `@` are **maps**: key/value tables that live in the kernel while the program runs. Summarizing in the kernel is what makes bpftrace cheap: instead of printing a million lines, it updates a counter.

```text bpftrace
@total = count();               // one counter
@by_name[comm] = count();       // one counter per process name
@bytes[comm] = sum(args.ret);   // a sum per key
@size = hist(args.ret);         // power-of-two histogram
@lat = lhist($ms, 0, 100, 10);  // linear histogram: 0..100 in steps of 10
@s = stats(args.ret);           // count, average, and total
```

Useful map actions:

- `print(@m)` prints now; `clear(@m)` empties it; `delete(@m[key])` removes one key.
- At exit bpftrace prints every non-empty map; clear helper maps in an `END` block to keep the output clean.
- Variables that start with `$` are **scratch variables**, local to one block execution.

Reading a `hist()` result: each line is a range `[low, high)` and the number of values that fell in it. The bar shows relative size.

```text
@size:
[1K, 2K)               5 |@@@@@@@@@@@@@                          |
[2K, 4K)               0 |                                       |
[4K, 8K)              10 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|
```

This example means five values were between 1024 and 2047, and ten between 4096 and 8191. Histograms lose the exact values but keep the shape, which is usually what you need: is latency one tight cluster, two clusters, or a long tail?

## 7. Measuring how long something takes

Timing needs two probes and per-thread state. Store a timestamp on entry, keyed by thread ID; on return, subtract and delete:

```bash
sudo bpftrace -e '
kprobe:vfs_read { @start[tid] = nsecs; }
kretprobe:vfs_read /@start[tid]/ {
    @read_us = hist((nsecs - @start[tid]) / 1000);
    delete(@start[tid]);
}
END { clear(@start); }'
```

Why each part matters:

- **Keyed by `tid`**: many threads can be inside `vfs_read` at the same time; a single variable would mix their start times.
- **The filter `/@start[tid]/`** ignores returns whose entry happened before tracing began.
- **`delete`** prevents stale entries from pairing with a later, unrelated return.
- **Division happens last** so short intervals are not rounded to zero too early.

The same pattern works for `uprobe` / `uretprobe` on your own functions and for `sys_enter_*` / `sys_exit_*` tracepoints on system calls.

## 8. Stacks: who called this?

`ustack` and `kstack` capture the call stack when the probe fires. Using a stack as a map key counts identical call paths:

```bash
sudo bpftrace -c './worker 50' -e '
tracepoint:syscalls:sys_enter_openat /pid == cpid/ { @[ustack] = count(); }'
```

User stacks are reliable only when the program and its libraries keep frame pointers or other unwind support that bpftrace can use. A stack that stops after one or two frames, or shows raw hexadecimal addresses, is a build or symbol problem, not a short call path. Recompile with `-fno-omit-frame-pointer` and keep the executable file in place while tracing. `ustack(perf)` prints stacks in the format expected by flame graph scripts; `ustack(5)` limits the depth.

## 9. A one-liner cookbook

Each line answers one beginner question. Replace `1234` with a real PID or use `-c`.

```bash
# Which processes make the most system calls?
sudo bpftrace -e 'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }'

# Which system calls does PID 1234 make?
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_* /pid == 1234/ { @[probe] = count(); }'

# Which files are being opened, by whom?
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%-16s %s\n", comm, str(args.filename)); }'

# Which opens fail, and with which error number?
sudo bpftrace -e 'tracepoint:syscalls:sys_exit_openat /args.ret < 0/ { @errors[comm, -args.ret] = count(); }'

# Distribution of successful read sizes for PID 1234
sudo bpftrace -e 'tracepoint:syscalls:sys_exit_read /pid == 1234 && args.ret > 0/ { @bytes = hist(args.ret); }'

# How often is a function in my program called?
sudo bpftrace -e 'uprobe:/path/to/prog:process_item { @calls = count(); }'

# What does it return?
sudo bpftrace -e 'uretprobe:/path/to/prog:process_item { @ret = lhist(retval, 0, 10, 1); }'

# Where does PID 1234 spend CPU time? (sampled user stacks, 99 Hz)
sudo bpftrace -e 'profile:hz:99 /pid == 1234/ { @[ustack] = count(); }'

# Print a per-second rate instead of a total
sudo bpftrace -e 'tracepoint:raw_syscalls:sys_enter /pid == 1234/ { @n = count(); } interval:s:1 { print(@n); clear(@n); }'
```

Negative return values from system call exit tracepoints are negated error numbers: `-2` is `ENOENT` (no such file), `-13` is `EACCES` (permission denied). Look them up with `errno -l` (from the `moreutils` package) or in `/usr/include/asm-generic/errno-base.h`.

The wildcard `sys_enter_*` attaches hundreds of probes; startup is slower and overhead is higher than a single tracepoint. It is a good exploration tool, not a long-running monitor.

## 10. Safety and overhead

- bpftrace programs are checked by the kernel verifier, which rejects unsafe memory access and unbounded loops. That protects the kernel, not your timing results.
- Every probe hit costs time. Probing a function called millions of times per second can slow the program significantly. Start with counts, check the event rate, then add timestamps or stacks.
- `printf` for every event sends data through a buffer; if the consumer falls behind, bpftrace reports `Lost N events`. Aggregate with maps instead of printing when the rate is high.
- uprobes on x86-64 place a breakpoint instruction in the traced code; the program can, in principle, detect this. See [observer effects](analiz-aracinin-etkisi.md).
- Functions such as `system()` that run commands require `--unsafe`. Do not use them in shared environments.
- If tracing has ever frozen a machine, read [tracing failures and lockups](izleme-donmalari.md) before experimenting further.

## 11. Common errors and what they mean

| Message (shape) | Likely cause | What to try |
| --- | --- | --- |
| `ERROR: … permission denied` / `Operation not permitted` | missing root or BPF capabilities, or a locked-down kernel | run with `sudo`; check `bpftrace --info`; containers need extra privileges |
| `ERROR: Could not resolve symbol` | the function name is not in the binary's symbol table (inlined, `static` and stripped, C++ mangled) | `nm -an ./prog \| grep name`; build with `-g` and `noinline`; use the mangled name or `extern "C"` |
| `No probes to attach` / `does not exist` | wrong probe name, or that tracepoint is missing on this kernel | list with `bpftrace -l` |
| `Can not access field` / unknown field | field name differs on this kernel or version | inspect with `bpftrace -lv`; check `args.` versus `args->` |
| `Lost N events` | output buffer overflow | aggregate in maps; reduce `printf` |
| stacks of `0x…` addresses or `[unknown]` | missing symbols, frame pointers, or the binary changed | rebuild with `-g -fno-omit-frame-pointer`; keep the same file in place |

Record the exact message in your notes. An attachment error means the measurement did not happen; do not report a zero.

## Where to go next

Practice every section in the [first bpftrace lab](../laboratuvarlar/bpftrace-ilk-adimlar.md). Then use the [debugging playbook](debug-is-akisi.md) to apply these one-liners to real symptoms, and the [function probe lab](../laboratuvarlar/fonksiyon-problari.md) to validate entry/return pairing with an application-side log.

## Sources

- [bpftrace manual (adoc)](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc)
- [bpftrace one-liner tutorial](https://github.com/bpftrace/bpftrace/blob/master/docs/tutorial_one_liners.md)
- [bpftrace 0.21 documentation](https://bpftrace.org/docs/0.21)
- [bpftrace changelog](https://github.com/bpftrace/bpftrace/blob/master/CHANGELOG.md)
- [Brendan Gregg: BPF Performance Tools (book)](https://www.brendangregg.com/bpf-performance-tools-book.html)
- [Linux kernel: event tracing](https://docs.kernel.org/trace/events.html)
