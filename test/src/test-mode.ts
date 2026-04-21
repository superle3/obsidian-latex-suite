import { snippet } from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Bounds, getContextPlugin, getMathBoundsPlugin } from "../../src/utils/context";
import { Command, Editor, editorLivePreviewField, MarkdownView } from "obsidian";
import { ensureSyntaxTree, forceParsing, syntaxTreeAvailable } from "@codemirror/language";
import { queueSnippet } from "../../src/snippets/codemirror/snippet_queue_state_field";
import { expandSnippets } from "../../src/snippets/snippet_management";
/*
check math environments in markdown of hypermd syntaxtree.
prototype for e2e tests and util tests.
*/


const clearDoc = (view: EditorView) => {
	view.dispatch({
		changes: {
			from: 0,
			to: view.state.doc.length,
			insert: "",
		},
	});
}

const BoundsEqual = (b1: Bounds | null, b2: Bounds): boolean => {
	if (b1 === null) return false;
	return b1.inner_start === b2.inner_start &&
		b1.inner_end === b2.inner_end &&
		b1.outer_start === b2.outer_start &&
		b1.outer_end === b2.outer_end;
}	

const snippetFromView = async (view: EditorView, content: string) => {
	const snip = content.split("$0");
	if (snip.length !== 2) {
		throw new Error("Snippet should have exactly one $0");
	}
	const snippet = snip[0];
	const cursor = snippet.length;
	view.dispatch({
		changes: {
			from: 0,
			to: view.state.doc.length,
			insert: snip.join(""),
		},
	});
	view.dispatch({
		selection: {
			anchor: cursor,
			head: cursor,
		},
	})
	await sleep(50)
}

const normalInline = async (view: EditorView) => {
	const content = String.raw`$a+$0b=c$`
	await snippetFromView(view, content);
	let ctx = getContextPlugin(view);
	console.log(ctx.mode.inlineMath, JSON.stringify(ctx.mode, null, 1));
	view.dispatch()
	ctx = getContextPlugin(view);
	console.assert(ctx.mode.inlineMath, `inline math mode should be detected ${JSON.stringify(ctx.mode,null, 1)}`);	
	return ctx.mode.inlineMath;
}

const normalDisplay = async (view: EditorView) => {
	const content = String.raw`$$a+$0b=c$$`
	await snippetFromView(view, content);
	const ctx = getContextPlugin(view);
	console.assert(ctx.mode.blockMath, "display math mode should be detected");	
	return ctx.mode.blockMath;
}

const weirdInlineDisplay = async (view: EditorView) => {
	const content = String.raw`text $$0$
a+b=c
$$ text`
	await snippetFromView(view, content);
	const selection = view.state.selection.main;
	const ctx = getContextPlugin(view);
	console.assert(ctx.mode.inlineMath, "inline math mode should be detected",ctx.mode);	
	return ctx.mode.inlineMath;
}

const listInline = async (view: EditorView) => {
	const content = String.raw`1. $$0a+b=c$`
	await snippetFromView(view, content);
	const ctx = getContextPlugin(view);
	console.assert(ctx.mode.inlineMath, "inline math mode should be detected");	
	return ctx.mode.inlineMath;
}

const listInlineSurrounded = async (view: EditorView) => {
	const content = String.raw`1. some text $$0a+b=c$ and more text`
	await snippetFromView(view, content);
	const ctx = getContextPlugin(view);
	console.assert(ctx.mode.inlineMath, "inline math mode should be detected");	
	return ctx.mode.inlineMath;
}


const listInlineDisplay = async (view: EditorView) => {
	const content = String.raw`1. $$0$a+b=c$$
	
$$
E=mc^2
$$`
	await snippetFromView(view, content);
	const ctx = getContextPlugin(view);
	const bounds = ctx.getBounds();
	console.assert(!!bounds, "bounds should be detected" + view.state.sliceDoc(0, view.state.selection.main.head));
	if (!bounds) {
		return false;
	}
	const inside_content = view.state.sliceDoc(bounds.inner_start, bounds.inner_end);
	const outside_content = view.state.sliceDoc(bounds.outer_start, bounds.outer_end);
	const cond = ctx.mode.inlineMath && inside_content === "" && outside_content === "$$";
	console.assert(cond, "inline math mode should be detected");	
	return cond;
}

const calloutInlineSurround = async (view: EditorView) => {
	const content = String.raw`> callout
> some text $$0a+b=c$ and more text
> and more text`
	await snippetFromView(view, content);
	const ctx = getContextPlugin(view);
	console.assert(ctx.mode.inlineMath, "inline math mode should be detected");	
	return ctx.mode.inlineMath;
}

const calloutText = async (view: EditorView) => {
	const content = String.raw`
>[!example]
> $$E=mc^2 $$
$0
`
	await snippetFromView(view, content);
	const ctx = getContextPlugin(view);
	const cond = ctx.mode.text && !ctx.mode.inMath();
	const state = view.state;
	const plugin = getMathBoundsPlugin(view);
	plugin.getEquationBounds(state, ctx.pos);
	console.assert(cond, "should not be in math mode", ctx.mode);	
	return cond;
}

