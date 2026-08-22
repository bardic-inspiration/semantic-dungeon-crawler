// packages/rule-engine/src/parser.ts
//
// SPEC §4.2 — the DSL grammar (v0 + `MATCHES`). A lexer + recursive-descent
// parser that turns a `predicate` / `scope` string into an AST.
//
// Parsing is *well-formedness* only (INV-4): it never evaluates, never binds a
// property to run state, and never polices coherence. A parseable-but-
// contradictory predicate (`x > 5 AND x < 5`) is legal and MUST parse. A
// ParseError is a *syntax* error, categorically distinct from an INV-4
// coherence judgement the engine is forbidden to make.
//
// `parse()` is a pure function of its input string — no graph, state, or
// registry access (§4.2 acceptance criteria).

// ── AST ──────────────────────────────────────────────────────────────────────

/** §4.2 `property := "static." IDENT | "dynamic." IDENT`. */
export type Namespace = "static" | "dynamic";

/**
 * A `static.*` / `dynamic.*` property reference. `path` is the dotted tail after
 * the namespace, so `dynamic.vars.KEY` (the §0.9.0 A8 scratch store) parses to
 * `path: ["vars", "KEY"]`. Any author key is accepted — validating that a
 * property name is one of the reserved set is the evaluator's job, not the
 * parser's.
 */
export interface PropertyOperand {
  type: "property";
  namespace: Namespace;
  path: string[];
}

/**
 * A `literal` operand. §4.2 example predicates use string and number literals;
 * `true`/`false` boolean literals are admitted too, since the comparison-only
 * grammar has no bare boolean operand — a boolean-returning function like
 * `contains`/`matches` is compared as `... == true`.
 */
export interface LiteralOperand {
  type: "literal";
  literalType: "string" | "number" | "boolean";
  value: string | number | boolean;
}

/** §4.2 reserved functions — an unknown name is a parse error. */
export type FunctionName = "contains" | "distance" | "recent" | "matches";

/** §4.2 `function_call := IDENT "(" (operand ("," operand)*)? ")"`. */
export interface FunctionCallOperand {
  type: "function_call";
  name: FunctionName;
  args: Operand[];
}

/** §4.2 `operand := property | literal | function_call`. */
export type Operand = PropertyOperand | LiteralOperand | FunctionCallOperand;

/** §4.2 comparison operators (`MATCHES` is the sole grammar extension since v0.1.0). */
export type ComparisonOperator =
  | ">"
  | "<"
  | ">="
  | "<="
  | "=="
  | "!="
  | "IN"
  | "NOT IN"
  | "CONTAINS"
  | "MATCHES";

/**
 * §4.2 `comparison := operand OPERATOR operand`.
 *
 * When `operator` is `MATCHES`, the right-hand string literal is additionally
 * parsed into a structured `pattern` (below) — glob *evaluation* is the
 * evaluator's issue; the parser only structures the segments.
 */
export interface Comparison {
  type: "comparison";
  operator: ComparisonOperator;
  left: Operand;
  right: Operand;
  pattern?: MatchPattern;
}

/** §4.2 `("AND" | "OR")`. */
export type LogicalOperator = "AND" | "OR";

/**
 * §4.2 `expression := comparison (("AND" | "OR") comparison)*`.
 *
 * Represented faithfully as a flat sequence: the grammar defines no precedence
 * between `AND` and `OR` and no grouping parentheses, so `terms` holds the
 * comparisons and `operators` the `terms.length - 1` joiners between them.
 */
export interface Expression {
  type: "expression";
  terms: Comparison[];
  operators: LogicalOperator[];
}

// ── MATCHES pattern AST (§4.2 pattern grammar) ────────────────────────────────

/** §4.2 `mod_pattern := IDENT | "*"`. */
export type ModPattern =
  { kind: "ident"; value: string } | { kind: "wildcard" };

/** §4.2 `seg_or_wild := IDENT | "*" | "**"` (`*` one segment, `**` zero or more). */
export type SegPattern =
  | { kind: "segment"; value: string }
  | { kind: "wildcard" }
  | { kind: "wildcard_multi" };

/** §4.2 `val_pattern := VALUE | "*"`. */
export type ValPattern =
  { kind: "value"; value: string } | { kind: "wildcard" };

/**
 * §4.2 `pattern := [ mod_pattern "," ] seg_pattern [ "=" val_pattern ]`, the
 * structured RHS of a `MATCHES` comparison. Mirrors the §3.6 tag parse output,
 * but asymmetric — wildcards live on the pattern side only.
 */
