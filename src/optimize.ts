import { columnsMinimumWidth } from "./constants.js";
import type { DataProfile } from "./data.js";
import type { TablemarkOptionsNormalized } from "./types.js";
import { getCellLines, getIsSomeTruncateStrategy } from "./utilities.js";

interface ColumnState {
	minWidth: number;
	maxWidth: number;
	rowHeights: number[];
}

const sum = (values: readonly number[]): number =>
	values.reduce((total, value) => total + value, 0);

const getTableOverhead = (
	columnCount: number,
	config: TablemarkOptionsNormalized
): number => {
	const truncationWidth = Array.from({ length: columnCount }).filter(
		(_, index) => getIsSomeTruncateStrategy(config, index)
	).length;

	return columnCount * 3 + 1 + truncationWidth;
};

const getColumnValues = (
	profile: DataProfile,
	columnIndex: number
): string[] => [
	profile.titles[columnIndex] ?? "",
	...profile.data.map((record) => Object.values(record)[columnIndex] ?? "")
];

const getColumnRowHeights = (
	values: readonly string[],
	width: number,
	config: TablemarkOptionsNormalized,
	columnIndex: number
): number[] =>
	values.map((value, rowIndex) =>
		Math.max(
			1,
			getCellLines(value, width, config, columnIndex, rowIndex === 0).length
		)
	);

const rowHeightsEqual = (
	left: readonly number[],
	right: readonly number[]
): boolean =>
	left.length === right.length &&
	left.every((height, index) => height === right[index]);

const getColumnStates = (
	profile: DataProfile,
	config: TablemarkOptionsNormalized,
	columnIndex: number,
	minWidth: number,
	maxWidth: number
): ColumnState[] => {
	const values = getColumnValues(profile, columnIndex);
	const states: ColumnState[] = [];
	let currentStart = minWidth;
	let currentHeights: number[] | undefined;

	for (let width = minWidth; width <= maxWidth; width++) {
		const rowHeights = getColumnRowHeights(values, width, config, columnIndex);

		if (currentHeights == null) {
			currentHeights = rowHeights;
			continue;
		}

		if (!rowHeightsEqual(rowHeights, currentHeights)) {
			states.push({
				minWidth: currentStart,
				maxWidth: width - 1,
				rowHeights: currentHeights
			});
			currentStart = width;
			currentHeights = rowHeights;
		}
	}

	if (currentHeights != null) {
		states.push({
			minWidth: currentStart,
			maxWidth,
			rowHeights: currentHeights
		});
	}

	return states;
};

const mergeRowHeights = (
	left: readonly number[],
	right: readonly number[]
): number[] => left.map((height, index) => Math.max(height, right[index] ?? 0));

const getHeight = (rowHeights: readonly number[]): number => sum(rowHeights);

const allocateWidths = (
	states: readonly ColumnState[],
	budget: number,
	preferred: readonly number[]
): number[] => {
	const widths = states.map((state) => state.maxWidth);
	let excess = sum(widths) - budget;

	while (excess > 0) {
		let selectedIndex = -1;
		let selectedCost = Number.POSITIVE_INFINITY;

		for (const [index, state] of states.entries()) {
			if ((widths[index] ?? 0) <= state.minWidth) {
				continue;
			}

			const deviation =
				(preferred[index] ?? state.maxWidth) - (widths[index] ?? 0);
			const marginalCost = deviation * 2 + 1;
			if (marginalCost < selectedCost) {
				selectedIndex = index;
				selectedCost = marginalCost;
			}
		}

		if (selectedIndex === -1) {
			throw new RangeError("Could not allocate the requested table width");
		}

		widths[selectedIndex] = (widths[selectedIndex] ?? 0) - 1;
		excess--;
	}

	if (excess !== 0 || sum(widths) !== budget) {
		throw new RangeError("Could not allocate the requested table width");
	}

	return widths;
};

const findStatesForWidths = (
	statesByColumn: readonly (readonly ColumnState[])[],
	widths: readonly number[]
): ColumnState[] =>
	statesByColumn.map((states, index) => {
		const width = widths[index] ?? 0;
		const state = states.find(
			(candidate) => candidate.minWidth <= width && candidate.maxWidth >= width
		);

		if (state == null) {
			throw new RangeError("Could not find a layout state for a column width");
		}

		return state;
	});

const getStatesHeight = (states: readonly ColumnState[]): number => {
	const rowCount = states[0]?.rowHeights.length ?? 0;
	let heights = Array.from({ length: rowCount }, () => 0);

	for (const state of states) {
		heights = mergeRowHeights(heights, state.rowHeights);
	}

	return getHeight(heights);
};

