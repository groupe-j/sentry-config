import ts from "typescript";

/**
 * Every regex LITERAL in a piece of TS/JS source, as the TypeScript parser
 * sees it: strings, `String.raw` templates and comments are never mistaken for
 * one, and a literal is found wherever an expression may start
 * (`return/…/`, `export default /…/`, `if (s) /…/.test(s)`), which a regex
 * heuristic over the text cannot promise.
 */
export function regexLiterals(code: string): string[] {
  const source = ts.createSourceFile("probe.ts", code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      found.push((node as ts.RegularExpressionLiteral).text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Regex features that must never appear in a LITERAL shipped to a browser:
 * a lookbehind is a parse-time SyntaxError before Safari 16.4 and takes the
 * whole chunk down with it (DECISIONS.md §17). `\p{…}` is kept in the same
 * rule by that section, although Safari has supported it since 11.1.
 */
export function modernRegexLiterals(code: string): string[] {
  return regexLiterals(code).filter((l) => /\(\?<[=!]|\\[pP]\{/.test(l));
}