export interface MatchPattern {
  type: "match_pattern";
  modifier: ModPattern | null;
  segments: SegPattern[];
  value: ValPattern | null;
  raw: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

/**
 * A DSL well-formedness error. `pos` is the 0-based offset into the input where
 * the problem was detected. This is a *syntax* error and never an INV-4
 * coherence judgement.
 */
export class ParseError extends Error {
  readonly pos: number;
  constructor(message: string, pos: number) {
    super(pos >= 0 ? `${message} (at position ${pos})` : message);
    this.name = "ParseError";
    this.pos = pos;
  }
}

// ── Lexer ─────────────────────────────────────────────────────────────────────

type TokenType =
  | "PROPERTY"
  | "STRING"
  | "NUMBER"
  | "BOOLEAN"
  | "IDENT"
  | "LOGICAL"
  | "OPERATOR"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

// §4.2 `property := ("static" | "dynamic") "." IDENT`; the dotted tail admits the
// `dynamic.vars.KEY` form and author-chosen keys (uppercase included).
const PROPERTY_RE = /^(static|dynamic)(?:\.[A-Za-z0-9_]+)+$/;
// A bare function-name / IDENT token (no namespace dot).
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;
// §3.6 segment/modifier charset, reused for `MATCHES` pattern IDENTs.
const SEGMENT_RE = /^[a-z0-9][a-z0-9_-]*$/;

const RESERVED_FUNCTIONS: Record<FunctionName, number> = {
  contains: 2,
  distance: 2,
  recent: 2,
  matches: 2,
};

const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";
const isWordChar = (ch: string): boolean => /[A-Za-z0-9_.]/.test(ch);
const isSpace = (ch: string): boolean =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    const c = input.charAt(i);

    if (isSpace(c)) {
      i++;
      continue;
    }

    const start = i;

    // String literal — everything between the quotes (no escapes in v0).
    if (c === '"') {
      i++;
      let s = "";
      while (i < n && input.charAt(i) !== '"') {
        s += input.charAt(i);
        i++;
      }
      if (i >= n) throw new ParseError("unterminated string literal", start);
      i++; // closing quote
      tokens.push({ type: "STRING", value: s, pos: start });
      continue;
    }

    if (c === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: start });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: start });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "COMMA", value: ",", pos: start });
      i++;
      continue;
    }

    // Comparison operators (two-char forms first).
    const two = input.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "==" || two === "!=") {
      tokens.push({ type: "OPERATOR", value: two, pos: start });
      i += 2;
      continue;
    }
    if (c === ">" || c === "<") {
      tokens.push({ type: "OPERATOR", value: c, pos: start });
      i++;
      continue;
    }

    // Number literal: a digit, or `-`/`.` immediately followed by a digit. There
    // is no subtraction operator in the grammar, so a leading `-` is a sign.
    if (
      isDigit(c) ||
      ((c === "-" || c === ".") && isDigit(input.charAt(i + 1)))
    ) {
      let num = "";
      if (c === "-") {
        num += "-";
        i++;
      }
      while (i < n && (isDigit(input.charAt(i)) || input.charAt(i) === ".")) {
        num += input.charAt(i);
        i++;
      }
      if (!NUMBER_RE.test(num))
        throw new ParseError(`malformed number '${num}'`, start);
      tokens.push({ type: "NUMBER", value: num, pos: start });
      continue;
    }

    // Word: keyword, property, or bare identifier (function name).
    if (isWordChar(c)) {
      let word = "";
      while (i < n && isWordChar(input.charAt(i))) {
        word += input.charAt(i);
        i++;
      }

      if (word === "AND" || word === "OR") {
        tokens.push({ type: "LOGICAL", value: word, pos: start });
      } else if (word === "IN") {
        tokens.push({ type: "OPERATOR", value: "IN", pos: start });
      } else if (word === "NOT") {
        // `NOT IN` is a single operator; the `IN` must follow.
        while (i < n && isSpace(input.charAt(i))) i++;
        let next = "";
        while (i < n && isWordChar(input.charAt(i))) {
          next += input.charAt(i);
          i++;
        }
        if (next !== "IN") {
          throw new ParseError("expected 'IN' after 'NOT'", start);
        }
        tokens.push({ type: "OPERATOR", value: "NOT IN", pos: start });
      } else if (word === "CONTAINS" || word === "MATCHES") {
        tokens.push({ type: "OPERATOR", value: word, pos: start });
      } else if (word === "true" || word === "false") {
        tokens.push({ type: "BOOLEAN", value: word, pos: start });
      } else if (word === "static" || word === "dynamic") {
        throw new ParseError(
          `property '${word}' is missing a path (expected '${word}.<ident>')`,
          start,
        );
      } else if (PROPERTY_RE.test(word)) {
        tokens.push({ type: "PROPERTY", value: word, pos: start });
      } else if (word.includes(".")) {
        const ns = word.slice(0, word.indexOf("."));
        if (ns === "static" || ns === "dynamic") {
          throw new ParseError(`malformed property '${word}'`, start);
        }
        throw new ParseError(`unknown property namespace '${ns}'`, start);
      } else if (IDENT_RE.test(word)) {
        tokens.push({ type: "IDENT", value: word, pos: start });
      } else {
        throw new ParseError(`unexpected token '${word}'`, start);
      }
      continue;
    }

    throw new ParseError(`unexpected character '${c}'`, start);
  }

  tokens.push({ type: "EOF", value: "", pos: n });
  return tokens;
}

