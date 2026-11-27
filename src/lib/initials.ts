export interface InitialSource {
  id: string;
  label: string;
  kind?: 'peserta' | 'box';
}

function cleanWords(label: string): string[] {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function baseInitialOf(item: InitialSource): { base: string; extras: string[] } {
  const words = cleanWords(item.label);
  if (!words.length) {
    return { base: item.kind === 'box' ? 'BX' : 'PS', extras: [] };
  }

  if (item.kind === 'box' && words[0] === 'PEMATERI') {
    const rest = words.slice(1).join('');
    const extras = [...rest, ...words[0].slice(2)];
    return { base: 'PM', extras };
  }

  if (words.length >= 2) {
    const base = `${words[0][0]}${words[1][0]}`;
    const extras = [
      ...words[1].slice(1),
      ...words.slice(2).flatMap((word) => [...word]),
      ...words[0].slice(1),
    ];
    return { base, extras };
  }

  const single = words[0];
  const base = single.slice(0, 2);
  const extras = [...single.slice(2)];
  return { base, extras };
}

export function buildUniqueInitials(items: InitialSource[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  const prepared = items.map((item) => ({
    item,
    ...baseInitialOf(item),
  }));

  const groups = new Map<string, typeof prepared>();
  prepared.forEach((entry) => {
    const list = groups.get(entry.base) || [];
    list.push(entry);
    groups.set(entry.base, list);
  });

  // Pass 1: assign all non-colliding base codes first so collision groups know what is free
  groups.forEach((entries, base) => {
    if (entries.length === 1) {
      let code = base;
      let counter = 2;
      while (used.has(code)) {
        code = `${base}${counter}`;
        counter += 1;
      }
      used.add(code);
      result.set(entries[0].item.id, code);
    }
  });

  // Pass 2: resolve colliding groups using contained distinguishing letters
  groups.forEach((entries, base) => {
    if (entries.length <= 1) return;

    const unresolved = new Set(entries);
    const maxLen = Math.max(0, ...entries.map((entry) => entry.extras.length));

    // Try positional distinguishing letter (e.g. Muhammad Ardiansyah -> MAR, Muhammad Amin -> MAM)
    for (let pos = 0; pos < maxLen && unresolved.size > 0; pos += 1) {
      const freq = new Map<string, number>();
      unresolved.forEach((entry) => {
        const ch = entry.extras[pos];
        if (!ch) return;
        freq.set(ch, (freq.get(ch) || 0) + 1);
      });

      const resolvedHere: typeof entries = [];
      unresolved.forEach((entry) => {
        const ch = entry.extras[pos];
        if (!ch) return;
        const candidate = `${base}${ch}`;
        if (freq.get(ch) === 1 && !used.has(candidate)) {
          used.add(candidate);
          result.set(entry.item.id, candidate);
          resolvedHere.push(entry);
        }
      });
      resolvedHere.forEach((entry) => unresolved.delete(entry));
    }

    // Try any remaining single contained letter for entries left unresolved
    [...unresolved].forEach((entry) => {
      for (const ch of entry.extras) {
        const candidate = `${base}${ch}`;
        if (!used.has(candidate)) {
          used.add(candidate);
          result.set(entry.item.id, candidate);
          unresolved.delete(entry);
          return;
        }
      }
    });

    // Try 2 contained letters (4-char code) if 3-char options were exhausted
    [...unresolved].forEach((entry) => {
      for (let i = 0; i < entry.extras.length; i += 1) {
        for (let j = i + 1; j < entry.extras.length; j += 1) {
          const candidate = `${base}${entry.extras[i]}${entry.extras[j]}`;
          if (!used.has(candidate)) {
            used.add(candidate);
            result.set(entry.item.id, candidate);
            unresolved.delete(entry);
            return;
          }
        }
      }
    });

    // Final fallback for literally identical names
    let counter = 1;
    [...unresolved].forEach((entry) => {
      let candidate = counter === 1 && !used.has(base) ? base : `${base}${counter}`;
      while (used.has(candidate)) {
        counter += 1;
        candidate = `${base}${counter}`;
      }
      used.add(candidate);
      result.set(entry.item.id, candidate);
      counter += 1;
    });
  });

  return result;
}

export function formatNameWithInitial(name: string, initial?: string): string {
  const clean = name.trim();
  if (!initial) return clean;
  return `${clean} (${initial})`;
}