const searchStates = (
	statesByColumn: readonly (readonly ColumnState[])[],
	budget: number,
	seedStates: readonly ColumnState[]
): ColumnState[] => {
	const order = statesByColumn
		.map((states, index) => ({ index, count: states.length }))
		.sort((left, right) => left.count - right.count || left.index - right.index)
		.map(({ index }) => index);
	const remainingMin = Array.from({ length: order.length + 1 }, () => 0);
	const remainingMax = Array.from({ length: order.length + 1 }, () => 0);

	for (let position = order.length - 1; position >= 0; position--) {
		const states = statesByColumn[order[position] ?? 0] ?? [];
		remainingMin[position] =
			(remainingMin[position + 1] ?? 0) +
			Math.min(...states.map((state) => state.minWidth));
		remainingMax[position] =
			(remainingMax[position + 1] ?? 0) +
			Math.max(...states.map((state) => state.maxWidth));
	}

	const selected: (ColumnState | undefined)[] = Array.from({
		length: statesByColumn.length
	});
	let bestStates = [...seedStates];
	let bestHeight = getStatesHeight(seedStates);
	const rowCount = seedStates[0]?.rowHeights.length ?? 0;

	const search = (
		position: number,
		minWidth: number,
		maxWidth: number,
		rowHeights: number[]
	): void => {
		if (getHeight(rowHeights) >= bestHeight) {
			return;
		}

		if (position === order.length) {
			if (minWidth <= budget && budget <= maxWidth) {
				bestHeight = getHeight(rowHeights);
				bestStates = selected.map((state) => {
					if (state == null) {
						throw new RangeError("Incomplete optimized table layout");
					}
					return state;
				});
			}
			return;
		}

		const columnIndex = order[position] ?? 0;
		for (const state of statesByColumn[columnIndex] ?? []) {
			const nextMin = minWidth + state.minWidth;
			const nextMax = maxWidth + state.maxWidth;
			if (nextMin + (remainingMin[position + 1] ?? 0) > budget) {
				continue;
			}
			if (nextMax + (remainingMax[position + 1] ?? 0) < budget) {
				continue;
			}

			selected[columnIndex] = state;
			search(
				position + 1,
				nextMin,
				nextMax,
				mergeRowHeights(rowHeights, state.rowHeights)
			);
			selected[columnIndex] = undefined;
		}
	};

	search(
		0,
		0,
		0,
		Array.from({ length: rowCount }, () => 0)
	);
	return bestStates;
};

/**
 * Optimize the profile's column widths to fit `maxTableWidth` while minimizing
 * the number of physical lines emitted for the table.
 */
export const optimizeColumnWidths = (
	profile: DataProfile,
	config: TablemarkOptionsNormalized
): void => {
	if (config.maxTableWidth === Number.POSITIVE_INFINITY) {
		return;
	}
	if (
		!Number.isSafeInteger(config.maxTableWidth) ||
		config.maxTableWidth <= 0
	) {
		throw new RangeError("maxTableWidth must be a positive integer");
	}

	const columnCount = profile.widths.length;
	if (columnCount === 0) {
		return;
	}

	const budget = config.maxTableWidth - getTableOverhead(columnCount, config);
	if (sum(profile.widths) <= budget) {
		return;
	}

	const bounds = profile.widths.map((naturalWidth, columnIndex) => {
		const fixedWidth = config.columns[columnIndex]?.width;
		if (fixedWidth != null) {
			if (
				!Number.isSafeInteger(fixedWidth) ||
				fixedWidth < columnsMinimumWidth
			) {
				throw new RangeError(
					`Column ${columnIndex + 1} width must be an integer of at least ${columnsMinimumWidth}`
				);
			}
			return { minWidth: fixedWidth, maxWidth: fixedWidth };
		}

		return { minWidth: columnsMinimumWidth, maxWidth: naturalWidth };
	});

	if (sum(bounds.map(({ minWidth }) => minWidth)) > budget) {
		throw new RangeError(
			`maxTableWidth ${config.maxTableWidth} is too small for ${columnCount} columns`
		);
	}

	const statesByColumn = bounds.map(({ minWidth, maxWidth }, columnIndex) =>
		getColumnStates(profile, config, columnIndex, minWidth, maxWidth)
	);
	const seedWidths = allocateWidths(
		bounds.map(({ minWidth, maxWidth }) => ({
			minWidth,
			maxWidth,
			rowHeights: []
		})),
		budget,
		profile.widths
	);
	const seedStates = findStatesForWidths(statesByColumn, seedWidths);
	const bestStates = searchStates(statesByColumn, budget, seedStates);

	profile.widths = allocateWidths(bestStates, budget, profile.widths);
};
