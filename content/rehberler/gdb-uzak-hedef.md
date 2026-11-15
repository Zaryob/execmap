---
title: Remote GDB, matching artifacts, and IDE setup
---

# Remote GDB, matching artifacts, and IDE setup

A remote debugger has two locations: the Linux target runs the program and `gdbserver`; your workstation runs GDB and reads symbols and source. First make the command-line session work. Then give an IDE the same executable, connection, and path mappings.

Use the generic `timing_lab` from [timing and waiting](../laboratuvarlar/zamanlama-ve-bekleme.md). Its `perform_work` function makes a useful breakpoint. Breakpoint stops change execution timing; use this session to inspect state and call relationships.

## 1. Keep the executable and symbols together

On the target, finish the lab's debug build and record its identity:

```bash
file ./build/timing_lab
sha256sum ./build/timing_lab
readelf -n ./build/timing_lab
```

`file` reports the architecture and executable type. The hash identifies these exact bytes. `readelf -n` displays a Build ID when the linker supplied one. Copy this executable to the workstation as `/local/artifacts/timing_lab`, keeping its debug information. Compare hashes on both machines. A local rebuild from the same source can still differ in addresses, optimization, or linked libraries.

All `/local/...` paths below are placeholders to replace with your own absolute paths. Choose a GDB client supporting the target's Linux architecture; a workstation's native debugger need not support it. Keep the source revision that produced the executable. If debug information is separate, reconnect it using the [debug information lab](../laboratuvarlar/debug-bilgisi.md).

## 2. Start and identify the target process

In a target Bash terminal, start a finite workload and keep its PID:

```bash
./build/timing_lab sleep 600 100 results/remote.csv &
LAB_PID=$!
ps -p "$LAB_PID" -o pid,user,lstart,args
readlink "/proc/$LAB_PID/exe"
printf 'target PID: %s\n' "$LAB_PID"
```

`$!` is the child you just launched. `ps` and `readlink` verify the command and executable before attachment. Note the actual numeric PID for the workstation session. Connect before the roughly one-minute workload exits, or launch a fresh run and use its new PID.

## 3. Connect over SSH standard input/output

Start the workstation's target-capable GDB:

```bash
gdb -q /local/artifacts/timing_lab
```

In GDB, replace `user@target` and `PID` with your SSH destination and the actual numeric target PID:

```text gdb
set pagination off
target remote | ssh -T user@target gdbserver --attach - PID
info files
info threads
break perform_work
continue
bt
info args
info sources
detach
quit
```

SSH starts `gdbserver` remotely. `-T` disables a terminal; gdbserver's `-` communication argument carries the debugger protocol over standard input/output, without opening a target TCP listener. `--attach` stops the existing process. An attachment permission error is a failed setup, not a reason to change the machine's global ptrace policy.

`target remote` connects to that already attached inferior. `continue` resumes it until the breakpoint. `bt` and `info args` inspect the stopped invocation. `detach` releases the program so it can finish; then ordinary `target remote` disconnects. Do not issue a second `attach` or `run` in this workflow. The separate `gdbserver --multi` / `target extended-remote` workflow has different lifecycle rules.

Back in the target's original shell, `wait "$LAB_PID"` collects the child's exit status. This SSH-stdio transport follows the [GDB server documentation](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Server.html).

### Alternative TCP transport for IDE configuration

The IDE examples below use a TCP endpoint. Use this variant only on a target whose existing network isolation or enforced access policy prevents other machines from reaching the debugger port. A `127.0.0.1:PORT` argument to gdbserver is **not a portable loopback-binding guarantee**: the GDB manual states that its hostname part is ignored. SSH port forwarding does not itself restrict the target's listener. Prefer the stdio workflow above when that network boundary is unavailable.

For an identified live `LAB_PID` on that isolated target:

```bash
gdbserver --once --attach :2345 "$LAB_PID"
```

