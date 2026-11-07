# Assembly preparation and GDB laboratories: research and implementation record

Date: November 7, 2026. Scope: Linux x86-64, System V AMD64 ABI, GCC, GNU binutils, and GDB. The purpose is to bridge execmap's ELF/loading coverage and a reader's ability to inspect machine code.

## 1. Research questions and decisions

**What preparation was missing?** The existing stripped ELF guide discusses function entries and unwind ranges; the compiler differences laboratory discusses inlining and frame pointers. Before these topics, readers need to recognize register width, memory operands, pointer targets, and function entry state. One preparation guide and two laboratories were added for this reason.

**What came from the suggested repository?** We reviewed [mytechnotalent/Reverse-Engineering README revision f6893df](https://github.com/mytechnotalent/Reverse-Engineering/blob/f6893dfdaaa563bc7f98bf5093a2e138efbc87e9/README.md), full commit `f6893dfdaaa563bc7f98bf5093a2e138efbc87e9`. Lessons 127–132 in the x64 directory point to data widths, calls, pointers, and addressing; 160–163 point to variables, branches, and pointers in small programs. The small-program-to-debugger study sequence was selected. This assessment concerns the README's directory, not a technical validation of every linked book or lesson.

**Why write Linux examples separately?** execmap focuses on Linux ELF and runtime behavior. Rather than importing every platform and architecture from the course archive, we created two short C programs with defined behavior. Windows conventions and prebuilt debug binaries were not imported. Runtime argument parsing prevents the branch example from collapsing into a single constant result.

**How are source roles separated?** The course directory informs topic selection and further study. Intel provides instruction semantics, psABI the function-entry contract, GDB the debugger command behavior, and GCC the build options. Expected results and checks actually run are recorded separately.

## 2. Primary-source research

- [Intel SDM](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html): volumes 1 and 2 provide the reference structure for registers, addressing, and instructions. Instruction fragments are explicitly schematic, not presented as measured compiler output.
- [System V AMD64 psABI source chapter](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex): LP64 data sizes, simple integer/pointer parameters, stack, and return conventions. The examples do not generalize these signatures to aggregates, variadic calls, or syscalls.
- [GNU objdump](https://sourceware.org/binutils/docs/binutils/objdump.html): `-M intel` and `--disassemble=symbol` bound the comparison. File addresses are not assumed equal to PIE runtime addresses.
- [GDB Machine Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Machine-Code.html), [Registers](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Registers.html), and [Memory](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Memory.html): raw disassembly, register/frame context, and access units. The four-byte integer target is inspected with `x/wd`; an eight-byte stack slot with `x/gx`.
- [GDB Set Breaks](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Breaks.html), [Starting](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Starting.html), and [Continuing and Stepping](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html): distinguish a source breakpoint from the first machine instruction, and choose `stepi`, `nexti`, and `finish`. PIE address breakpoints are created after startup.
- [GDB Assignment](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Assignment.html): use `set variable`. Perform intervention in a separate session, then check the executable's ordinary behavior again.
- [GCC Debugging Options](https://gcc.gnu.org/onlinedocs/gcc/Debugging-Options.html), [Optimize Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html), and [GDB Optimized Code](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Optimized-Code.html): `-g` does not disable optimization; inline/frame options are experimental controls. Neither a mandatory `jcc` for `if` nor a mandatory `cmov` for `-O2` is assumed.
- [GDB Set Watchpoints](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Set-Watchpoints.html): observe pointer-target changes and distinguish hardware/software behavior. Remove the watchpoint before the stack address leaves its useful scope.
- [strtol(3)](https://man7.org/linux/man-pages/man3/strtol.3.html): end-pointer, conversion errors, and `errno`. Restrict the integer domain to `-1000..1000` so signed overflow does not confound comparison.

Sources were checked on November 7, 2026. GNU/GCC and Intel links point to current documentation and do not guarantee identical future tool output. Record actual versions and commands for reproducibility. The upstream course directory is pinned by commit.

## 3. Implementation sequence and acceptance criteria

1. **Assembly guide** — [assembly-okuma.md](../content/rehberler/assembly-okuma.md). Cover register/access width, Intel/AT&T operand order, `lea` versus memory access, stack state, and conditional selection. Acceptance: schematic fragments are labeled and technical topics link to primary sources.
2. **First GDB laboratory** — [gdb-ilk-inceleme.md](../content/laboratuvarlar/gdb-ilk-inceleme.md). Follow argument → read/store → return. Acceptance: normal result 12 and intervention result 16; entry arguments and return address; an instruction-level explanation of the four-byte target change.
3. **Branches/pointers laboratory** — [dallanma-ve-pointer.md](../content/laboratuvarlar/dallanma-ve-pointer.md). Recognize equivalent data flow across two optimization levels. Acceptance: both builds match the expected function on all 2001 integer inputs, reject invalid inputs with exit 2, and demonstrate the 0 → 7 store using a watchpoint. No particular opcode is required.
4. **Navigation and resources** — Update catalog, lab order, home content, reading routes, and links from stripped ELF/compiler differences. There are 15 guides and 6 labs. Optional preparation precedes the three main routes.
5. **Validation** — [verify-assembly-labs.py](../scripts/verify-assembly-labs.py) reads the published C and GDB blocks directly. Compilation commands come from Markdown and source SHA-256 values are recorded. Build/check both URL layouts and inspect new pages at desktop/narrow widths.

This sequence has been implemented. The native Linux execution limitation is recorded separately below.

## 4. Validation record

Local environment: macOS arm64, with `gcc` resolving to Apple Clang. Docker CLI is installed but its daemon is unavailable; local GDB is absent. Linux register, ELF, and watchpoint sessions are not represented as locally executed.

Portable checks succeeded using the published sources and compiler options. The first program returned 12; each branch build passed 2001 valid integers and 9 invalid argument cases. The local `output/assembly-validation/report.json` records host, compiler, source hashes, commands, and `linux_gdb.status=skipped`. Generated binaries and reports are not committed.

Native Linux x86-64 validation requires `python3 scripts/verify-assembly-labs.py --require-linux-gdb`. It checks the entry ABI, return address, instruction-level target change, argument intervention, watchpoint, and optimized function entry/return. Session logs and disassembly are retained. [GitHub Actions](../.github/workflows/site.yml) has a separate Ubuntu job for this mandatory check and uploads its evidence. The remote workflow was not triggered during this work; Linux execution remains an environment-dependent check.

Before the English conversion, `npm run check` passed in both `/execmap` and root layouts, with 14 tests per run, 25 content pages, and 29 HTML files. Internal links, fragments, downloads, and the 24-page reading search index were checked. The default-layout browser suite passed 11 tests with one intentional skip: the desktop project already covers narrow-width geometry, so the mobile project does not duplicate that test.

The new guide was visually inspected at desktop width; all three new pages were checked for navigation and geometry at 390 pixels without document overflow. Screenshots are stored in `output/playwright/`. Playwright CLI used the repository's downloaded Chromium because its default Chrome path was unavailable; application dependencies were unchanged. Expected addresses and opcodes are not published as measured output.

The site was subsequently translated to English, including prose, comments, diagnostic/output labels, and navigation. Source identifiers and public URL paths remain stable. Validation scripts were updated with the translated output labels; their generated reports record the new source hashes.

After translation, both URL layouts passed all 14 content/interaction checks. The browser suite passed 13 tests with one intentional duplicate-geometry skip, including checks that a saved Turkish preference and `?lang=tr` do not change English content or controls. All 29 published HTML pages were checked at 320, 390, and 1440 pixels without document overflow or non-English language attributes. Screenshots are in `output/playwright/english-*.png`. The parser check passed 29 malformed/valid ELF fixtures with ASan/UBSan and four portable example runs; each branch build passed 2001 valid integers and nine invalid argument cases. The LIEF/pyelftools checks also passed. Comparing C tokens after removing comments and string literals found no changes to program logic. Native Linux/GDB execution remains subject to the environment limitation above.

## 5. Attribution and provenance

The upstream root [LICENSE](https://github.com/mytechnotalent/Reverse-Engineering/blob/f6893dfdaaa563bc7f98bf5093a2e138efbc87e9/LICENSE) is Apache-2.0. No upstream prose, code, artwork, PDF, or binary was copied. Links and attribution acknowledge topic selection and study sequence; original execmap text/code follows the existing project license. The root license is not assumed to cover every linked repository or book. Any future direct import requires checking that work's own license and notices.