// ── MATCHES pattern parser (§4.2 pattern grammar) ─────────────────────────────

/**
 * Parse a §4.2 `MATCHES` pattern string into a structured {@link MatchPattern}.
 * Used both by the parser (structuring a `MATCHES` RHS at parse time) and by the
 * evaluator (structuring the string argument of the `matches(array, pattern)`
 * reserved function at evaluation time). Throws {@link ParseError} on a malformed
 * pattern.
 */
export function parseMatchPattern(raw: string, pos: number): MatchPattern {
  if (raw.includes("\0")) {
    throw new ParseError(`MATCHES pattern '${raw}': contains NUL`, pos);
  }

  // `[ "=" val_pattern ]` — the value is everything after the first `=`.
  let head = raw;
  let value: ValPattern | null = null;
  const eq = raw.indexOf("=");
  if (eq !== -1) {
    head = raw.slice(0, eq);
    const valStr = raw.slice(eq + 1);
    if (valStr.length === 0) {
      throw new ParseError(`MATCHES pattern '${raw}': empty value`, pos);
    }
    value =
      valStr === "*" ? { kind: "wildcard" } : { kind: "value", value: valStr };
  }

  // `[ mod_pattern "," ]` — a segment never contains ",", so the first comma in
  // `head` (if any) delimits the modifier.
  let modifier: ModPattern | null = null;
  let pathPart = head;
  const comma = head.indexOf(",");
  if (comma !== -1) {
    const mod = head.slice(0, comma);
    pathPart = head.slice(comma + 1);
    if (mod === "*") {
      modifier = { kind: "wildcard" };
    } else if (SEGMENT_RE.test(mod)) {
      modifier = { kind: "ident", value: mod };
    } else {
      throw new ParseError(
        `MATCHES pattern '${raw}': malformed modifier '${mod}'`,
        pos,
      );
    }
  }

  // `seg_pattern := seg_or_wild { ":" seg_or_wild }`.
  if (pathPart.length === 0) {
    throw new ParseError(`MATCHES pattern '${raw}': empty segment path`, pos);
  }
  const segments: SegPattern[] = pathPart.split(":").map((seg): SegPattern => {
    if (seg === "**") return { kind: "wildcard_multi" };
    if (seg === "*") return { kind: "wildcard" };
    if (SEGMENT_RE.test(seg)) return { kind: "segment", value: seg };
    throw new ParseError(
      `MATCHES pattern '${raw}': malformed segment '${seg}'`,
      pos,
    );
  });

  return { type: "match_pattern", modifier, segments, value, raw };
}

// ── Recursive-descent parser ──────────────────────────────────────────────────

const EOF_TOKEN: Token = { type: "EOF", value: "", pos: -1 };

