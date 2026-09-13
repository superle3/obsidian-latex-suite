import { EditorView } from "@codemirror/view";
import { SelectionRange } from "@codemirror/state";
import { findMatchingBracket } from "src/utils/editor_utils";
import { queueSnippet } from "src/snippets/codemirror/snippet_queue_state_field";
import { expandSnippets } from "src/snippets/snippet_management";
import { autoEnlargeBrackets } from "./auto_enlarge_brackets";
import { Context, getContextPlugin } from "src/editor_context/context";
import { getLatexSuiteConfig } from "src/snippets/codemirror/config";
import { ArrayNode, emptyInsertOptions, TabstopNode, TextNode } from "src/snippets/luasnip_api/node";
import { pairBrackets, traverseTree } from "src/editor_extensions/highlight_brackets";
import { EquationText } from "src/utils/tokenizer";


export const runAutoFraction = (view: EditorView): boolean => {
	const ctx = getContextPlugin(view);

	for (const range of ctx.ranges) {
		runAutoFractionCursor(view, ctx, range);
	}

	const success = expandSnippets(view);
	
	if (success) {
		autoEnlargeBrackets(view);
	}

	return success;
}


const greek = "alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|Theta|iota|kappa|lambda|Lambda|mu|nu|omicron|xi|Xi|pi|Pi|rho|sigma|Sigma|tau|upsilon|Upsilon|varphi|phi|Phi|chi|psi|Psi|omega|Omega";
const regex = new RegExp("(" + greek + ") ([^ ])", "g");

export const runAutoFractionCursor = (view: EditorView, ctx: Context, range: SelectionRange):boolean => {

	const settings = getLatexSuiteConfig(view);
	const {from, to} = range;

	// Don't run autofraction in excluded environments
	const envs = settings.autofractionExcludedEnvs
	if (ctx.isWithinEnvironment(to, envs)) {
		return false;
	}

	// Get the bounds of the equation
	const innerBound = ctx.getInnerMathBounds(range.to)
	const outerBound = ctx.getMathBounds(range.to)
	const bound = innerBound ? innerBound : outerBound!;
	if (!bound) return false;
	const node = "node" in bound ? bound.node : bound.tree;
	if (!node) return false;
	const eqnStart = Math.max(bound.inner_start, node.from);


	let curLine = view.state.sliceDoc(eqnStart, to);
	let start = eqnStart;

	if (from != to) {
		// We have a selection
		// Set start to the beginning of the selection

		start = from;
	}
	else {
		// Find the contents of the fraction
		// Match everything except spaces and +-, but allow these characters in brackets

		// Also, allow spaces after greek letters
		// By replacing spaces after greek letters with a dummy character (#)
		regex.lastIndex = 0;
		curLine = curLine.replace(regex, "$1#$2");

		const doc = new EquationText(curLine, eqnStart, to)
		const pairedBrackets = pairBrackets(traverseTree(node, doc))
			.filter((pair) => pair.kind !== "error_open")
			.filter(
				(pair) =>
					(pair.kind === "bracket" &&
						pair.open.from >= eqnStart &&
						pair.close.to <= to) ||
					(pair.kind === "error_close" &&
						pair.close.from >= eqnStart &&
						pair.close.to <= to),
			).sort((a, b) => -(a.close.to - b.close.to));
		for (let i = curLine.length - 1, pairBracketIndex = 0; i >= 0; i--) {
			const curChar = curLine.charAt(i);
			const pairBracket = pairedBrackets[pairBracketIndex];
			if (pairBracket && pairBracket.kind === "error_close") {
				return false;
			} else if (pairBracket && pairBracket.close.to === i + eqnStart + 1) {
				// Skip to the beginning of the bracket
				i = pairBracket.open.from - eqnStart;
				for (pairBracketIndex = pairBracketIndex + 1; pairBracketIndex < pairedBrackets.length; pairBracketIndex++) {
					if (pairedBrackets[pairBracketIndex].close.to <= i + eqnStart) {
						break;
					}
				}
				continue;
			}


			// if ([")", "]", "}"].contains(curChar)) {
			// 	const closeBracket = curChar;
			// 	const openBracket = getOpenBracket(closeBracket);

			// 	const j = findMatchingBracket(curLine, i, openBracket, closeBracket, true);

			// 	if (j === null) return false;

			// 	// Skip to the beginnning of the bracket
			// 	i = j;
			// }


			if (" $([{\n".concat(settings.autofractionBreakingChars).contains(curChar)) {
				start = i + 1 + eqnStart;
				break;
			}
		}
	}

	// Don't run on an empty line
	if (start === to) { return false; }

	// Run autofraction
	let numerator = view.state.sliceDoc(start, to);

	// Remove unnecessary outer parentheses
	if (numerator.at(0) === "(" && numerator.at(-1) === ")") {
		const closing = findMatchingBracket(numerator, 0, "(", ")", false);
		if (closing === numerator.length - 1) {
			numerator = numerator.slice(1, -1);
		}
	}

	const snippet = new ArrayNode([
		new TextNode(settings.autofractionSymbol + "{"),
		// If the content inside parentheses is empty, the numerator would be empty and that's rarely desired.
		numerator === "" ? new TabstopNode(0) : new TextNode(numerator),
		new TextNode("}{"),
		new TabstopNode(1),
		new TextNode("}"),
		new TabstopNode(2),
	]);
	// The keypressed shouldn't be inserted back in after an undo, if we have a selection.
	const keyPressed = from != to ? undefined : "/";

	queueSnippet(view, start, to, snippet.applyInsert(emptyInsertOptions), keyPressed);

	return true;
}
