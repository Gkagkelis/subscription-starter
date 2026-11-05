// ============================================================
// Μικρή γλώσσα εκφράσεων για δομημένα ερωτηματολόγια (ίδια σύνταξη με τις συνθήκες του ASE):
//   Q04 != '1'      Q15 == '1' and Q17 == '1'      contains(Q23, '7')      Q25 in ['1', '2']
// και αριθμητική για παραμέτρους μοντέλου:  min(0.9, delay / buy3)   inv_logit(logit(r) - 0.5 * L_exp)
// Οι λογικές τιμές μετατρέπονται σε 1/0 στην αριθμητική. Μη απαντημένη ερώτηση = null (κάθε σύγκριση με null είναι false,
// εκτός από «!=» που είναι true — ίδια συμπεριφορά με το ASE για ερωτήσεις που παραλείφθηκαν).
// Καθαρός, ντετερμινιστικός κώδικας· καμία χρήση eval.
// ============================================================

export type Value = string | number | boolean | null | string[] | Value[];
export type Env = (name: string) => Value | undefined;

type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'punc' | 'end'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.eE]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j) }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1; while (j < src.length && src[j] !== c) j++;
      if (j >= src.length) throw new Error(`Μη κλειστό αλφαριθμητικό στην έκφραση: ${src}`);
      out.push({ t: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('<>+-*/'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if ('()[],'.includes(c)) { out.push({ t: 'punc', v: c }); i++; continue; }
    throw new Error(`Άγνωστος χαρακτήρας «${c}» στην έκφραση: ${src}`);
  }
  out.push({ t: 'end', v: '' });
  return out;
}

type Node =
  | { k: 'lit'; v: Value }
  | { k: 'id'; name: string }
  | { k: 'list'; items: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

class Parser {
  i = 0;
  constructor(private toks: Tok[], private src: string) {}
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  expect(v: string) { const t = this.next(); if (t.v !== v) throw new Error(`Αναμενόταν «${v}» στην έκφραση: ${this.src}`); }
  isKw(v: string) { const t = this.peek(); return t.t === 'id' && t.v === v; }
  parse(): Node { const n = this.or(); if (this.peek().t !== 'end') throw new Error(`Περίσσιο κείμενο στην έκφραση: ${this.src}`); return n; }
  or(): Node { let a = this.and(); while (this.isKw('or')) { this.next(); a = { k: 'bin', op: 'or', a, b: this.and() }; } return a; }
  and(): Node { let a = this.not(); while (this.isKw('and')) { this.next(); a = { k: 'bin', op: 'and', a, b: this.not() }; } return a; }
  not(): Node { if (this.isKw('not')) { this.next(); return { k: 'un', op: 'not', a: this.not() }; } return this.cmp(); }
  cmp(): Node {
    const a = this.add();
    const t = this.peek();
    if (t.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(t.v)) { this.next(); return { k: 'bin', op: t.v, a, b: this.add() }; }
    if (this.isKw('in')) { this.next(); return { k: 'bin', op: 'in', a, b: this.add() }; }
    if (this.isKw('not') && this.toks[this.i + 1]?.v === 'in') { this.next(); this.next(); return { k: 'un', op: 'not', a: { k: 'bin', op: 'in', a, b: this.add() } }; }
    return a;
  }
  add(): Node { let a = this.mul(); for (;;) { const t = this.peek(); if (t.t === 'op' && (t.v === '+' || t.v === '-')) { this.next(); a = { k: 'bin', op: t.v, a, b: this.mul() }; } else return a; } }
  mul(): Node { let a = this.unary(); for (;;) { const t = this.peek(); if (t.t === 'op' && (t.v === '*' || t.v === '/')) { this.next(); a = { k: 'bin', op: t.v, a, b: this.unary() }; } else return a; } }
  unary(): Node { const t = this.peek(); if (t.t === 'op' && t.v === '-') { this.next(); return { k: 'un', op: 'neg', a: this.unary() }; } return this.atom(); }
  atom(): Node {
    const t = this.next();
    if (t.t === 'num') return { k: 'lit', v: Number(t.v) };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'punc' && t.v === '(') { const n = this.or(); this.expect(')'); return n; }
    if (t.t === 'punc' && t.v === '[') {
      const items: Node[] = [];
      if (this.peek().v !== ']') { items.push(this.or()); while (this.peek().v === ',') { this.next(); items.push(this.or()); } }
      this.expect(']');
      return { k: 'list', items };
    }
    if (t.t === 'id') {
      if (t.v === 'True' || t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'False' || t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'None' || t.v === 'null') return { k: 'lit', v: null };
      if (this.peek().v === '(') {
        this.next();
        const args: Node[] = [];
        if (this.peek().v !== ')') { args.push(this.or()); while (this.peek().v === ',') { this.next(); args.push(this.or()); } }
        this.expect(')');
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'id', name: t.v };
    }
    throw new Error(`Μη αναμενόμενο «${t.v}» στην έκφραση: ${this.src}`);
  }
}

const cache = new Map<string, Node>();
export function compile(src: string): Node {
  let n = cache.get(src);
  if (!n) { n = new Parser(tokenize(src), src).parse(); cache.set(src, n); }
  return n;
}

/** Ονόματα (ταυτοποιητές) που χρησιμοποιεί μια έκφραση — για έλεγχο εξαρτήσεων και κατηγοριοποίηση τεκμηρίωσης. */
export function identifiers(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.k === 'id') out.add(n.name);
    else if (n.k === 'list') n.items.forEach(walk);
    else if (n.k === 'un') walk(n.a);
    else if (n.k === 'bin') { walk(n.a); walk(n.b); }
    else if (n.k === 'call') n.args.forEach(walk);
  };
  walk(compile(src));
  return Array.from(out);
}

