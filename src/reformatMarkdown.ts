import type { Table, TableCell } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import { visit } from "unist-util-visit";

import { tablemark } from "./tablemark.js";
import type {
	Alignment,
	ColumnDescriptor,
	InputData,
	ReformatMarkdownOptions,
	TablemarkOptions
} from "./types.js";

interface Replacement {
	end: number;
	start: number;
	value: string;
}

const getOffset = (offset: number | undefined, label: string): number => {
	if (offset == null) {
		throw new RangeError(`Markdown table ${label} offset is unavailable`);
	}

	return offset;
};

const getCellSource = (
	markdown: string,
	cell: TableCell | undefined
): string => {
	const firstChild = cell?.children[0];
	const lastChild = cell?.children.at(-1);
	if (firstChild == null || lastChild == null) {
		return "";
	}

	const start = getOffset(firstChild.position?.start.offset, "cell start");
	const end = getOffset(lastChild.position?.end.offset, "cell end");
	return markdown.slice(start, end);
};

const getLineEnding = (source: string): string =>
	/\r\n|\n|\r/.exec(source)?.[0] ?? "\n";

const getLinePrefix = (markdown: string, offset: number): string => {
	const searchFrom = Math.max(0, offset - 1);
	const previousLineEnding = Math.max(
		markdown.lastIndexOf("\n", searchFrom),
		markdown.lastIndexOf("\r", searchFrom)
	);
	return markdown.slice(previousLineEnding + 1, offset);
};

const getAlignment = (
	alignment: Alignment | null | undefined,
	fallback: Alignment
): Alignment => alignment ?? fallback;

const getColumns = (
	table: Table,
	headers: readonly string[],
	options: ReformatMarkdownOptions
): ColumnDescriptor[] =>
	headers.map((header, index) => {
		const configured = options.columns?.[index];
		const detectedAlignment = getAlignment(
			table.align?.[index],
			options.align ?? "left"
		);

		if (typeof configured === "string") {
			return { name: configured, align: detectedAlignment };
		}

		return {
			...configured,
			name: configured?.name ?? header,
			align: configured?.align ?? detectedAlignment
		};
	});

const formatTable = (
	markdown: string,
	table: Table,
	options: ReformatMarkdownOptions
): Replacement | undefined => {
	const start = getOffset(table.position?.start.offset, "start");
	const end = getOffset(table.position?.end.offset, "end");
	const [headerRow, ...bodyRows] = table.children;
	if (headerRow == null || bodyRows.length === 0) {
		return undefined;
	}

	const columnCount = Math.max(
		headerRow.children.length,
		...bodyRows.map((row) => row.children.length)
	);
	const headers = Array.from({ length: columnCount }, (_, index) =>
		getCellSource(markdown, headerRow.children[index])
	);
	const keys = headers.map((_, index) => `column_${index}`);
	const data = bodyRows.map((row) =>
		Object.fromEntries(
			keys.map((key, index) => [
				key,
				getCellSource(markdown, row.children[index])
			])
		)
	);
	const source = markdown.slice(start, end);
	const lineEnding = options.lineEnding ?? getLineEnding(source);
	const { columns: _columns, ...rest } = options;
	const tableOptions = {
		...rest,
		columns: getColumns(table, headers, options),
		headerCase: "preserve",
		lineEnding,
		overflowHeaderStrategy: options.overflowHeaderStrategy ?? "truncateEnd",
		toCellText:
			options.toCellText ??
			(({ value }) => (typeof value === "string" ? value : "")),
		wrapWithGutters: options.wrapWithGutters ?? true
	} satisfies TablemarkOptions;
	let formatted = tablemark<InputData>(data, tableOptions);
	if (formatted.endsWith(lineEnding)) {
		formatted = formatted.slice(0, -lineEnding.length);
	}

	const prefix = getLinePrefix(markdown, start);
	return {
		start,
		end,
		value: formatted.replaceAll(lineEnding, lineEnding + prefix)
	};
};

/**
 * Reformat every GFM table in a Markdown document while leaving text outside
 * the parsed table source ranges byte-for-byte unchanged.
 */
export const reformatMarkdownTables = (
	markdown: string,
	options: ReformatMarkdownOptions = {}
): string => {
	const tree = fromMarkdown(markdown, {
		extensions: [gfmTable()],
		mdastExtensions: [gfmTableFromMarkdown()]
	});
	const replacements: Replacement[] = [];

	visit(tree, "table", (table) => {
		const replacement = formatTable(markdown, table, options);
		if (replacement != null) {
			replacements.push(replacement);
		}
	});

	let result = markdown;
	for (const replacement of replacements.toSorted(
		(left, right) => right.start - left.start
	)) {
		result =
			result.slice(0, replacement.start) +
			replacement.value +
			result.slice(replacement.end);
	}

	return result;
};
