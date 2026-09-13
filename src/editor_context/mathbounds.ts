import { EditorView, type PluginValue, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { type Bounds as Bound, type CMBound, MathMode } from "./context";
import { EditorState } from "@codemirror/state";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { modifiedSyntaxTree } from "src/parser/language";
import { Type } from "src/parser/mathjax-parser";
import { getLatexSuiteConfig } from "src/snippets/codemirror/config";
import { latex } from "src/parser/latex-terms";
import { BlockMathMode, CodeBlockMode, CodeMathMode, InlineCodeMode, InlineBlockMathMode, InlineMathMode, type MathModes } from "./options";


type EquationInfo = { text: string; bound: MathBoundWithTree; overlay: CMBound; };

type MathBoundWithTree = MathBound & { tree: SyntaxNode; };

export const enum BoundKind {
	MathBound,
	InlineCodeBound,
	CodeBlockBound
}

export type MathBound = Bound & {
	Mmode: MathMode;
	tree: SyntaxNode | null;
	overlay: CMBound[];
	mode: MathModes
	kind: BoundKind.MathBound
};

type CodeBlockBounds = Bound & {
	language: string;
	tree: SyntaxNode | null;
	overlay: CMBound[];
	mode: CodeBlockMode
	kind: BoundKind.CodeBlockBound
};

type InlineCodeBounds = Bound & {
	mode: InlineCodeMode
	kind: BoundKind.InlineCodeBound
}

type Bounds = MathBound | CodeBlockBounds | InlineCodeBounds;

export class MathBoundsPlugin implements PluginValue {
	private _bounds: Bounds[] = [];
	private equationsOverlays: EquationInfo[] | null = null;
	shouldUpdate: boolean = false;

	get mathBounds(): readonly MathBound[] {
		return this._bounds.filter((bound): bound is MathBound => bound.mode.inMath);
	}

	constructor(view: EditorView) {
		this.updateMathBounds(view);
	}

	reset() {
		this._bounds = [];
		this.equationsOverlays = null;
		this.shouldUpdate = false;
	}

	getTree(state: EditorState) {
		return modifiedSyntaxTree(state);
	}

	init(view: EditorView) {
		if (this.shouldUpdate) {
			this.equationsOverlays = null;
			this.updateMathBounds(view);
			this.shouldUpdate = false;
		}
		return this;
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.shouldUpdate = true;
		}
	}

	getDollarBounds(node: SyntaxNode): {open: CMBound, close: CMBound} {
		const open = node.firstChild!;
		const close =
			node.lastChild!.name === "Dollar"
				? node.lastChild!
				: { from: node.to, to: node.to };
		return {
			open,
			close
		}
	}

	_iterateNodesEnter(nodeRef: SyntaxNodeRef, forceMathLanguages: string[], view: EditorView): boolean | void {
		if (nodeRef.name === Type.DollarDisplayBlockMath) {
			const { open, close } = this.getDollarBounds(nodeRef.node);
			const children = nodeRef.node.getChildren("DisplayMath")
			if (children.length === 0) {
				this._bounds.push({
					inner_start: open.to,
					inner_end: close.from,
					outer_start: open.from,
					outer_end: close.to,
					Mmode: MathMode.BlockDisplayMath,
					tree: null,
					overlay: [],
					kind: BoundKind.MathBound,
					mode: new BlockMathMode()
				})
				return false;
			}

			const tree = nodeRef.node.enter(children[children.length - 1].to, -1);
			if (!tree) {
				return false;
			}

			this._bounds.push({
				inner_start: open.to,
				inner_end: close.from,
				outer_start: open.from,
				outer_end: close.to,
				Mmode: MathMode.BlockDisplayMath,
				tree,
				overlay: children,
				kind: BoundKind.MathBound,
				mode: new BlockMathMode()
			});
			return false;
		} else if (
			nodeRef.name === Type.DollarInlineMath ||
			nodeRef.name === Type.DollarDisplayMath
		) {
			const { open, close } = this.getDollarBounds(nodeRef.node);
			const tree = nodeRef.node.getChild("LaTeX");
			if (!tree) {
				return false;
			}
			const mode = nodeRef.name === Type.DollarInlineMath ? new InlineMathMode() : new InlineBlockMathMode();
			const Mmode = nodeRef.name === Type.DollarInlineMath ? MathMode.InlineMath : MathMode.InlineDisplayMath;
			this._bounds.push({
				inner_start: open.to,
				inner_end: close.from,
				outer_start: open.from,
				outer_end: close.to,
				Mmode,
				tree,
				overlay: [tree],
				kind: BoundKind.MathBound,
				mode,
			});
			return false;
		} else if (nodeRef.name === "FencedCode" || nodeRef.name === "CodeBlock") {
			const language = getCodeLanguage(nodeRef.node, view);
			if (!language || !forceMathLanguages.includes(language)) {
				const bound = createCodeBlockBounds(nodeRef.node, language ?? "");
				if (bound) {
					this._bounds.push(bound);
				}
				return false;
			}
			const contentNodes = nodeRef.node.getChildren("CodeText");
			const lastNode = contentNodes.last();
			if (!lastNode) return;
			const tree = nodeRef.node.enter(lastNode.to, -1);
			if (tree === null || !tree.type.is(latex.LaTeX)) return;
			this._bounds.push({
				inner_start: contentNodes[0].from,
				inner_end: lastNode.to,
				outer_start: nodeRef.node.from,
				outer_end: nodeRef.node.to,
				Mmode: MathMode.CodeMath,
				tree,
				overlay: contentNodes,
				kind: BoundKind.MathBound,
				mode: new CodeMathMode()
			});
			return false;
		} else if (nodeRef.name === "InlineCode") {
			const children = nodeRef.node.getChildren("CodeMark");
			if (children.length < 2) return;
			const start = children[0];
			const end = children[children.length - 1];
			this._bounds.push({
				inner_start: start.to,
				inner_end: end.from,
				outer_start: start.from,
				outer_end: end.to,
				kind: BoundKind.InlineCodeBound,
				mode: new InlineCodeMode()
			});
			return false;
		}
	}

	updateMathBounds(view: EditorView) {
		const tree = modifiedSyntaxTree(view.state);
		this._bounds = [];
		const forceMathLanguages = getLatexSuiteConfig(view).forceMathLanguages;
		const topNode = tree.topNode;
		if (topNode.type.is(latex.LaTeX)) {
			this._bounds.push({
				inner_start: topNode.from,
				inner_end: topNode.to,
				outer_start: topNode.from,
				outer_end: topNode.to,
				Mmode: MathMode.BlockDisplayMath,
				tree: topNode.node,
				overlay: [{ from: topNode.from, to: topNode.to }],
				mode: new BlockMathMode(),
				kind: BoundKind.MathBound
			});
		} else {
			for (const { from, to } of view.visibleRanges) {
				tree.iterate({
					from,
					to,
					enter: (nodeRef) =>
						this._iterateNodesEnter(
							nodeRef,
							forceMathLanguages,
							view,
						),
				});
			}
		}
	}
	
	inMathBound(_state: EditorState, pos: number): MathBound | null {
		const bound = this.inBound(_state, pos);
		if (bound && bound.kind === BoundKind.MathBound) {
			return bound;
		}
		return null;
	}

	inBound(_state: EditorState, pos: number): Bounds | null {
		const bounds = this._bounds;
		if (
			pos < bounds[0]?.outer_start ||
			pos > bounds[bounds.length - 1]?.outer_end
		) {
			return null;
		}
		// Use binary search to efficiently find if pos is within any math bound
		let left = 0,
			right = bounds.length - 1;
		while (left <= right) {
			const mid = (left + right) >> 1;
			const bound = bounds[mid];
			if (pos < bound.outer_start) {
				right = mid - 1;
			// excalidraw doesn't have delimiters thus they have 0 length and should be ignored for this check
			} else if (pos >= bound.outer_end && bound.outer_end !== bound.inner_end) {
				left = mid + 1;
			} else if (
				pos < bound.inner_start &&
				bound.kind === BoundKind.MathBound &&
				bound.mode.kind === "inlineBlockMath" &&
				bound.inner_start - bound.outer_start == 2
			) {
				return {
					outer_start: bound.outer_start,
					inner_start: bound.outer_start + 1,
					inner_end: bound.outer_start + 1,
					outer_end: bound.outer_start + 2,
					Mmode: MathMode.InlineMath,
					tree: null,
					overlay: [],
					mode: new InlineMathMode(),
					kind: BoundKind.MathBound,
				};
			} else if (pos < bound.inner_start || pos > bound.inner_end) {
				break;
			} else {
				return bound;
			}
		}
		return null;
	};

	// TODO: maybe support math bounds outside viewport. But not sure if its needed.

	getEquationOverlays(state: EditorState) {
		if (this.equationsOverlays)
			return this.equationsOverlays;
		this.equationsOverlays = this.mathBounds.map((bound) =>
			bound.overlay.length === 0 || bound.tree === null ? null :
			{
				bound,
				overlay: {from: bound.overlay[0].from, to: bound.overlay[bound.overlay.length - 1].to},
				text: state.sliceDoc(bound.overlay[0].from, bound.overlay[bound.overlay.length - 1].to),
			}		
		).filter((x): x is EquationInfo => x !== null);
		return this.equationsOverlays;
	}
}

