import { EditorState, SelectionRange, Text } from "@codemirror/state";
import {
	EditorView,
	type PluginValue,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import {
	findMatchingBracket,
	getCloseBracket,
	stackResolveNodeIterate,
} from "src/utils/editor_utils";
import { OffMode, SnippetlessEnvMode, TextEnvMode, TextMode, type CursorModes } from "./options";
import type { Environment } from "../snippets/environment";
import type { SyntaxNode } from "@lezer/common";
import { allTextAreas, type MacroArea, snippetLessArea } from "./default_text_areas";
import { BoundKind, getMathBoundsPlugin, type MathBound } from "./mathbounds";

export type StackOutput = (
	| {
			kind: "command";
			name: string;
	  }
	| {
			kind: "environment";
			name: string;
	  }
	| { kind: "math" }
) &
	Bounds & { node: SyntaxNode };

export type MacroStackOutput = StackOutput & { kind: "command" };
export interface Bounds {
	inner_start: number;
	inner_end: number;
	outer_start: number;
	outer_end: number;
}

export type CMBound = { from: number; to: number };
export class Context implements PluginValue {
	view!: EditorView;
	state!: EditorState;
	mode!: CursorModes;
	pos!: number;
	ranges!: SelectionRange[];
	codeblockLanguage: string | null = null;
	mathBoundsCache!: Map<number, MathBound | null>;
	codeblockBoundsCache!: Map<number, Bounds | null>;
	innerBoundsCache!: Map<number, StackOutput & {kind: "math"} | null>;
	shouldUpdate: boolean = false;

	constructor(view: EditorView) {
		this.updateFromView(view);
	}

	disableMath() {
		this.shouldUpdate = false;
		this.mathBoundsCache.clear();
		this.innerBoundsCache.clear();
		this.mode = new OffMode();
		const mathBounds = getMathBoundsPlugin(this.view, false);
		mathBounds.reset();
	}

	/**
	 * Small optimization to avoid updating the context when no extension is used.
	 * @param view current view
	 */
	init(view: EditorView) {
		if (this.shouldUpdate) {
			this.updateFromView(view);
			this.shouldUpdate = false;
		}
		return this
	}

	update(update: ViewUpdate) {
		if (!(update.docChanged || update.selectionSet || update.viewportChanged)) return;
		this.shouldUpdate = true;
	}
	updateFromView(view: EditorView) {
		const state = view.state;
		const sel = state.selection;
		this.view = view;
		this.state = state;
		this.pos = sel.main.to;
		this.ranges = Array.from(sel.ranges).reverse(); // Last to first
		this.mathBoundsCache = new Map();
		this.innerBoundsCache = new Map();
		this.codeblockLanguage = null;
		this.mode = this.createMode(view);
	}
	
	createMode(view: EditorView): CursorModes {
		const state = view.state;
		// first, check if math mode should be "generally" on
		const mathBoundsCache = getMathBoundsPlugin(view);
		const bound = mathBoundsCache.inBound(state, this.pos);
		if (bound === null) {
			return new TextMode();
		} else if (bound.kind === BoundKind.MathBound) {
			this.mathBoundsCache.set(this.pos, bound);
			const textEnv = this.inTextEnvironment();
			if (textEnv !== null) {
				return textEnv;
			}
			return bound.mode;
		}
		return bound.mode;
	}

	*getEnvNames(pos: number = this.pos): Generator<StackOutput, void, unknown> {
		const boundsPlugin = getMathBoundsPlugin(this.view);
		const bound = boundsPlugin.inMathBound(this.state, pos)
		if (!bound) return
		const treeNode = bound.tree
		if (!treeNode) return
	
		for (const node of stackResolveNodeIterate(treeNode, pos, -1)) {
			if (node.to <= pos) continue;
			if (node.name === "LaTeX") {
				// _printNode2(node, this.state.doc.toString())
			}
			const result = this.getEnvNameFromNode(node, this.state.doc);
			if (!result) continue;
			yield result;
		}
	}

	isWithinMacros(pos: number, macros: readonly MacroArea[]): StackOutput & { kind: "command" } | null {
		for (const result of this.getEnvNames(pos)) {
			if (result.kind=== "environment") continue;
			if (result.kind === "math") return null;
			const verifiedResult = isMacroArgumentCount(result, macros);
			if (verifiedResult) {
				return verifiedResult;
			}
		}
		return null;
	}
	getEnvNameFromNode(node: SyntaxNode, doc: Text): null | StackOutput {
		const value = node.name;
		function createEnvironment(
			envNode: SyntaxNode | null,
		): null | StackOutput {
			const beginNode = envNode?.getChild("BeginEnv");
			const envNameNode = beginNode?.getChild("EnvNameGroup");
			const contentNode = envNode?.getChild("Content");
			if (!envNameNode || !contentNode || !envNode) {
				return null;
			}
			return {
				kind: "environment",
				name: doc.sliceString(
					envNameNode.from + 1,
					envNameNode.to - 1,
				),
				inner_start: contentNode.from,
				inner_end: contentNode.to,
				outer_start: envNode.from,
				outer_end: envNode.to,
				node,
			};
		}

		if (value === "Environment") {
			return createEnvironment(node);
		} else if (value === "KnownEnvironment") {
			return createEnvironment(node.firstChild);
		} else if (value.endsWith("Argument") || value === "EnvNameGroup") {
			const parent = node.parent;
			const command = parent?.firstChild;
			const openBraced = node?.firstChild;
			const closeBraced = node?.lastChild;
			if (!command || !openBraced || !closeBraced) {
				return null;
			}
			return {
				kind: "command",
				name: doc.sliceString(command.from + 1, command.to),
				inner_start: openBraced.to,
				inner_end: closeBraced.from,
				outer_start: node.from,
				outer_end: closeBraced.to,
				node,
			};
		} else if (value === "ParenMath" || value === "DollarInlineMath") {
			value satisfies "ParenMath" | "DollarInlineMath";
			let openNode: SyntaxNode | null = null;
			let closeNode: SyntaxNode | null = null;
			if (value === "ParenMath") {
				openNode = node.getChild("OpenParenMath")!;
				closeNode = node.getChild("CloseParenMath")!;
			} else if (value === "DollarInlineMath") {
				const dollars = node.getChildren("Dollar")
				openNode = dollars[0] ?? null;
				closeNode = dollars[1] ?? null;
			}
			if (!openNode || !closeNode) {
				return null;
			}
			return {
				kind: "math",
				inner_end: closeNode.from,
				inner_start: openNode.to,
				outer_start: node.from,
				outer_end: node.to,
				node,
			}
		}
		return null;
	}

	isWithinEnvironment<T extends Environment>(pos: number, envs: T[]): T & Bounds | null {
		if (!this.mode.inMath || envs.length === 0) return null;	

		const bounds = this.getInnerMathBounds();
		if (!bounds) return null;

		const {inner_start: start, inner_end: end} = bounds;
		const text = this.state.sliceDoc(start, end);

		// pos referred to the absolute position in the whole document, but we just sliced the text
		// so now pos must be relative to the start in order to be any useful
		pos -= start;

		outer_loop: for (const env of envs) {
			const openBracket = env.openSymbol.slice(-1);
			const closeBracket = getCloseBracket(openBracket);

			// Take care when the open symbol ends with a bracket {, [, or (
			// as then the closing symbol, }, ] or ), is not unique to this open symbol
			let offset;
			let openSearchSymbol;

			if (
				["{", "[", "("].contains(openBracket) &&
				env.closeSymbol === closeBracket
			) {
				offset = env.openSymbol.length - 1;
				openSearchSymbol = openBracket;
			} else {
				offset = 0;
				openSearchSymbol = env.openSymbol;
			}

			let left = text.lastIndexOf(env.openSymbol, pos - 1);

			while (left != -1) {
				const right = findMatchingBracket(
					text,
					left + offset,
					openSearchSymbol,
					env.closeSymbol,
					false,
				);

				if (right === null) continue outer_loop;

				// Check whether the cursor lies inside the environment symbols
				if (right >= pos && pos >= left + env.openSymbol.length) {
					return {
						...env,
						inner_start: left + env.openSymbol.length + start,
						inner_end: right + start,
						outer_start: left + start,
						outer_end: right + env.closeSymbol.length + start,
					};
				}

				if (left <= 0) continue outer_loop;

				// Find the next open symbol
				left = text.lastIndexOf(env.openSymbol, left - 1);
			}
		}

		return null;
	}

	inTextEnvironment(): TextEnvMode | SnippetlessEnvMode | null {
		const bounds = this.getMathBounds();
		if (!bounds) return null;
		const result = this.isWithinMacros(this.pos, allTextAreas)
		if (!result) return null;
		const openSymbol = result.name;
		if (snippetLessArea.some(macro => macro.name === openSymbol)) {
			return new SnippetlessEnvMode(bounds.mode);
		} else {
			return new TextEnvMode(bounds.mode);
		}
	}

	getMathBounds(pos: number = this.pos): MathBound | null {
		// yes, I also want the cache to work over the produced range instead of just that one through
		// a BTree or the like, but that'd be probably overkill
		const cached = this.mathBoundsCache.get(pos);
		if (cached !== undefined) {
			return cached;
		}

		const bounds = getMathBoundsPlugin(this.view).inMathBound(this.state, pos)

		this.mathBoundsCache.set(pos, bounds);
		return bounds;
	}

	// Accounts for equations within text environments, e.g. $$\text{... $...$}$$
	getInnerMathBounds(pos: number = this.pos): StackOutput & {kind: "math"} | null {
		const cached = this.innerBoundsCache.get(pos);
		if (cached !== undefined) {
			return cached;
		}
		const parsed = this.getEnvNames(pos);
		for (const result of parsed) {
			if (result.kind === "math") {
				this.innerBoundsCache.set(pos, result);
				return result;
			}
		}
		return null;
	}
}

export const contextPlugin = ViewPlugin.fromClass(Context);
export const getContextPlugin = (view: EditorView, init: boolean = true): Context => {
	const plugin = view.plugin(contextPlugin)
	if (!plugin) {
		throw new Error("Context plugin not found, something went wrong with the plugin initialization");
	}
	return init ? plugin.init(view) : plugin;
}


export function isMacroArgumentCount(stack: Readonly<MacroStackOutput>, macros: readonly MacroArea[]): null | MacroStackOutput {
	const macro = macros.find((macro) => macro.name === stack.name);
	if (!macro) return null;
	if (!macro.arguments) return stack;

	let sibling_count: number = 0;
	let sibling: SyntaxNode | null = stack.node
	while ((sibling = sibling.prevSibling) !== null) {
		if (sibling.name.endsWith("Argument")) {
			sibling_count++;
		}
	}
	if (!macro.arguments.includes(sibling_count)) {
		return null
	}
	return stack
}

export const enum MathMode {
	InlineMath,
	BlockDisplayMath,
	InlineDisplayMath,
	CodeMath
}
