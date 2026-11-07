---
title: Binary diffing and version comparison
---

# Binary diffing and version comparison

Binary diffing identifies structural differences between two builds of a program, such as versions 1.0 and 1.1 or builds before and after a security patch, and investigates candidate semantic changes. Byte or graph matches alone do not prove behavioral equivalence.

One important application is **patch diffing**, also called 1-day analysis. After a vendor releases a security fix, researchers can compare the old and new binaries to investigate the vulnerability's root cause and exploitability. Time and conclusions depend on the sample's complexity and the available evidence.

## 1. Why byte comparison alone is insufficient

A one-line source change or small build-option change can have broad effects on the binary:

```text
One source line changes
       |
       v
A function grows by four bytes
       |
       v
Following function addresses may shift
       |
       v
Relative branches, relocations, and jump tables may change
       |
       v
cmp/diff can report widespread byte changes (comparison noise)
```

Binary comparison therefore needs **control-flow graph (CFG)** and **semantic** analysis in addition to byte differences.

| Level | Tools | Comparison basis | Use and limits |
| :--- | :--- | :--- | :--- |
| **Bytes** | `biodiff`, `vbindiff`, `cmp` | Raw byte sequences and file offsets | Useful for small fixed-location patches |
| **Symbols** | `nm`, `readelf`, `bloaty` | Function and section sizes | Broad structural differences |
| **Graphs / blocks** | `BinDiff`, `Ghidra Version Tracking` | Basic blocks, CFGs, call graphs | Narrows patch candidates; false matches remain possible |
| **Microexecution** | `fnprint` | Input/output behavior and side effects | Investigating obfuscated code |

## 2. How graph matching works

Tools such as `BinDiff` and `Ghidra Version Tracking` use several matching signals:

1. **Names and symbols**: Match names directly when symbols remain available.
2. **Call graph topology**: Compare callers and callees.
3. **Basic block signatures**: Compare block/edge counts, loops, cyclomatic complexity, and instruction categories such as arithmetic, memory access, and control transfer.
4. **Constants and string references**: Compare magic constants and references to strings.

The result may include a similarity score (`0.0–1.0`) and confidence score. Their definitions depend on the tool and correlator. A range such as `0.85–0.98` does not establish the patch location, and compiler differences can change scores. Validate matches against disassembly, data flow, and source diffs where available.

## 3. Patch diffing with Ghidra

Use Ghidra's **Version Tracking** to compare two ELF files:

1. **Analyze**: Import both binaries (`eski_surum` and `yeni_surum`) and complete automatic analysis.
2. **Start a session**: Choose `File -> New Version Tracking Session` and select source and destination programs.
3. **Run correlators**: Ghidra **11.4.2** help lists `Exact Symbol Name Match`, `Exact Function Instructions Match`, and `Duplicate Function Instructions Match`. The last produces 1:N/M:N candidates; it does not simply eliminate identical functions. Instruction correlators may mask operands, so a score of 1.0 is not byte equality. Confirm options in the installed version's help ([official correlator documentation](https://github.com/NationalSecurityAgency/ghidra/blob/Ghidra_11.4.2_build/Ghidra/Features/VersionTracking/src/main/help/help/topics/VersionTrackingPlugin/VT_Correlators.html)).
4. **Compare**: Open candidates in the version's function comparison view. Colors and menu names vary by version/theme; a highlighted block alone does not prove a security patch.

## 4. Separating optimization from logic changes

Compiler transformations can complicate binary comparison:

- **Inlining** embeds a function at its call site, making it appear to have disappeared.
- **Loop unrolling** expands repeated operations and may increase block count.
- **SIMD vectorization** replaces scalar operations with instructions such as AVX2/AVX-512 and can substantially alter block structure.

Examine disassembly and decompiler pseudocode together. Follow data flow and bounds checks. Decompiled output is neither the original source nor proof of correctness.

## Investigate further

Run the [compiler differences laboratory](../laboratuvarlar/derleme-farklari.md) to observe build-option effects. Continue with [custom loaders](ozel-yukleyiciler.md) for code loaded dynamically into memory without a conventional on-disk executable path.

## Sources

- [BioDiff — Hex/Binary Difference Tool (8051Enthusiast)](https://github.com/8051Enthusiast/biodiff)
- [Ghidra — official project](https://github.com/NationalSecurityAgency/ghidra)
- [BinDiff — Zynamics / Google](https://www.zynamics.com/bindiff.html)
- [fnprint — Microexecution Function Identification (1rhino2)](https://github.com/1rhino2/fnprint)
- [Halvar Flake: Structural Comparison of Executable Objects — author's PDF](https://www.zynamics.com/downloads/dimva_paper2.pdf)