function getCodeLanguage(node: SyntaxNode, view: EditorView): string | null {
	const infoNode = node.getChild("CodeInfo");
	if (!infoNode) return null;
	const language = view.state.sliceDoc(infoNode.from, infoNode.to);
	return language;
}

/**
 * Creates a CodeBlockBounds object for a given node and language.
 * 
 * @param node A FencedCode node or CodeBlock node
 * @param language the language of the codeblock, should be empty if it doesn't exist.
 * @returns the bound if the node is not empty, otherwise null.
 */
function createCodeBlockBounds(node: SyntaxNode, language: string): CodeBlockBounds | null {
	const contentNodes = node.getChildren("CodeText");
	if (contentNodes.length === 0) return null;
	const firstNode = contentNodes[0];
	const lastNode = contentNodes.last()!;
	const tree = lastNode.enter(lastNode.to, -1);
	return {
		outer_start: node.from,
		inner_start: firstNode.from,
		inner_end: lastNode?.to,
		outer_end: node.to,
		language,
		overlay: contentNodes,
		tree,
		mode: new CodeBlockMode(language),
		kind: BoundKind.CodeBlockBound,
	}
}

export const mathBoundsPlugin = ViewPlugin.fromClass(MathBoundsPlugin);

export const getMathBoundsPlugin = (view: EditorView, init: boolean = true) => {
	const plugin = view.plugin(mathBoundsPlugin);
	if (!plugin) {
		throw new Error(
			"MathBoundsPlugin not found, something went wrong with the plugin initialization"
		);
	}
	return init ? plugin.init(view) : plugin;
};