const num = (v: Value): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : v === null ? NaN : Number(v));
const truthy = (v: Value): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : !!v);
const clamp01 = (x: number) => Math.min(1 - 1e-9, Math.max(1e-9, x));

function eq(a: Value, b: Value): boolean {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  if (typeof a === 'number' || typeof b === 'number') return num(a) === num(b);
  return String(a) === String(b);
}

function ev(n: Node, env: Env): Value {
  switch (n.k) {
    case 'lit': return n.v;
    case 'id': { const v = env(n.name); if (v === undefined) throw new Error(`Άγνωστο όνομα «${n.name}» σε έκφραση`); return v; }
    case 'list': return n.items.map((x) => ev(x, env));
    case 'un':
      if (n.op === 'not') return !truthy(ev(n.a, env));
      return -num(ev(n.a, env));
    case 'bin': {
      if (n.op === 'and') return truthy(ev(n.a, env)) && truthy(ev(n.b, env));
      if (n.op === 'or') return truthy(ev(n.a, env)) || truthy(ev(n.b, env));
      const a = ev(n.a, env), b = ev(n.b, env);
      switch (n.op) {
        case '==': return eq(a, b);
        case '!=': return !eq(a, b);
        case 'in': return Array.isArray(b) ? (a !== null && b.some((x) => eq(a as Value, x as Value))) : false;
        case '<': return a !== null && b !== null && num(a) < num(b);
        case '>': return a !== null && b !== null && num(a) > num(b);
        case '<=': return a !== null && b !== null && num(a) <= num(b);
        case '>=': return a !== null && b !== null && num(a) >= num(b);
        case '+': return num(a) + num(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': return num(a) / num(b);
      }
      throw new Error(`Άγνωστος τελεστής ${n.op}`);
    }
    case 'call': {
      const args = n.args.map((x) => ev(x, env));
      switch (n.fn) {
        case 'contains': return Array.isArray(args[0]) ? args[0].some((x) => eq(x as Value, args[1])) : args[0] !== null && eq(args[0], args[1]);
        case 'answered': return args[0] !== null && !(Array.isArray(args[0]) && args[0].length === 0);
        case 'min': return Math.min(...args.map(num));
        case 'max': return Math.max(...args.map(num));
        case 'clamp': return Math.min(num(args[2]), Math.max(num(args[1]), num(args[0])));
        case 'logit': { const p = clamp01(num(args[0])); return Math.log(p / (1 - p)); }
        case 'inv_logit': return 1 / (1 + Math.exp(-num(args[0])));
        case 'union': return 1 - args.reduce((s: number, x) => s * (1 - num(x)), 1);
        case 'num': return Number(args[0]);
        case 'abs': return Math.abs(num(args[0]));
      }
      throw new Error(`Άγνωστη συνάρτηση «${n.fn}»`);
    }
  }
}

export function evaluate(src: string, env: Env): Value {
  return ev(compile(src), env);
}
export function evalBool(src: string, env: Env): boolean {
  return truthy(evaluate(src, env));
}
export function evalNum(src: string, env: Env): number {
  return num(evaluate(src, env));
}
