export const functionAbis = {
  sysv: {
    label: 'System V AMD64 (Linux x86-64)',
    registers: ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9'],
    stackPointer: 'rsp',
    firstStackOffset: 8,
    entry: 'At entry, rsp + 8 is 16-byte aligned and [rsp] holds the return address.',
    entryTr: 'İşleve girişte rsp + 8, 16 bayta hizalıdır. Dönüş adresi [rsp] konumundadır.',
  },
  windows: {
    label: 'Microsoft x64 (Windows x86-64)',
    registers: ['rcx', 'rdx', 'r8', 'r9'],
    stackPointer: 'rsp',
    firstStackOffset: 40,
    entry: 'At entry, rsp + 8 is 16-byte aligned and [rsp] holds the return address. The caller reserves 32 bytes of shadow space at [rsp + 8] through [rsp + 39], even when fewer than four arguments are passed.',
    entryTr: 'İşleve girişte rsp + 8, 16 bayta hizalıdır. Dönüş adresi [rsp] konumundadır. Çağıran taraf, dörtten az argüman verilse bile [rsp + 8] ile [rsp + 39] arasında 32 baytlık gölge alan ayırır.',
  },
  aapcs64: {
    label: 'AAPCS64 (Linux AArch64)',
    registers: ['x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'],
    stackPointer: 'sp',
    firstStackOffset: 0,
    entry: 'At entry, sp is 16-byte aligned and a normal bl call puts the return address in x30. The first stack argument starts at [sp].',
    entryTr: 'İşleve girişte sp, 16 bayta hizalıdır. Normal bir bl çağrısı dönüş adresini x30 yazmacına koyar. Yığındaki ilk argüman [sp] konumundan başlar.',
  },
};

export const argumentCounts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function argumentLocations(abi, count) {
  const { registers, stackPointer, firstStackOffset } = abi;
  return Array.from({ length: count }, (_, index) => {
    if (index < registers.length) return registers[index];
    const offset = firstStackOffset + (index - registers.length) * 8;
    return offset ? `[${stackPointer} + ${offset}]` : `[${stackPointer}]`;
  });
}

export const abiArgumentName = (position, tr) => tr ? `Argüman ${position}` : `Argument ${position}`;
export function abiLocationSummary(abi, count, tr) {
  if (!count) return tr ? 'Açık argüman yok.' : 'No explicit arguments.';
  const registers = Math.min(abi.registers.length, count);
  return tr ? `${registers} yazmaçlarda · ${count - registers} yığında`
    : `${registers} in registers · ${count - registers} on the stack`;
}

export function initAbiExplorer(doc = document) {
  const explorer = doc.querySelector('[data-abi-explorer]');
  if (!explorer) return;
  const abi = explorer.querySelector('#function-abi');
  const count = explorer.querySelector('#abi-arity');
  const entry = explorer.querySelector('[data-abi-entry]');
  const result = explorer.querySelector('[data-abi-result]');
  const rows = explorer.querySelector('ul');
  const tr = doc.documentElement.lang === 'tr';
  const render = () => {
    const convention = functionAbis[abi.value];
    const locations = argumentLocations(convention, Number(count.value));
    entry.textContent = tr ? convention.entryTr : convention.entry;
    result.textContent = abiLocationSummary(convention, locations.length, tr);
    rows.replaceChildren(...locations.map((location, index) => {
      const item = doc.createElement('li');
      const code = doc.createElement('code');
      code.textContent = location;
      item.append(abiArgumentName(index + 1, tr) + ' ', code);
      return item;
    }));
  };
  abi.addEventListener('change', render);
  count.addEventListener('change', render);
  render();
}
