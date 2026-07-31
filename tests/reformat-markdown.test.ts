import stringWidth from "string-width";
import { describe, expect, test } from "vitest";

import { reformatMarkdownTables } from "../src/index.js";

describe("reformatMarkdownTables", () => {
	test("replaces only parsed table ranges", () => {
		const before = [
			"# Heading",
			"",
			"Keep   this paragraph exactly as it is.",
			"",
			"```md",
			"| This | is not reformatted |",
			"| --- | --- |",
			"| because | it is code |",
			"```",
			"",
			"|Name|Description|",
			"|-|-|",
			"|Alice|Some fairly long descriptive text for Alice|",
			"|Bob|Short|",
			"",
			"Keep  this ending too.",
			""
		].join("\n");

		const after = reformatMarkdownTables(before, { maxTableWidth: 36 });

		expect(after).toContain(
			"# Heading\n\nKeep   this paragraph exactly as it is.\n\n```md\n| This | is not reformatted |\n| --- | --- |\n| because | it is code |\n```\n\n"
		);
		expect(after.endsWith("\n\nKeep  this ending too.\n")).toBe(true);

		const formattedTable = after.slice(
			after.indexOf("| Name"),
			after.indexOf("\n\nKeep  this ending")
		);
		for (const line of formattedTable.split("\n").filter(Boolean)) {
			expect(stringWidth(line)).toBe(36);
		}
	});

	test("preserves inline Markdown source inside cells", () => {
		const before = [
			"| Person | Reference |",
			"| :--- | ---: |",
			"| *Alice* | [example](https://example.com/a) and a\\|b |"
		].join("\n");

		const after = reformatMarkdownTables(before, { maxTableWidth: 100 });

		expect(after).toContain("*Alice*");
		expect(after).toContain("[example](https://example.com/a)");
		expect(after).toContain("a\\|b");
		expect(after).not.toContain("a\\\\|b");
		expect(after.split("\n")[1]).toMatch(/^\| :[- ]+\| [- ]+: \|$/);
	});

	test("reformats every parsed table without shifting later source ranges", () => {
		const before = [
			"First:",
			"",
			"| A | B |",
			"| - | - |",
			"| a long first value | short |",
			"",
			"Between  these tables.",
			"",
			"| C | D |",
			"| - | - |",
			"| short | a long second value |",
			"",
			"Last."
		].join("\n");

		const after = reformatMarkdownTables(before, { maxTableWidth: 24 });
		const tableLines = after.split("\n").filter((line) => line.startsWith("|"));

		expect(after).toContain("\n\nBetween  these tables.\n\n");
		expect(after.endsWith("\n\nLast.")).toBe(true);
		expect(tableLines.length).toBeGreaterThan(6);
		for (const line of tableLines) {
			expect(stringWidth(line)).toBe(24);
		}
	});

	test("preserves CRLF line endings", () => {
		const before = [
			"Before",
			"",
			"| A | B |",
			"| - | - |",
			"| one | two |",
			"",
			"After"
		].join("\r\n");

		const after = reformatMarkdownTables(before);

		expect(after.replaceAll("\r\n", "")).not.toContain("\n");
		expect(after.startsWith("Before\r\n\r\n")).toBe(true);
		expect(after.endsWith("\r\n\r\nAfter")).toBe(true);
	});

	test("preserves a containing block quote prefix on every output line", () => {
		const before = [
			"> Intro",
			">",
			"> | A | B |",
			"> | - | - |",
			"> | a long value that wraps | short |",
			">",
			"> Outro"
		].join("\n");

		const after = reformatMarkdownTables(before, { maxTableWidth: 24 });
		const tableLines = after
			.split("\n")
			.filter((line) => line.includes("|") && !line.includes("Intro"));

		expect(tableLines.length).toBeGreaterThan(3);
		for (const line of tableLines) {
			expect(line.startsWith("> |")).toBe(true);
		}
	});

	test("leaves a header-only table unchanged", () => {
		const before = "| A | B |\n| - | - |";
		expect(reformatMarkdownTables(before, { maxTableWidth: 30 })).toBe(before);
	});
});