`--once` closes the listening socket after the first connection. In a second target terminal, inspect `ss -ltnp` and retain the listener and enforced network boundary as part of the setup record. The server provides debugger control with no built-in authentication.

In a workstation terminal, forward a local loopback port over SSH:

```bash
ssh -N -L 127.0.0.1:2345:127.0.0.1:2345 user@target
```

`-L` forwards the workstation's local port to the target port; `-N` keeps the tunnel open without starting a shell. Leave this terminal running. A local bind error means the port is occupied; select another local port and use it in the debugger too. In this variant, use `target remote 127.0.0.1:2345` instead of the stdio connection command, or configure the IDE below. After detaching, close the tunnel with Ctrl-C.

## 4. Repair paths according to what they represent

If GDB knows a source filename but cannot open it, inspect `info sources` or `info source`. Map the actual compilation prefix recorded in DWARF to the directory containing the matching local source:

```text gdb
set substitute-path /build/source /local/source
show substitute-path
list perform_work
```

This replaces a source prefix; it does not locate shared libraries. To inspect target libraries using a local copy of the target filesystem, configure the following **before connecting**, replacing the example directories:

```text gdb
set sysroot /local/target-root
set solib-search-path /local/target-root/lib:/local/target-root/usr/lib
```

`sysroot` preserves the target's filesystem layout under a local root. `solib-search-path` supplies additional library search directories; architectures may also need their multiarch library directories. Use libraries and symbols matching the target, rather than the workstation's libc. Check `info sharedlibrary` after connection. File mismatch, missing debug information, and wrong source mapping are separate problems.

## 5. Enter the same facts in CLion

Create a **Remote Debug** configuration. Select a debugger supporting the target, set **'target remote' args** to `127.0.0.1:2345`, and set **Symbol file** to the matching local executable. Configure **Sysroot** when using a copied target filesystem, and **Path mappings** for the DWARF source prefix. Use the isolated TCP setup above and keep its tunnel and attached gdbserver running before starting the IDE debugger.

CLion's Remote Debug configuration does not synchronize artifacts. Repeat the copy and identity check after changing the target build. If a breakpoint is unresolved, compare the executable and source mapping before changing breakpoint behavior. These fields are described in the [CLion Remote Debug documentation](https://www.jetbrains.com/help/clion/remote-debug.html).

## 6. Configure VS Code's C/C++ debugger

With Microsoft's C/C++ extension and the same attached server, a `launch.json` configuration can contain:

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "Linux remote worker",
    "type": "cppdbg",
    "request": "launch",
    "program": "/local/artifacts/timing_lab",
    "cwd": "/local/source",
    "MIMode": "gdb",
    "miDebuggerPath": "/absolute/path/to/target-capable-gdb",
    "miDebuggerServerAddress": "127.0.0.1:2345",
    "launchCompleteCommand": "None",
    "sourceFileMap": { "/build/source": "/local/source" }
  }]
}
```

Replace every example path. Here `request: launch` initializes the remote debugger connection; gdbserver has already attached the target. `launchCompleteCommand: None` avoids the default `exec-run` on that attached process. Resume explicitly after checking the stopped task and breakpoint. `sourceFileMap` maps source paths; it does not repair mismatched symbols. Add GDB sysroot setup commands when required by your library inspection. The field meanings are documented in the [C/C++ launch reference](https://code.visualstudio.com/docs/cpp/launch-json-reference).

## Evidence to retain

Record target and debugger versions, architecture, executable hash/Build ID, source revision, library identities, connection mode, and source-prefix mapping. A successful source breakpoint demonstrates that this setup can inspect this build; it does not validate timing measurements taken while stopped.

## Sources

- [GDB remote connections](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Connecting.html) defines connection and inferior lifecycle rules.
- [GDB source paths](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Source-Path.html) explains prefix substitution.
- [GDB library search](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Files.html) distinguishes executable, symbol, and library locations.
