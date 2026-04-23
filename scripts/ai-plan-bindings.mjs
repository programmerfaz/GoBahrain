export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Collect hook-local binding names from extracted screen hook source chunks */
export const extractBindingNames = (text) => {
  const names = []
  const add = (arr) => {
    for (const x of arr) if (x && !names.includes(x)) names.push(x)
  }
  for (const m of text.matchAll(/const \{([^}]+)\} = useTheme\(\)/g)) {
    add(m[1].split(',').map((s) => s.trim().split(/\s+/)[0].split(':')[0].trim()))
  }
  for (const m of text.matchAll(/const \{([^}]+)\} = useUserPreferences\(\)/g)) {
    add(
      m[1].split(',').map((s) => {
        const t = s.trim()
        const asIdx = t.indexOf(':')
        if (asIdx >= 0) return t.slice(asIdx + 1).trim().split(/\s+/)[0]
        return t.split(/\s+/)[0]
      }),
    )
  }
  for (const m of text.matchAll(/const \{([^}]+)\} = useAuth\(\)/g)) {
    add(m[1].split(',').map((s) => s.trim().split(/\s+/)[0]))
  }
  for (const m of text.matchAll(/const (\w+) = use(Route|Navigation|SafeAreaInsets)\(\)/g)) {
    add([m[1]])
  }
  const reList = [
    [/^\s*const \[(\w+),\s*(set\w+)\]/gm, (m) => [m[1], m[2]]],
    [/^\s*const (\w+) = useRef/gm, (m) => [m[1]]],
    [/^\s*const (\w+) = useSharedValue/gm, (m) => [m[1]]],
    [/^\s*const (\w+) = useMemo/gm, (m) => [m[1]]],
    [/^\s*const (\w+) = useCallback/gm, (m) => [m[1]]],
    [/^\s*const (planReadOnly|planCollaboratorEdit)\b/gm, (m) => [m[1]]],
    [/^\s*const (STOP_[A-Z0-9_]+)\s*=/gm, (m) => [m[1]]],
  ]
  for (const [re, fn] of reList) {
    let m
    while ((m = re.exec(text))) add(fn(m))
  }
  // Top-level hook body: exactly two spaces indent, simple `const name =` (not arrays)
  for (const m of text.matchAll(/^ {2}const (?!\[)(\w+)\s*=/gm)) {
    add([m[1]])
  }
  return names
}

/** Prefix identifiers that belong to scopeNames with `scope.` (skip already dotted) */
export const prefixScoped = (source, scopeNames, scope) => {
  const sorted = [...new Set(scopeNames)].filter((n) => n && n !== scope).sort((a, b) => b.length - a.length)
  let out = source
  for (const n of sorted) {
    const re = new RegExp(`(?<!\\.)\\b${escapeRe(n)}\\b`, 'g')
    out = out.replace(re, `${scope}.${n}`)
  }
  return out
}