const calloutDisplay = async (view: EditorView) => {
	const content = String.raw`
>[!example]
> some text
> $$
> E=mc^2$0
> $$
> some text
`
	await snippetFromView(view, content);
	const ctx = getContextPlugin(view);
	const cond = ctx.mode.blockMath;
	const state = view.state;
	const plugin = getMathBoundsPlugin(view);
	plugin.getEquationBounds(state, ctx.pos);
	console.assert(cond, "should not be in math mode", ctx.mode);	
	return cond;
}

const multipleViewports = async (view: EditorView) => {
	// issue #489, test if multiple viewports cause issues with math bounds detection.
	const content = String.raw`
$$
\\text{1st Math section (inline or block)}
$$
%% Everything above the callout is normal %%
(normal)

> [!info]
> $$
> \\text{math section in a callout (both inline and block cause this issue)}
> $$

%% The content between the callout and the 2nd math section is affected %% 
%% i.e. parenthesis are colored, \`t\` snippets don't expand, \`m\` snippets do %%
(bugged)
$0

$$
\\text{2nd Math section (inline or block)}
$$
`
	await snippetFromView(view, content);
	toggleSource(view, false);
	const ctx = getContextPlugin(view);
	console.assert(ctx.mode.text, "should be in block math mode", ctx.mode);	
	toggleSource(view, true);
	return ctx.mode.text;
}

	
type CheckFn = (view: EditorView) => boolean;

const environmentChecks: CheckFn[] = [
	normalInline,
	normalDisplay,
	weirdInlineDisplay,
	listInline,
	listInlineSurrounded,
	listInlineDisplay,
	calloutInlineSurround,
	calloutText,
	calloutDisplay,
	multipleViewports,
]

const checkEnvironments =  keymap.of([
	{
		key: "Ctrl-j",
		run: (view) => {
			const state=view.state;
			const doc = state.doc
			if (doc.toString().trim().length !== 0) {
				return false;
			}
			for (const fn of environmentChecks) {
				if (!fn(view)) {
					return true;
				}
			}
			clearDoc(view);
			
			return true;
		}
	}
])
export const debugEnvironments = Prec.highest(checkEnvironments)
export const checkModeCommand: Command = {
	id: "context-mode-test",
	name: "Test context mode",
	editorCallback: (editor: Editor) => {
		
		//@ts-ignore
		const view: EditorView = editor.cm;
		const state = view.state;
		const doc = state.doc
		if (doc.toString().trim().length !== 0) {
			return false;
		}
		// await sleep(2000);
		const checks: string[] = environmentChecks.map((fn, i, arr) => {
			clearDoc(view);
			const res =  fn(view)
			if (res) {
				console.log(`succes ${i}/${arr.length-1} ${fn.name}`)
				return null;
			}
			console.log(`failed ${i}/${arr.length-1} ${fn.name}`)
			const pos = view.state.selection.main.to;
			view.dispatch({
				changes: {
					from: pos,
					to: pos,
					insert: "<CURSOR-HERE>",
				}	
			})
			const ctx = getContextPlugin(view);
			return `func: ${fn.name}, mode: ${JSON.stringify(ctx.mode, null, 2)}, state: ${view.state.doc.toString()}`
		}).filter(x => x !== null)
		view.dispatch({
			changes: {
				from: 0,
				to: view.state.doc.length,
				insert: checks.join(""),
			},
		})
		
		return true;
	}
}
export const checkCallback = async (view: EditorView) => {
	toggleSource(view, false);
	const state = view.state;
	const doc = state.doc;
	if (doc.toString().trim().length !== 0) {
		return false;
	}
	// await sleep(2000);
	const checks: string[] = [];
	for (let i = 0; i < environmentChecks.length; i++) {
		const fn = environmentChecks[i];
		clearDoc(view);
		const res = await fn(view);
		if (res) {
			console.log(`succes ${i}/${environmentChecks.length - 1} ${fn.name}`);
			continue;
		}
		console.log(`failed ${i}/${environmentChecks.length - 1} ${fn.name}`);
		const pos = view.state.selection.main.to;
		const docstr =
			view.state.sliceDoc(0, pos) + "<>" + view.state.sliceDoc(pos);

		const ctx = getContextPlugin(view);
		checks.push(
			`func: ${fn.name}, mode: ${JSON.stringify(ctx.mode, null, 2)}, state: ${docstr}`,
		);
	}
	view.dispatch({
		changes: {
			from: 0,
			to: view.state.doc.length,
			insert: checks.join(""),
		},
	});

	return true;
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function toggleSource(view: EditorView, source: boolean) {
	const isLivePreview = view.state.field(editorLivePreviewField);
	if (source && !isLivePreview) return;
	const mdView = app.workspace.getActiveViewOfType(MarkdownView);
	if (mdView && !isLivePreview) {
		//@ts-ignore
		app.commands.executeCommandById("editor:toggle-source");
	}
}
