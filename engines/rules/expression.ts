/**
 * Arithmetic expressions used in pack decision tables and model equations
 * (CDSS spec §A5.4).
 *
 * A small parser, not `eval`: numbers, state keys, `$parameter` references,
 * `+ - * /`, unary minus and brackets. For example
 * `Dr / efficiency * (1 + leaching_fraction)` or `-$trigger_bar`.
 */

export type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'state'; name: string }
  | { kind: 'param'; name: string }
  | { kind: 'neg'; operand: Expr }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr }

export class ExpressionSyntaxError extends Error {}

/** Thrown when a state key or parameter the expression needs has no value. */
export class MissingValueError extends Error {
  constructor(public readonly reference: string) {
    super(`no value for ${reference}`)
  }
}

type Token = { type: 'number'; value: number } | { type: 'name'; value: string } | { type: 'param'; value: string } | { type: 'op'; value: string }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const re = /\s*(?:(\d+(?:\.\d+)?)|\$([A-Za-z_][A-Za-z0-9_]*)|([A-Za-z_][A-Za-z0-9_.]*)|([-+*/()]))/y
  let pos = 0
  while (pos < source.length) {
    if (/^\s*$/.test(source.slice(pos))) break
    re.lastIndex = pos
    const m = re.exec(source)
    if (!m) throw new ExpressionSyntaxError(`unexpected character at position ${pos} in "${source}"`)
    if (m[1] !== undefined) tokens.push({ type: 'number', value: Number(m[1]) })
    else if (m[2] !== undefined) tokens.push({ type: 'param', value: m[2] })
    else if (m[3] !== undefined) tokens.push({ type: 'name', value: m[3] })
    else tokens.push({ type: 'op', value: m[4] })
    pos = re.lastIndex
  }
  return tokens
}

export function parseExpression(source: string): Expr {
  const tokens = tokenize(source)
  let i = 0
  const peekOp = (...ops: string[]) => {
    const t = tokens[i]
    return t !== undefined && t.type === 'op' && ops.includes(t.value) ? t.value : null
  }

  function sum(): Expr {
    let left = product()
    for (let op = peekOp('+', '-'); op; op = peekOp('+', '-')) {
      i++
      left = { kind: 'binary', op: op as '+' | '-', left, right: product() }
    }
    return left
  }
  function product(): Expr {
    let left = unary()
    for (let op = peekOp('*', '/'); op; op = peekOp('*', '/')) {
      i++
      left = { kind: 'binary', op: op as '*' | '/', left, right: unary() }
    }
    return left
  }
  function unary(): Expr {
    if (peekOp('-')) {
      i++
      return { kind: 'neg', operand: unary() }
    }
    if (peekOp('+')) {
      i++
      return unary()
    }
    return atom()
  }
  function atom(): Expr {
    const t = tokens[i++]
    if (t === undefined) throw new ExpressionSyntaxError(`unexpected end of "${source}"`)
    if (t.type === 'number') return { kind: 'number', value: t.value }
    if (t.type === 'param') return { kind: 'param', name: t.value }
    if (t.type === 'name') return { kind: 'state', name: t.value }
    if (t.value === '(') {
      const inner = sum()
      if (!peekOp(')')) throw new ExpressionSyntaxError(`missing ")" in "${source}"`)
      i++
      return inner
    }
    throw new ExpressionSyntaxError(`unexpected "${t.value}" in "${source}"`)
  }

  const expr = sum()
  if (i < tokens.length) throw new ExpressionSyntaxError(`unexpected "${tokens[i].value}" in "${source}"`)
  return expr
}

/** True when the text parses as an expression. */
export function isExpression(source: string): boolean {
  try {
    parseExpression(source)
    return true
  } catch {
    return false
  }
}

export interface ExpressionScope {
  /** Numeric state values. Non-numeric, null and undefined count as missing. */
  state: Record<string, unknown>
  /** Parameter values in force; null means the value has not been sourced. */
  params: Record<string, number | null | undefined>
}

export function evaluateExpression(expr: Expr, scope: ExpressionScope): number {
  switch (expr.kind) {
    case 'number':
      return expr.value
    case 'state': {
      const v = scope.state[expr.name]
      if (typeof v !== 'number' || Number.isNaN(v)) throw new MissingValueError(expr.name)
      return v
    }
    case 'param': {
      const v = scope.params[expr.name]
      if (typeof v !== 'number' || Number.isNaN(v)) throw new MissingValueError(`$${expr.name}`)
      return v
    }
    case 'neg':
      return -evaluateExpression(expr.operand, scope)
    case 'binary': {
      const l = evaluateExpression(expr.left, scope)
      const r = evaluateExpression(expr.right, scope)
      if (expr.op === '+') return l + r
      if (expr.op === '-') return l - r
      if (expr.op === '*') return l * r
      if (r === 0) throw new MissingValueError('a non-zero divisor')
      return l / r
    }
  }
}

/** Names referenced by an expression, each listed once. */
export function references(expr: Expr): { state: string[]; params: string[] } {
  const state = new Set<string>()
  const params = new Set<string>()
  const walk = (e: Expr) => {
    if (e.kind === 'state') state.add(e.name)
    else if (e.kind === 'param') params.add(e.name)
    else if (e.kind === 'neg') walk(e.operand)
    else if (e.kind === 'binary') {
      walk(e.left)
      walk(e.right)
    }
  }
  walk(expr)
  return { state: [...state], params: [...params] }
}
