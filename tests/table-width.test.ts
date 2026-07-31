import stringWidth from "string-width";
import { describe, expect, test } from "vitest";

import { tablemark } from "../src/index.js";

const lineCount = (markdown: string): number =>
	markdown.trimEnd().split("\n").length;

describe("maxTableWidth", () => {
	const data = [
		{
			name: "Alpha",
			description: "A long description with several words that can wrap"
		},
		{
			name: "A substantially longer name",
			description: "Short description"
		},
		{
			name: "Gamma",
			description: "Another description that also needs some room"
		}
	];

	test("fits every guttered output line within the complete table width", () => {
		const markdown = tablemark(data, {
			maxTableWidth: 42,
			wrapWithGutters: true
		});

		for (const line of markdown.trimEnd().split("\n")) {
			expect(stringWidth(line)).toBe(42);
		}
	});

	test("finds a minimum-height allocation for the width budget", () => {
		const maxTableWidth = 32;
		const optimized = tablemark(data, {
			maxTableWidth,
			wrapWithGutters: true
		});
		const cellBudget = maxTableWidth - 7;
		const candidateHeights: number[] = [];

		for (let firstWidth = 3; firstWidth <= cellBudget - 3; firstWidth++) {
			candidateHeights.push(
				lineCount(
					tablemark(data, {
						columns: [
							{ width: firstWidth },
							{ width: cellBudget - firstWidth }
						],
						wrapWithGutters: true
					})
				)
			);
		}

		expect(lineCount(optimized)).toBe(Math.min(...candidateHeights));
	});

	test("finds a minimum-height allocation across three columns", () => {
		const threeColumnData = [
			{
				first: "alpha beta gamma delta",
				second: "one two three four five",
				third: "short"
			},
			{
				first: "brief",
				second: "small",
				third: "a third column with a longer value"
			}
		];
		const maxTableWidth = 34;
		const cellBudget = maxTableWidth - 10;
		const optimized = tablemark(threeColumnData, {
			maxTableWidth,
			wrapWithGutters: true
		});
		let minimumHeight = Number.POSITIVE_INFINITY;

		for (let firstWidth = 3; firstWidth <= cellBudget - 6; firstWidth++) {
			for (
				let secondWidth = 3;
				secondWidth <= cellBudget - firstWidth - 3;
				secondWidth++
			) {
				minimumHeight = Math.min(
					minimumHeight,
					lineCount(
						tablemark(threeColumnData, {
							columns: [
								{ width: firstWidth },
								{ width: secondWidth },
								{ width: cellBudget - firstWidth - secondWidth }
							],
							wrapWithGutters: true
						})
					)
				);
			}
		}

		expect(lineCount(optimized)).toBe(minimumHeight);
	});

	test("does not expand a table that is already narrower than the maximum", () => {
		expect(tablemark(data, { maxTableWidth: 200 })).toBe(tablemark(data));
	});

	test("keeps explicit column widths fixed during optimization", () => {
		const markdown = tablemark(data, {
			columns: [{ width: 8 }, {}],
			maxTableWidth: 42,
			wrapWithGutters: true
		});
		const firstHeaderCell = markdown.split("\n")[0]?.split("|")[1] ?? "";

		expect(stringWidth(firstHeaderCell)).toBe(10);
	});

	test("rejects an infeasible complete table width", () => {
		expect(() => tablemark(data, { maxTableWidth: 12 })).toThrow(
			/maxTableWidth 12 is too small for 2 columns/
		);
	});

	test("rejects fractional complete table widths", () => {
		expect(() => tablemark(data, { maxTableWidth: 32.5 })).toThrow(
			/maxTableWidth must be a positive integer/
		);
	});
});