class Parser {
  private readonly tokens: Token[];
  private idx = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.idx] ?? EOF_TOKEN;
  }

  private advance(): Token {
    const t = this.peek();
    if (t.type !== "EOF") this.idx++;
    return t;
  }

  // expression := comparison (("AND" | "OR") comparison)*
  parseExpression(): Expression {
    const terms: Comparison[] = [this.parseComparison()];
    const operators: LogicalOperator[] = [];
    while (this.peek().type === "LOGICAL") {
      operators.push(this.advance().value as LogicalOperator);
      terms.push(this.parseComparison());
    }
    return { type: "expression", terms, operators };
  }

  // comparison := operand OPERATOR operand
  private parseComparison(): Comparison {
    const left = this.parseOperand();
    const opTok = this.peek();
    if (opTok.type !== "OPERATOR") {
      throw new ParseError(
        `expected a comparison operator, found ${describe(opTok)}`,
        opTok.pos,
      );
    }
    this.advance();
    const operator = opTok.value as ComparisonOperator;
    const right = this.parseOperand();

    if (operator === "MATCHES") {
      // The RHS must be a string literal, parsed into a structured pattern.
      if (
        right.type !== "literal" ||
        right.literalType !== "string" ||
        typeof right.value !== "string"
      ) {
        throw new ParseError(
          "MATCHES requires a string pattern on the right-hand side",
          opTok.pos,
        );
      }
      const pattern = parseMatchPattern(right.value, opTok.pos);
      return { type: "comparison", operator, left, right, pattern };
    }
    return { type: "comparison", operator, left, right };
  }

  /** Public-within-module entry for {@link parseOperand}. */
  parseSingleOperand(): Operand {
    return this.parseOperand();
  }

  // operand := property | literal | function_call
  private parseOperand(): Operand {
    const tok = this.peek();
    switch (tok.type) {
      case "PROPERTY": {
        this.advance();
        const parts = tok.value.split(".");
        const namespace = parts[0] as Namespace;
        return { type: "property", namespace, path: parts.slice(1) };
      }
      case "STRING":
        this.advance();
        return { type: "literal", literalType: "string", value: tok.value };
      case "NUMBER":
        this.advance();
        return {
          type: "literal",
          literalType: "number",
          value: Number(tok.value),
        };
      case "BOOLEAN":
        this.advance();
        return {
          type: "literal",
          literalType: "boolean",
          value: tok.value === "true",
        };
      case "IDENT":
        return this.parseFunctionCall();
      default:
        throw new ParseError(
          `expected an operand, found ${describe(tok)}`,
          tok.pos,
        );
    }
  }

  // function_call := IDENT "(" (operand ("," operand)*)? ")"
  private parseFunctionCall(): FunctionCallOperand {
    const nameTok = this.advance();
    const name = nameTok.value;
    if (!(name in RESERVED_FUNCTIONS)) {
      throw new ParseError(`unknown function '${name}'`, nameTok.pos);
    }
    const fnName = name as FunctionName;

    const open = this.peek();
    if (open.type !== "LPAREN") {
      throw new ParseError(
        `expected '(' after function '${name}', found ${describe(open)}`,
        open.pos,
      );
    }
    this.advance();

    const args: Operand[] = [];
    if (this.peek().type !== "RPAREN") {
      args.push(this.parseOperand());
      while (this.peek().type === "COMMA") {
        this.advance();
        args.push(this.parseOperand());
      }
    }

    const close = this.peek();
    if (close.type !== "RPAREN") {
      throw new ParseError(
        `expected ')' to close function '${name}', found ${describe(close)}`,
        close.pos,
      );
    }
    this.advance();

    const arity = RESERVED_FUNCTIONS[fnName];
    if (args.length !== arity) {
      throw new ParseError(
        `function '${name}' expects ${arity} argument(s), got ${args.length}`,
        nameTok.pos,
      );
    }
    return { type: "function_call", name: fnName, args };
  }

  expectEnd(): void {
    const tok = this.peek();
    if (tok.type !== "EOF") {
      throw new ParseError(
        `unexpected trailing input ${describe(tok)}`,
        tok.pos,
      );
    }
  }
}

function describe(tok: Token): string {
  if (tok.type === "EOF") return "end of input";
  return `'${tok.value}'`;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Parse a §4.2 `predicate` / `scope` string into an {@link Expression} AST.
 * Throws {@link ParseError} on any well-formedness violation (INV-4: this is a
 * syntax judgement, never a coherence one). Pure — no state/graph/registry access.
 */
export function parse(input: string): Expression {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const expression = parser.parseExpression();
  parser.expectEnd();
  return expression;
}

/**
 * Parse a single §4.2 `operand` — the value side of a `write` effect (§3.4 A5:
 * "an **evaluated** §4.2 expression/literal"). A predicate is a boolean; a write
 * value is a *value*, so it parses at the operand production rather than through
 * {@link parse}.
 *
 * Throws {@link ParseError} exactly as {@link parse} does. Callers that must not
 * throw (the commit phase, INV-4) catch it and fall back — see
 * `evaluateValueExpression` in `./evaluate`.
 */
export function parseOperand(input: string): Operand {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const operand = parser.parseSingleOperand();
  parser.expectEnd();
  return operand;
}
